import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BugReport,
  BugSeverity,
  BugStatus,
  WorkType,
} from './entities/bug-report.entity';
import { User } from '../users/entities/user.entity';
import { UserNotificationsService } from '../notifications/user-notifications.service';
import {
  CreateBugReportDto,
  UpdateBugReportDto,
  QueryBugReportDto,
} from './dto/bug-report.dto';

/**
 * Roles that triage tickets: see everything, assign, change status.
 *
 * MGRBUG1 (owner request 2026-07-27): sales managers were added so they
 * can see the whole bug list and triage it, not just the tickets they
 * raised themselves. Reps still see only their own reports.
 */
export const TRIAGE_ROLES = [
  'admin',
  'admin_support',
  'sales_manager',
  'manager',
];

export interface RequestingUser {
  id: string;
  roles?: Array<{ name: string }>;
}

@Injectable()
export class BugReportsService {
  private readonly logger = new Logger(BugReportsService.name);

  constructor(
    @InjectRepository(BugReport)
    private readonly bugRepo: Repository<BugReport>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Optional()
    private readonly userNotifications?: UserNotificationsService,
  ) {}

  private roleNames(user: RequestingUser): string[] {
    return (user.roles ?? []).map((r) => r.name);
  }

  private isTriager(user: RequestingUser): boolean {
    return this.roleNames(user).some((r) => TRIAGE_ROLES.includes(r));
  }

  /** Active user ids holding any of the given role names. */
  private async userIdsWithRoles(roleNames: string[]): Promise<string[]> {
    const users = await this.userRepo
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role')
      .where('role.name IN (:...roleNames)', { roleNames })
      .andWhere('user.is_active = true')
      .select('user.id', 'id')
      .getRawMany<{ id: string }>();
    return [...new Set(users.map((u) => u.id))];
  }

  private severityToNotif(
    severity: BugSeverity,
  ): 'info' | 'warning' | 'error' {
    // very_critical is "drop everything" — it must map to the highest
    // notification band, not silently fall through to info (redesign
    // defect fix, 2026-08-02).
    if (
      severity === BugSeverity.VERY_CRITICAL ||
      severity === BugSeverity.CRITICAL
    )
      return 'error';
    if (severity === BugSeverity.HIGH) return 'warning';
    return 'info';
  }

