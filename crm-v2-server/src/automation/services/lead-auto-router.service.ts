import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';
import { LeadSLA } from '../../leads/entities/lead-sla.entity';
import {
  LeadAssignmentProposal,
  AssignmentProposalStatus,
} from '../entities/lead-assignment-proposal.entity';
import { UserNotificationsService } from '../../notifications/user-notifications.service';
import { ComplianceSettingsService } from '../../settings/compliance-settings.service';
import { ActivityLogsService } from '../../activity-logs/activity-logs.service';
import {
  AUTOMATION_CRON,
  ROUTABLE_ROLES,
  ROUTER_BATCH_LIMIT,
  TERMINAL_LEAD_STATUSES,
} from '../automation.constants';

interface RoutableRep {
  id: string;
  name: string;
  territories: string[];
}

/**
 * #2 — Unassigned-lead auto-router, in its AUTO1/AUTO2 shape (owner
 * spec, 27 July meeting):
 *
 *   AUTO1 — the engine PROPOSES; a sales manager (or admin) approves
 *   before any lead changes hands. Nothing here writes assigned_to.
 *
 *   AUTO2 — routing is by LOCATION first: reps whose territory covers
 *   the lead's school province are preferred, and within that group the
 *   lead goes to whoever carries the fewest open leads, keeping counts
 *   even. With no territory match (or none configured) every routable
 *   rep competes on load alone.
 *
 * The engine stays opt-in behind the `auto_assign_enabled` compliance
 * setting. The SLA clock starts at APPROVAL time, when the assignment
 * becomes real.
 */
@Injectable()
export class LeadAutoRouterService {
  private readonly logger = new Logger(LeadAutoRouterService.name);

  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(LeadSLA)
    private readonly leadSlaRepository: Repository<LeadSLA>,
    @InjectRepository(LeadAssignmentProposal)
    private readonly proposalRepository: Repository<LeadAssignmentProposal>,
    private readonly dataSource: DataSource,
    private readonly userNotificationsService: UserNotificationsService,
    private readonly complianceSettings: ComplianceSettingsService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  @Cron(AUTOMATION_CRON.unassignedRouting)
  async handleUnassignedLeadRouting(): Promise<void> {
    try {
      // Engine is opt-in: admins / sales managers turn it on from the
      // Settings → Compliance & Controls page. When off, leads stay
      // unassigned for manual distribution.
      const enabled = await this.complianceSettings.getBoolean(
        'auto_assign_enabled',
      );
      if (!enabled) {
        return;
      }

      const reps = await this.getRoutableReps();
      if (reps.length === 0) {
        this.logger.warn(
          'Auto-router: no active routable reps found — skipping pass',
        );
        return;
      }

      // Current open-lead load per routable rep (for keeping counts even).
      const load = await this.getOpenLeadCountsByRep(reps.map((r) => r.id));

      // Leads with a pending proposal are already on the manager's desk.
      const pendingLeadIds = (
        await this.proposalRepository.find({
          where: { status: AssignmentProposalStatus.PENDING },
          select: ['lead_id'],
        })
      ).map((p) => p.lead_id);

      const qb = this.leadRepository
        .createQueryBuilder('lead')
        .leftJoinAndSelect('lead.school', 'school')
        .where('lead.assigned_to IS NULL')
        .andWhere('lead.deleted_at IS NULL')
        .andWhere('lead.status NOT IN (:...terminal)', {
          terminal: [...TERMINAL_LEAD_STATUSES],
        })
        .orderBy('lead.created_at', 'ASC')
        .limit(ROUTER_BATCH_LIMIT);
      if (pendingLeadIds.length) {
        qb.andWhere('lead.id NOT IN (:...pendingLeadIds)', { pendingLeadIds });
      }
      const unassigned = await qb.getMany();

      if (unassigned.length === 0) {
        return;
      }

      let proposed = 0;
      for (const lead of unassigned) {
        const pick = this.pickAssignee(reps, load, lead.school?.province);

        await this.proposalRepository.save(
          this.proposalRepository.create({
            lead_id: lead.id,
            proposed_rep_id: pick.rep.id,
            reason: pick.reason,
            status: AssignmentProposalStatus.PENDING,
          }),
        );
        // Count the proposal into the running load so one pass spreads
        // a batch evenly instead of stacking everything on one rep.
        load.set(pick.rep.id, (load.get(pick.rep.id) ?? 0) + 1);
        proposed++;
      }

      // One digest to the deciders, not one ping per lead.
      try {
        const managerIds = await this.getDeciderIds();
        if (managerIds.length && proposed > 0) {
          await this.userNotificationsService.sendToUsers({
            title: 'Lead assignments waiting for approval',
            message: `The auto-assign engine has ${proposed} suggested assignment(s) waiting for a manager to approve.`,
            severity: 'info',
            entity: 'Lead',
            entityId: 'auto-assign',
            dedupeKey: `lead-autoassign-digest-${new Date().toISOString().slice(0, 10)}`,
            actionUrl: '/leads?tab=assignment-proposals',
            userIds: managerIds,
          });
        }
      } catch {
        // Notification failure never blocks proposal creation.
      }

      this.logger.log(
        `Auto-router: proposed ${proposed} assignment(s) across ${reps.length} rep(s) — awaiting manager approval`,
      );
    } catch (error: any) {
      this.logger.error(
        `Auto-router pass failed: ${error?.message}`,
        error?.stack,
      );
    }
  }

