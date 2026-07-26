import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BugReport,
  BugSeverity,
  BugStatus,
} from './entities/bug-report.entity';
import { User } from '../users/entities/user.entity';
import { UserNotificationsService } from '../notifications/user-notifications.service';
import {
  CreateBugReportDto,
  UpdateBugReportDto,
  QueryBugReportDto,
} from './dto/bug-report.dto';

/** Roles that triage tickets: see everything, assign, change status. */
export const TRIAGE_ROLES = ['admin', 'admin_support'];

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
    if (severity === BugSeverity.CRITICAL) return 'error';
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
    // New reports are tasked to the maintainer by default: they land on
    // admin_support's triage page anyway, so the record should carry
    // their name instead of "Unassigned" (owner request, 2026-07-26).
    // If no active admin_support user exists it stays unassigned.
    const [maintainerId] = await this.userIdsWithRoles(['admin_support']);

    const bug = this.bugRepo.create({
      title: dto.title,
      description: dto.description,
      severity: dto.severity ?? BugSeverity.MEDIUM,
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
      .orderBy('bug.created_at', 'DESC');

    // Non-triagers only ever see the tickets they themselves reported.
    if (!this.isTriager(user)) {
      qb.andWhere('bug.reported_by_id = :uid', { uid: user.id });
    }
    if (query.status) qb.andWhere('bug.status = :status', { status: query.status });
    if (query.severity)
      qb.andWhere('bug.severity = :severity', { severity: query.severity });

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
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

    if (dto.severity !== undefined) bug.severity = dto.severity;
    if (dto.status !== undefined) bug.status = dto.status;

    // Date-solved bookkeeping: stamp on entering resolved/closed, clear on
    // reopening. Re-saving an already-solved ticket keeps the original date.
    const isSolved = (s: BugStatus) =>
      s === BugStatus.RESOLVED || s === BugStatus.CLOSED;
    if (isSolved(bug.status) && !isSolved(prevStatus)) {
      bug.resolved_at = new Date();
    } else if (!isSolved(bug.status) && isSolved(prevStatus)) {
      bug.resolved_at = null;
    }
    if (dto.resolutionNote !== undefined)
      bug.resolution_note = dto.resolutionNote || null;
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