  /**
   * Persisted notification helper. Errors are logged, never thrown — a
   * ticket write must not fail because a notification insert did.
   */
  private async notify(
    userIds: string[],
    title: string,
    message: string,
    bugId: string,
    severity: 'info' | 'success' | 'warning' | 'error' = 'info',
    dedupeKey?: string,
  ): Promise<void> {
    const targets = [...new Set(userIds)].filter(Boolean);
    if (!targets.length || !this.userNotifications) return;
    try {
      await this.userNotifications.sendToUsers({
        title,
        message: message.slice(0, 255),
        severity,
        channel: 'in-app',
        entity: 'BugReport',
        entityId: bugId,
        actionUrl: `/bug-reports?id=${bugId}`,
        ...(dedupeKey ? { dedupeKey } : {}),
        userIds: targets,
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to notify for bug report ${bugId}: ${error?.message}`,
      );
    }
  }

  async create(
    dto: CreateBugReportDto,
    reporterId: string,
  ): Promise<BugReport> {
    // Ownership (owner request, 2026-08-05): new tickets are auto-assigned to
    // the admin_support maintainer so the board never shows a blank owner.
    // The 2026-08-02 redesign had left new tickets UNASSIGNED to avoid a
    // non-deterministic "first active admin_support" — but there is a single
    // admin_support (the owner), so the choice IS deterministic and the board
    // stays honest. Triagers can still reassign explicitly; falls back to null
    // only if no active admin_support exists.
    const [maintainerId] = await this.userIdsWithRoles(['admin_support']);
    const bug = this.bugRepo.create({
      title: dto.title,
      description: dto.description,
      work_type: dto.workType ?? WorkType.BUG,
      severity: dto.severity ?? BugSeverity.MEDIUM,
      priority: dto.priority ?? null,
      component: dto.component ?? null,
      labels: dto.labels ?? [],
      status: BugStatus.OPEN,
      page_url: dto.pageUrl ?? null,
      reported_by_id: reporterId,
      assigned_to_id: maintainerId ?? null,
    });
    const saved = await this.bugRepo.save(bug);

    // Notify the triage team (owner + admins) that a new ticket landed.
    const triagers = await this.userIdsWithRoles(TRIAGE_ROLES);
    const reporter = await this.userRepo.findOne({
      where: { id: reporterId },
      select: ['id', 'first_name', 'last_name'],
    });
    const who = reporter
      ? `${reporter.first_name} ${reporter.last_name}`
      : 'A user';
    await this.notify(
      // Don't notify the reporter about their own report if they happen to
      // be a triager.
      triagers.filter((id) => id !== reporterId),
      `New bug report: ${dto.title}`,
      `${who} reported: ${dto.description}`,
      saved.id,
      this.severityToNotif(saved.severity),
    );

    return this.findOneRaw(saved.id);
  }

  private async findOneRaw(id: string): Promise<BugReport> {
    const bug = await this.bugRepo.findOne({
      where: { id },
      relations: ['reported_by', 'assigned_to'],
    });
    if (!bug) throw new NotFoundException('Bug report not found');
    return bug;
  }

  async findAll(
    query: QueryBugReportDto,
    user: RequestingUser,
  ): Promise<{ items: BugReport[]; total: number }> {
    const qb = this.bugRepo
      .createQueryBuilder('bug')
      .leftJoinAndSelect('bug.reported_by', 'reporter')
      .leftJoinAndSelect('bug.assigned_to', 'assignee')
      // Stable sort: created_at DESC with id DESC as a tiebreaker. Without
      // the id tiebreaker, rows sharing a timestamp had no defined order,
      // so paging could repeat or skip rows (redesign defect fix).
      .orderBy('bug.created_at', 'DESC')
      .addOrderBy('bug.id', 'DESC');

    this.applyFilters(qb, query, user);

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * Shared filter/visibility clause for list and counts, so both endpoints
   * scope identically. `qb` must already alias the table as `bug`.
   */
  private applyFilters(
    qb: import('typeorm').SelectQueryBuilder<BugReport>,
    query: QueryBugReportDto,
    user: RequestingUser,
  ): void {
    // Non-triagers only ever see the tickets they themselves reported.
    if (!this.isTriager(user)) {
      qb.andWhere('bug.reported_by_id = :uid', { uid: user.id });
    }
    if (query.status)
      qb.andWhere('bug.status = :status', { status: query.status });
    if (query.workType)
      qb.andWhere('bug.work_type = :workType', { workType: query.workType });
    if (query.severity)
      qb.andWhere('bug.severity = :severity', { severity: query.severity });
    if (query.priority)
      qb.andWhere('bug.priority = :priority', { priority: query.priority });
    if (query.component)
      qb.andWhere('bug.component = :component', { component: query.component });
    if (query.assignee) {
      if (query.assignee === 'unassigned') {
        qb.andWhere('bug.assigned_to_id IS NULL');
      } else {
        qb.andWhere('bug.assigned_to_id = :assignee', {
          assignee: query.assignee,
        });
      }
    }
    if (query.q?.trim()) {
      qb.andWhere('(bug.title ILIKE :q OR bug.description ILIKE :q)', {
        q: `%${query.q.trim()}%`,
      });
    }
  }

  /**
   * One counts call returning tallies by status AND by work_type, so the
   * client stops firing a separate request per status. Scoped exactly like
   * the list (non-triagers see only their own).
   */
  async counts(
    query: QueryBugReportDto,
    user: RequestingUser,
  ): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byWorkType: Record<string, number>;
  }> {
    const base = () => {
      const qb = this.bugRepo.createQueryBuilder('bug');
      this.applyFilters(qb, query, user);
      return qb;
    };

    const statusRows = await base()
      .select('bug.status', 'key')
      .addSelect('COUNT(*)', 'n')
      .groupBy('bug.status')
      .getRawMany<{ key: string; n: string }>();

    const typeRows = await base()
      .select('bug.work_type', 'key')
      .addSelect('COUNT(*)', 'n')
      .groupBy('bug.work_type')
      .getRawMany<{ key: string; n: string }>();

    const toMap = (rows: Array<{ key: string; n: string }>) =>
      rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.key] = Number(r.n);
        return acc;
      }, {});

    const byStatus = toMap(statusRows);
    const byWorkType = toMap(typeRows);
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return { total, byStatus, byWorkType };
  }

  async findOne(id: string, user: RequestingUser): Promise<BugReport> {
    const bug = await this.findOneRaw(id);
    if (!this.isTriager(user) && bug.reported_by_id !== user.id) {
      throw new ForbiddenException('You cannot view this bug report');
    }
    return bug;
  }

  /** Triagers only — enforced at the controller with @Roles. */
  async update(
    id: string,
    dto: UpdateBugReportDto,
    actor: RequestingUser,
  ): Promise<BugReport> {
    const bug = await this.findOneRaw(id);

    const prevAssignee = bug.assigned_to_id;
    const prevStatus = bug.status;

    // Apply the incoming resolution note first so the guard below sees it.
    if (dto.resolutionNote !== undefined)
      bug.resolution_note = dto.resolutionNote || null;

    if (dto.severity !== undefined) bug.severity = dto.severity;
    if (dto.workType !== undefined) bug.work_type = dto.workType;
    if (dto.priority !== undefined) bug.priority = dto.priority;
    if (dto.component !== undefined) bug.component = dto.component || null;
    if (dto.labels !== undefined) bug.labels = dto.labels;
    if (dto.status !== undefined) bug.status = dto.status;

    // Require a resolution/acceptance note before a ticket may enter
    // resolved / verification / done (redesign defect fix: the note used to
    // be optional even on close). Only enforced on the transition INTO one
    // of these states, so re-saving an already-solved ticket is unaffected.
    const needsNote = (s: BugStatus) =>
      s === BugStatus.RESOLVED ||
      s === BugStatus.VERIFICATION ||
      s === BugStatus.DONE;
    if (
      dto.status !== undefined &&
      dto.status !== prevStatus &&
      needsNote(dto.status) &&
      !bug.resolution_note?.trim()
    ) {
      throw new BadRequestException(
        'A resolution note is required to mark this item resolved, in verification, or done.',
      );
    }

    // Duplicate linkage.
    if (dto.duplicateOfId !== undefined) {
      if (dto.duplicateOfId) {
        if (dto.duplicateOfId === bug.id)
          throw new BadRequestException('A ticket cannot duplicate itself.');
        const target = await this.bugRepo.findOne({
          where: { id: dto.duplicateOfId },
          select: ['id'],
        });
        if (!target)
          throw new NotFoundException('Duplicate-of ticket not found');
        bug.duplicate_of_id = target.id;
      } else {
        bug.duplicate_of_id = null;
      }
    }

    // Rewording. Blank strings are ignored rather than wiping the ticket.
    if (dto.title?.trim()) bug.title = dto.title.trim();
    if (dto.description?.trim()) bug.description = dto.description.trim();

    // Date-solved bookkeeping (legacy resolved_at kept for the UI): stamp on
    // entering a solved state, clear on reopening. `done` joins resolved and
    // closed as a solved state now that the lifecycle is honest.
    const isSolved = (s: BugStatus) =>
      s === BugStatus.RESOLVED ||
      s === BugStatus.CLOSED ||
      s === BugStatus.DONE;
    if (isSolved(bug.status) && !isSolved(prevStatus)) {
      bug.resolved_at = new Date();
    } else if (!isSolved(bug.status) && isSolved(prevStatus)) {
      bug.resolved_at = null;
    }

    // Lifecycle stamps — each set once, when the ticket first reaches the
    // phase; never overwritten so the first transition time is preserved.
    if (bug.status !== prevStatus) {
      const now = new Date();
      const terminal: BugStatus[] = [
        BugStatus.CLOSED,
        BugStatus.DONE,
        BugStatus.DUPLICATE,
        BugStatus.CANCELLED,
        BugStatus.WONT_DO,
      ];
      if (bug.status === BugStatus.IN_PROGRESS && !bug.started_at)
        bug.started_at = now;
      if (
        (bug.status === BugStatus.VERIFICATION ||
          bug.status === BugStatus.DONE) &&
        !bug.verified_at
      )
        bug.verified_at = now;
      if (terminal.includes(bug.status) && !bug.closed_at) bug.closed_at = now;
      // Any move off the untriaged `open` state is a triage action.
      if (prevStatus === BugStatus.OPEN && !bug.triaged_at)
        bug.triaged_at = now;
    }
    // Setting a priority is itself a triage action.
    if (dto.priority !== undefined && dto.priority !== null && !bug.triaged_at)
      bug.triaged_at = new Date();

    if (dto.assignedToId !== undefined) {
      if (dto.assignedToId) {
        const assignee = await this.userRepo.findOne({
          where: { id: dto.assignedToId, is_active: true },
        });
        if (!assignee)
          throw new NotFoundException('Assignee not found or inactive');
        bug.assigned_to_id = assignee.id;
      } else {
        bug.assigned_to_id = null;
      }
    }

    const saved = await this.bugRepo.save(bug);

    // Notify a newly-assigned person that a ticket is now theirs.
    if (
      saved.assigned_to_id &&
      saved.assigned_to_id !== prevAssignee &&
      saved.assigned_to_id !== actor.id
    ) {
      await this.notify(
        [saved.assigned_to_id],
        `Bug report assigned to you: ${saved.title}`,
        saved.description,
        saved.id,
        this.severityToNotif(saved.severity),
        `bug-assign-${saved.id}-${saved.assigned_to_id}`,
      );
    }

    // Tell the reporter when their ticket is resolved/closed.
    if (
      saved.status !== prevStatus &&
      (saved.status === BugStatus.RESOLVED ||
        saved.status === BugStatus.CLOSED) &&
      saved.reported_by_id !== actor.id
    ) {
      await this.notify(
        [saved.reported_by_id],
        `Your bug report was ${saved.status === BugStatus.RESOLVED ? 'resolved' : 'closed'}: ${saved.title}`,
        saved.resolution_note || 'The team has updated your report.',
        saved.id,
        'success',
        `bug-${saved.status}-${saved.id}`,
      );
    }

    // Announce a FIX to the whole team (Ms Mpofu's request): when something
    // is repaired, everyone should know, not just the person who raised it.
    //
    // Resolved only — "closed" also covers won't-fix and duplicates, and
    // announcing those to everyone is noise rather than news. The reporter
    // and the person doing the triage are skipped: the reporter already
    // gets the more personal message above, and the actor just did it.
    if (
      saved.status !== prevStatus &&
      saved.status === BugStatus.RESOLVED
    ) {
      const audience = (await this.activeUserIds()).filter(
        (uid) => uid !== actor.id && uid !== saved.reported_by_id,
      );
      await this.notify(
        audience,
        `Fixed: ${saved.title}`,
        saved.resolution_note || 'This has been fixed and is now live.',
        saved.id,
        'success',
        `bug-announce-${saved.id}`,
      );
    }

    return this.findOneRaw(saved.id);
  }

  /** Everyone who can be told about a fix. */
  private async activeUserIds(): Promise<string[]> {
    const users = await this.userRepo.find({
      where: { is_active: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /** Active users a ticket can be assigned to (id + name), for the picker. */
  async assignableUsers(): Promise<
    Array<{ id: string; name: string; email: string }>
  > {
    const users = await this.userRepo.find({
      where: { is_active: true },
      select: ['id', 'first_name', 'last_name', 'email'],
      order: { first_name: 'ASC' },
    });
    return users.map((u) => ({
      id: u.id,
      name: `${u.first_name} ${u.last_name}`.trim(),
      email: u.email,
    }));
  }
}