  // ---------------------- proposal decisions ----------------------

  async listProposals(
    status: AssignmentProposalStatus = AssignmentProposalStatus.PENDING,
  ): Promise<LeadAssignmentProposal[]> {
    return this.proposalRepository.find({
      where: { status },
      relations: ['lead', 'lead.school', 'proposed_rep', 'decided_by'],
      order: { created_at: 'ASC' },
    });
  }

  /**
   * AUTO1: approval is the moment the assignment becomes real — the
   * lead gets its owner, the first-touch SLA clock starts, and the rep
   * is told. Skips (with SUPERSEDED) when someone assigned the lead by
   * hand while the proposal sat waiting.
   */
  async approveProposal(
    id: string,
    deciderId: string,
  ): Promise<LeadAssignmentProposal> {
    const proposal = await this.proposalRepository.findOne({
      where: { id },
      relations: ['lead'],
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== AssignmentProposalStatus.PENDING) {
      throw new BadRequestException(`Proposal is already ${proposal.status}`);
    }

    const lead = await this.leadRepository.findOne({
      where: { id: proposal.lead_id },
    });
    if (!lead || lead.assigned_to) {
      proposal.status = AssignmentProposalStatus.SUPERSEDED;
      proposal.decided_by_id = deciderId;
      proposal.decided_at = new Date();
      await this.proposalRepository.save(proposal);
      if (!lead) throw new NotFoundException('Lead no longer exists');
      throw new BadRequestException(
        'Lead was already assigned by hand — proposal marked superseded',
      );
    }

    const patch: Partial<Lead> = { assigned_to: proposal.proposed_rep_id };

    // First-touch SLA start: only set the clock if one isn't already
    // running, so we never extend an existing deadline.
    if (!lead.current_sla_due_date) {
      const slaByStatus = await this.getActiveSlaHoursByStatus();
      const slaHours = slaByStatus.get(lead.status as unknown as string);
      if (slaHours && slaHours > 0) {
        patch.current_sla_due_date = new Date(
          Date.now() + slaHours * 3_600_000,
        );
        patch.sla_breached = false;
      }
    }

    await this.leadRepository.update(lead.id, patch);

    proposal.status = AssignmentProposalStatus.APPROVED;
    proposal.decided_by_id = deciderId;
    proposal.decided_at = new Date();
    await this.proposalRepository.save(proposal);

    await this.activityLogsService.logUpdate(
      'Lead',
      lead.id,
      { assigned_to: null },
      { assigned_to: proposal.proposed_rep_id },
      deciderId,
      `Auto-assign proposal approved: ${proposal.reason}`,
    );

    try {
      await this.userNotificationsService.sendToUsers({
        title: 'New lead assigned to you',
        message: `Lead "${lead.lead_name}" was assigned to you (auto-assign, approved by a manager). Make first contact before the SLA expires.`,
        severity: 'info',
        entity: 'Lead',
        entityId: lead.id,
        dedupeKey: `lead-autoassign-${lead.id}`,
        actionUrl: `/leads/${lead.id}`,
        userIds: [proposal.proposed_rep_id],
      });
    } catch {
      // Notification failure never unwinds an approval.
    }

    return proposal;
  }

  async rejectProposal(
    id: string,
    deciderId: string,
  ): Promise<LeadAssignmentProposal> {
    const proposal = await this.proposalRepository.findOne({ where: { id } });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== AssignmentProposalStatus.PENDING) {
      throw new BadRequestException(`Proposal is already ${proposal.status}`);
    }
    proposal.status = AssignmentProposalStatus.REJECTED;
    proposal.decided_by_id = deciderId;
    proposal.decided_at = new Date();
    return this.proposalRepository.save(proposal);
  }

