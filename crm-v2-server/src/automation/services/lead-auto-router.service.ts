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
import { addBusinessHours } from '../../common/utils/business-hours';
import {
  AUTOMATION_CRON,
  ROUTABLE_ROLES,
  DEFAULT_BATCH_LIMIT,
  TERMINAL_LEAD_STATUSES,
} from '../automation.constants';

/** A person the engine may propose leads to. */
interface Recipient {
  id: string;
  name: string;
  /** 'rep' or 'manager' — the fairness cohort they are balanced within. */
  cohort: 'rep' | 'manager';
  territories: string[];
}

/** Per-person outcome of a distribution run, for the "will gain X" preview. */
export interface DistributionPreviewRow {
  rep_id: string;
  name: string;
  cohort: 'rep' | 'manager';
  current: number;
  will_gain: number;
  new_total: number;
}

export interface DistributionResult {
  proposed: number;
  /** Leads that had no eligible recipient (e.g. everyone at the cap). */
  skipped: number;
  preview: DistributionPreviewRow[];
}

/**
 * #2 — Unassigned-lead auto-router, in its AUTO1/AUTO2 shape (owner
 * spec, 27 July meeting):
 *
 *   AUTO1 — the engine PROPOSES; a sales manager (or admin) approves
 *   before any lead changes hands. Nothing here writes assigned_to.
 *
 *   AUTO2 — routing is by TERRITORY, a HARD filter (Mr Dube, 30 July:
 *   "Manake does not get Mashonaland"). A lead only goes to a rep whose
 *   territory covers its school province; within that group it goes to
 *   whoever carries the fewest open leads. A lead is NEVER routed out of
 *   territory to balance load — if no rep covers its province (or it has
 *   none) it is left unassigned for a manager to place by hand.
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

  /**
   * Automatic background pass. Stays opt-in behind the
   * `auto_assign_enabled` compliance setting (OFF in production). When on,
   * it runs the same distribution as the manual button. Either way it only
   * PROPOSES — a manager still approves before any lead changes hands.
   */
  @Cron(AUTOMATION_CRON.unassignedRouting)
  async handleUnassignedLeadRouting(): Promise<void> {
    try {
      const enabled = await this.complianceSettings.getBoolean(
        'auto_assign_enabled',
      );
      if (!enabled) return;
      await this.runDistribution(undefined, DEFAULT_BATCH_LIMIT);
    } catch (error: any) {
      this.logger.error(
        `Auto-router pass failed: ${error?.message}`,
        error?.stack,
      );
    }
  }

  /**
   * The distribution run — the work behind the manager's "Run auto-assign"
   * button. Gauges each recipient's current load, walks the pool of
   * distributable leads (unassigned, never worked, not disqualified), and
   * writes a PENDING proposal for each. Nothing is assigned here; the
   * manager approves from the Approval Queue.
   *
   * Allocation (Mr Dube, 30 July — territory is a HARD filter):
   *   1. Territory first and only — a lead goes only to a rep whose
   *      territory covers its province. Never out of territory.
   *   2. Fairness within territory — when more than one rep covers the
   *      province, the lightest-loaded of them gets the lead.
   *   3. No coverage (or no province) — the lead is skipped and left
   *      unassigned for a manager to place by hand.
   *
   * @param limit How many leads to distribute this run (the manager's
   *   batch choice); null = all distributable leads.
   */
  async runDistribution(
    triggeredById?: string,
    limit: number | null = null,
  ): Promise<DistributionResult> {
    const recipients = await this.getRecipients();
    if (recipients.length === 0) {
      this.logger.warn(
        'Auto-assign: no active reps with a territory configured — nothing to do',
      );
      return { proposed: 0, skipped: 0, preview: [] };
    }

    const startLoad = await this.getOpenLeadCounts(recipients.map((r) => r.id));
    const load = new Map(startLoad); // running load, mutated as we propose
    const gained = new Map<string, number>(
      recipients.map((r) => [r.id, 0]),
    );

    const pool = await this.getDistributablePool(limit);

    let proposed = 0;
    let skipped = 0;
    for (const lead of pool) {
      const pick = this.allocate(recipients, load, lead.school?.province);
      if (!pick) {
        skipped++;
        continue;
      }
      await this.proposalRepository.save(
        this.proposalRepository.create({
          lead_id: lead.id,
          proposed_rep_id: pick.recipient.id,
          reason: pick.reason,
          status: AssignmentProposalStatus.PENDING,
        }),
      );
      load.set(pick.recipient.id, (load.get(pick.recipient.id) ?? 0) + 1);
      gained.set(pick.recipient.id, (gained.get(pick.recipient.id) ?? 0) + 1);
      proposed++;
    }

    const preview: DistributionPreviewRow[] = recipients
      .map((r) => ({
        rep_id: r.id,
        name: r.name,
        cohort: r.cohort,
        current: startLoad.get(r.id) ?? 0,
        will_gain: gained.get(r.id) ?? 0,
        new_total: load.get(r.id) ?? 0,
      }))
      .sort((a, b) => b.will_gain - a.will_gain);

    if (proposed > 0) {
      try {
        const managerIds = await this.getDeciderIds();
        if (managerIds.length) {
          await this.userNotificationsService.sendToUsers({
            title: 'Lead assignments waiting for approval',
            message: `Auto-assign has ${proposed} suggested assignment(s) waiting for a manager to approve.`,
            severity: 'info',
            entity: 'Lead',
            entityId: 'auto-assign',
            dedupeKey: `lead-autoassign-digest-${triggeredById ?? 'cron'}`,
            actionUrl: '/leads?tab=assignment-proposals',
            userIds: managerIds,
          });
        }
      } catch {
        // Notification failure never blocks proposal creation.
      }
    }

    this.logger.log(
      `Auto-assign: proposed ${proposed}, skipped ${skipped}, across ${recipients.length} recipient(s) — awaiting approval`,
    );
    return { proposed, skipped, preview };
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
        // SLAW1: the SLA clock pauses over weekends.
        patch.current_sla_due_date = addBusinessHours(new Date(), slaHours);
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
   * Choose a recipient for one lead. Returns null only when every
   * recipient is at the fairness cap (nothing can take another lead
   * without breaking a cohort's gap).
   *
   * `load` is the running load (starting counts + proposals made so far),
   * so a single run spreads a batch evenly rather than stacking it.
   */
  private allocate(
    recipients: Recipient[],
    load: Map<string, number>,
    schoolProvince?: string | null,
  ): { recipient: Recipient; reason: string } | null {
    const province = (schoolProvince ?? '').trim().toLowerCase();

    const leastLoaded = (pool: Recipient[]): Recipient | null => {
      let best: Recipient | null = null;
      let bestCount = Number.POSITIVE_INFINITY;
      for (const r of [...pool].sort((a, b) => (a.id < b.id ? -1 : 1))) {
        const count = load.get(r.id) ?? 0;
        if (count < bestCount) {
          best = r;
          bestCount = count;
        }
      }
      return best;
    };

    // Territory is a HARD filter (Mr Dube, 30 July: "Manake does not get
    // Mashonaland"). A lead only goes to a rep whose territory covers its
    // province — never out of territory to balance load.
    const territorial = province
      ? recipients.filter((r) =>
          r.territories.some((t) => t.trim().toLowerCase() === province),
        )
      : [];

    // No province, or no rep covers it → not auto-assignable. Skip it; the
    // lead stays unassigned for a manager to place by hand (it shows in the
    // run as a skip, and is never forced onto the wrong rep).
    if (territorial.length === 0) return null;

    // Fairness applies ONLY among the reps who share this territory: give the
    // lead to the lightest-loaded of them.
    const chosen = leastLoaded(territorial);
    if (!chosen) return null;

    const count = load.get(chosen.id) ?? 0;
    const reason =
      territorial.length > 1
        ? `${chosen.name} covers ${schoolProvince} and is the lightest-loaded of the ${territorial.length} reps who cover it (${count} open)`
        : `${chosen.name} covers ${schoolProvince} (${count} open)`;
    return { recipient: chosen, reason };
  }

  /**
   * Recipients = active SALES REPS who have a territory configured.
   * Territory is the opt-in: no territory, no auto-assigned leads.
   * Managers are excluded — they approve and reassign, they don't receive
   * auto-distributed leads (Kim, 29 July). All recipients are one 'rep'
   * cohort, balanced against each other by the fairness gap.
   */
  private async getRecipients(): Promise<Recipient[]> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('user.id', 'id')
      .distinct(true)
      .addSelect('user.first_name', 'first_name')
      .addSelect('user.last_name', 'last_name')
      .addSelect('user.territory_provinces', 'territory_provinces')
      .from('users', 'user')
      .innerJoin('user_roles', 'ur', 'ur.user_id = user.id')
      .innerJoin('roles', 'role', 'role.id = ur.role_id')
      .where('role.name IN (:...roles)', { roles: [...ROUTABLE_ROLES] })
      .andWhere('user.is_active = :active', { active: true })
      .andWhere('user.territory_provinces IS NOT NULL')
      .getRawMany<{
        id: string;
        first_name: string;
        last_name: string;
        territory_provinces: string | null;
      }>();
    return rows
      .map((r) => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`.trim(),
        cohort: 'rep' as const,
        territories: this.parseTerritories(r.territory_provinces),
      }))
      .filter((r) => r.territories.length > 0);
  }

  /**
   * The distributable pool: unassigned leads that have never been worked
   * (no activity at all) and are not disqualified/converted or already
   * sitting on the manager's desk as a pending proposal.
   *
   * @param limit The manager's batch choice; null = all such leads.
   */
  private async getDistributablePool(limit: number | null): Promise<Lead[]> {
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
      // "No activity yet" — a lead with any activity has been picked up.
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM activities a WHERE a.lead_id = lead.id)',
      )
      .orderBy('lead.created_at', 'ASC');
    if (typeof limit === 'number' && limit > 0) {
      qb.limit(limit);
    }
    if (pendingLeadIds.length) {
      qb.andWhere('lead.id NOT IN (:...pendingLeadIds)', { pendingLeadIds });
    }
    return qb.getMany();
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

  /**
   * Current open-lead load per recipient — open meaning not deleted and
   * not disqualified/converted (the owner's rule: disqualified leads
   * don't count toward a person's load).
   */
  private async getOpenLeadCounts(
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