  /** Approve a batch in one call — the "looks right, take them all" path. */
  async approveProposals(
    ids: string[],
    deciderId: string,
  ): Promise<{ approved: number; skipped: Array<{ id: string; why: string }> }> {
    let approved = 0;
    const skipped: Array<{ id: string; why: string }> = [];
    for (const id of ids) {
      try {
        await this.approveProposal(id, deciderId);
        approved++;
      } catch (e: any) {
        skipped.push({ id, why: e?.message ?? 'failed' });
      }
    }
    return { approved, skipped };
  }

  // ---------------------------- routing ----------------------------

  /**
   * AUTO2: location beats load. Territory-matching reps (school
   * province ∈ rep territories) form the candidate pool; only when
   * nobody matches does the whole roster compete. Within the pool the
   * least-loaded rep wins, deterministic tie-break by id.
   */
  private pickAssignee(
    reps: RoutableRep[],
    load: Map<string, number>,
    schoolProvince?: string | null,
  ): { rep: RoutableRep; reason: string } {
    const province = (schoolProvince ?? '').trim().toLowerCase();
    const territorial = province
      ? reps.filter((r) =>
          r.territories.some((t) => t.trim().toLowerCase() === province),
        )
      : [];
    const pool = territorial.length ? territorial : reps;

    let best: RoutableRep | null = null;
    let bestCount = Number.POSITIVE_INFINITY;
    for (const rep of [...pool].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const count = load.get(rep.id) ?? 0;
      if (count < bestCount) {
        best = rep;
        bestCount = count;
      }
    }
    const rep = best as RoutableRep;

    const reason = territorial.length
      ? `${rep.name} covers ${schoolProvince} and carries the fewest open leads there (${bestCount})`
      : province
        ? `No rep covers ${schoolProvince}; ${rep.name} carries the fewest open leads overall (${bestCount})`
        : `Lead has no province on record; ${rep.name} carries the fewest open leads overall (${bestCount})`;

    return { rep, reason };
  }

  private async getRoutableReps(): Promise<RoutableRep[]> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('DISTINCT user.id', 'id')
      .addSelect('user.first_name', 'first_name')
      .addSelect('user.last_name', 'last_name')
      .addSelect('user.territory_provinces', 'territory_provinces')
      .from('users', 'user')
      .innerJoin('user_roles', 'ur', 'ur.user_id = user.id')
      .innerJoin('roles', 'role', 'role.id = ur.role_id')
      .where('role.name IN (:...roles)', { roles: [...ROUTABLE_ROLES] })
      .andWhere('user.is_active = :active', { active: true })
      .getRawMany<{
        id: string;
        first_name: string;
        last_name: string;
        territory_provinces: string | null;
      }>();
    return rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      territories: this.parseTerritories(r.territory_provinces),
    }));
  }

  private parseTerritories(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      // Tolerate a plain comma-separated list typed by hand.
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  private async getDeciderIds(): Promise<string[]> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('DISTINCT user.id', 'id')
      .from('users', 'user')
      .innerJoin('user_roles', 'ur', 'ur.user_id = user.id')
      .innerJoin('roles', 'role', 'role.id = ur.role_id')
      .where('role.name IN (:...roles)', {
        roles: ['admin', 'admin_support', 'sales_manager'],
      })
      .andWhere('user.is_active = :active', { active: true })
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  private async getOpenLeadCountsByRep(
    repIds: string[],
  ): Promise<Map<string, number>> {
    const load = new Map<string, number>(repIds.map((id) => [id, 0]));
    if (!repIds.length) return load;
    const rows = await this.leadRepository
      .createQueryBuilder('lead')
      .select('lead.assigned_to', 'rep')
      .addSelect('COUNT(*)', 'cnt')
      .where('lead.assigned_to IN (:...repIds)', { repIds })
      .andWhere('lead.deleted_at IS NULL')
      .andWhere('lead.status NOT IN (:...terminal)', {
        terminal: [...TERMINAL_LEAD_STATUSES],
      })
      .groupBy('lead.assigned_to')
      .getRawMany<{ rep: string; cnt: string }>();
    for (const r of rows) {
      load.set(r.rep, Number(r.cnt));
    }
    return load;
  }

  private async getActiveSlaHoursByStatus(): Promise<Map<string, number>> {
    const configs = await this.leadSlaRepository.find({
      where: { is_active: true },
    });
    return new Map(
      configs.map((c) => [c.status as unknown as string, c.sla_hours]),
    );
  }
}
