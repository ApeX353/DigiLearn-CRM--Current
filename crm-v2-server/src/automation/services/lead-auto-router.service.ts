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
import { DuplicateDetectionService } from '../../leads/services/duplicate-detection.service';
import { addBusinessHours } from '../../common/utils/business-hours';
import {
  AUTOMATION_CRON,
  ROUTABLE_ROLES,
  DEFAULT_BATCH_LIMIT,
  TERMINAL_LEAD_STATUSES,
  FAIRNESS_GAP,
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

/** One side of a rebalance, before/after the move. */
export interface RebalanceSide {
  id: string;
  name: string;
  before: number;
  after: number;
}

/** Outcome of a manager rebalance (or its preview). */
export interface RebalanceResult {
  /** true = "will move X" preview, nothing written. */
  preview: boolean;
  moved: number;
  from: RebalanceSide;
  to: RebalanceSide;
  lead_ids: string[];
  /** Set when moved = 0, explaining why (already even, or gap cap). */
  note?: string;
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
    private readonly duplicateDetection: DuplicateDetectionService,
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
    campaignId: string | null = null,
  ): Promise<DistributionResult> {
    const includeManagers = await this.complianceSettings.getBoolean(
      'auto_assign_include_managers',
    );
    const managerCap = await this.complianceSettings.getNumber(
      'manager_lead_cap',
    );
    const recipients = await this.getRecipients(includeManagers);
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

    const pool = await this.getDistributablePool(limit, campaignId);

    let proposed = 0;
    let skipped = 0;
    // Build all proposals first, then bulk-insert. Saving one row at a time
    // meant hundreds of round-trips and froze the "Run auto-assign" request.
    const toSave: LeadAssignmentProposal[] = [];
    for (const lead of pool) {
      const pick = this.allocate(
        recipients,
        load,
        lead.school?.province,
        managerCap,
      );
      if (!pick) {
        skipped++;
        continue;
      }
      toSave.push(
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
    // Chunked bulk insert (keeps each statement a sane size).
    for (let i = 0; i < toSave.length; i += 200) {
      await this.proposalRepository.save(toSave.slice(i, i + 200));
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
    // R1: never surface a proposal whose lead is gone. INNER JOIN drops
    // proposals whose lead row was hard-removed; the deleted_at guard drops
    // soft-deleted leads (e.g. purged test imports). Without this the queue
    // showed the raw lead id — reading as a bare "school ID" — for every
    // proposal left orphaned by a lead deletion.
    return this.proposalRepository
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.lead', 'lead')
      .andWhere('lead.deleted_at IS NULL')
      .leftJoinAndSelect('lead.school', 'school')
      .leftJoinAndSelect('p.proposed_rep', 'proposed_rep')
      .leftJoinAndSelect('p.decided_by', 'decided_by')
      .where('p.status = :status', { status })
      .orderBy('p.created_at', 'ASC')
      .getMany();
  }

  /**
   * R2 — the per-rep current→projected strip that sits above the queue.
   * For every rep who has a pending proposal (whose lead still exists /
   * isn't soft-deleted), report their current open load, how many pending
   * proposals point at them, and the projected total if all were approved.
   * Reuses getOpenLeadCounts + a group-by on pending proposals joined to
   * non-deleted leads. Sorted by projected desc.
   */
  async getQueueProjection(): Promise<
    Array<{
      rep_id: string;
      name: string;
      current: number;
      pending: number;
      projected: number;
    }>
  > {
    const pendingRows = await this.proposalRepository
      .createQueryBuilder('p')
      .innerJoin('p.lead', 'lead')
      .select('p.proposed_rep_id', 'rep')
      .addSelect('COUNT(*)', 'cnt')
      .where('p.status = :status', {
        status: AssignmentProposalStatus.PENDING,
      })
      .andWhere('lead.deleted_at IS NULL')
      .groupBy('p.proposed_rep_id')
      .getRawMany<{ rep: string; cnt: string }>();

    const repIds = pendingRows.map((r) => r.rep);
    if (repIds.length === 0) return [];

    const [names, current] = await Promise.all([
      this.getUserNames(repIds),
      this.getOpenLeadCounts(repIds),
    ]);

    return pendingRows
      .map((r) => {
        const pending = Number(r.cnt);
        const cur = current.get(r.rep) ?? 0;
        return {
          rep_id: r.rep,
          name: names.get(r.rep) || r.rep.slice(0, 8),
          current: cur,
          pending,
          projected: cur + pending,
        };
      })
      .sort((a, b) => b.projected - a.projected);
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
    overrideRepId?: string,
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

    // Redirect (TEST-BACKLOG #5): a manager may override the engine's pick and
    // assign the lead to a rep they choose, right from the queue.
    if (overrideRepId && overrideRepId !== proposal.proposed_rep_id) {
      proposal.reason = `Redirected by a manager (engine suggested a different rep). Original: ${proposal.reason}`;
      proposal.proposed_rep_id = overrideRepId;
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

  /**
   * UNDO — reverse an approval a manager just made (Kim, 4 Aug). An approval
   * assigns the lead and starts the first-touch SLA clock; undo puts both
   * back exactly as they were and returns the proposal to PENDING so it
   * reappears in the queue. Guarded so it can never strip a lead a rep has
   * started on:
   *  - only an APPROVED proposal can be undone;
   *  - never touch a lead that has ANY activity (a rep has worked it) — an
   *    auto-assigned lead starts with none, so any activity means hands-off;
   *  - never touch a lead whose owner was changed by hand after approval.
   * Per-row try/catch so one failure is a skip, not a batch abort.
   */
  async undoApprovals(
    ids: string[],
    deciderId: string,
  ): Promise<{ undone: number; skipped: Array<{ id: string; why: string }> }> {
    let undone = 0;
    const skipped: Array<{ id: string; why: string }> = [];
    for (const id of ids) {
      try {
        const proposal = await this.proposalRepository.findOne({
          where: { id },
          relations: ['lead'],
        });
        if (!proposal) {
          skipped.push({ id, why: 'proposal not found' });
          continue;
        }
        if (proposal.status !== AssignmentProposalStatus.APPROVED) {
          skipped.push({ id, why: 'not an approved proposal' });
          continue;
        }

        const lead = await this.leadRepository.findOne({
          where: { id: proposal.lead_id },
        });
        if (!lead) {
          skipped.push({ id, why: 'lead no longer exists' });
          continue;
        }

        // SAFETY: any activity means a rep has already touched this lead — an
        // auto-assigned lead starts with none, so never strip a worked lead.
        // EXISTS check by lead_id, same style as the distributable pool.
        const worked = await this.leadRepository
          .createQueryBuilder('lead')
          .where('lead.id = :id', { id: lead.id })
          .andWhere(
            'EXISTS (SELECT 1 FROM activities a WHERE a.lead_id = lead.id)',
          )
          .getCount();
        if (worked > 0) {
          skipped.push({ id, why: 'lead already worked' });
          continue;
        }

        // SAFETY: someone changed the owner by hand after approval — leave it.
        if (lead.assigned_to !== proposal.proposed_rep_id) {
          skipped.push({ id, why: 'reassigned by hand' });
          continue;
        }

        const repId = proposal.proposed_rep_id;
        await this.dataSource.transaction(async (mgr) => {
          // Put the lead back: unassign and clear the first-touch SLA the
          // approval started (never leave a phantom deadline running).
          await mgr.getRepository(Lead).update(lead.id, {
            assigned_to: null,
            current_sla_due_date: null,
            sla_breached: false,
          });
          // Return the proposal to the queue as if never decided.
          proposal.status = AssignmentProposalStatus.PENDING;
          proposal.decided_by_id = null;
          proposal.decided_at = null;
          await mgr.getRepository(LeadAssignmentProposal).save(proposal);
        });

        await this.activityLogsService.logUpdate(
          'Lead',
          lead.id,
          { assigned_to: repId },
          { assigned_to: null },
          deciderId,
          'Auto-assign approval undone',
        );
        undone++;
      } catch (e: any) {
        skipped.push({ id, why: e?.message ?? 'failed' });
      }
    }
    return { undone, skipped };
  }

  /**
   * R4/R8 — reject a batch in one call, mirroring approveProposals: per-id
   * try/catch so one already-decided (or missing) proposal never aborts the
   * rest. Returns how many were rejected and which were skipped and why.
   */
  async rejectProposals(
    ids: string[],
    deciderId: string,
  ): Promise<{ rejected: number; skipped: Array<{ id: string; why: string }> }> {
    let rejected = 0;
    const skipped: Array<{ id: string; why: string }> = [];
    for (const id of ids) {
      try {
        await this.rejectProposal(id, deciderId);
        rejected++;
      } catch (e: any) {
        skipped.push({ id, why: e?.message ?? 'failed' });
      }
    }
    return { rejected, skipped };
  }

  /**
   * R5 — redirect a REJECTED suggestion to a manager-chosen rep/manager,
   * turning the reject into an approval. Assigns the lead, starts the
   * first-touch SLA clock only if one isn't already running (mirrors
   * approveProposal), marks the proposal approved with a "redirected after
   * reject" reason and audit-logs. Unlike approveProposal this deliberately
   * works from a non-pending (rejected) status.
   */
  async redirectProposal(
    id: string,
    repId: string,
    deciderId: string,
  ): Promise<LeadAssignmentProposal> {
    if (!repId) {
      throw new BadRequestException('Pick a rep to redirect this lead to');
    }
    const proposal = await this.proposalRepository.findOne({ where: { id } });
    if (!proposal) throw new NotFoundException('Proposal not found');

    const lead = await this.leadRepository.findOne({
      where: { id: proposal.lead_id },
    });
    if (!lead) throw new NotFoundException('Lead no longer exists');
    if (lead.assigned_to) {
      throw new BadRequestException(
        'Lead is already assigned by hand — nothing to redirect',
      );
    }

    const patch: Partial<Lead> = { assigned_to: repId };
    // First-touch SLA start: only set the clock if one isn't already running.
    if (!lead.current_sla_due_date) {
      const slaByStatus = await this.getActiveSlaHoursByStatus();
      const slaHours = slaByStatus.get(lead.status as unknown as string);
      if (slaHours && slaHours > 0) {
        patch.current_sla_due_date = addBusinessHours(new Date(), slaHours);
        patch.sla_breached = false;
      }
    }
    await this.leadRepository.update(lead.id, patch);

    proposal.status = AssignmentProposalStatus.APPROVED;
    proposal.proposed_rep_id = repId;
    proposal.reason = `Redirected after reject to a manager-chosen rep. Original: ${proposal.reason}`;
    proposal.decided_by_id = deciderId;
    proposal.decided_at = new Date();
    await this.proposalRepository.save(proposal);

    await this.activityLogsService.logUpdate(
      'Lead',
      lead.id,
      { assigned_to: null },
      { assigned_to: repId },
      deciderId,
      'Auto-assign suggestion redirected after reject',
    );

    try {
      await this.userNotificationsService.sendToUsers({
        title: 'New lead assigned to you',
        message: `Lead "${lead.lead_name}" was redirected to you by a manager. Make first contact before the SLA expires.`,
        severity: 'info',
        entity: 'Lead',
        entityId: lead.id,
        dedupeKey: `lead-autoassign-${lead.id}`,
        actionUrl: `/leads/${lead.id}`,
        userIds: [repId],
      });
    } catch {
      // Notification failure never unwinds a redirect.
    }

    return proposal;
  }

  /**
   * R5 — send a rejected suggestion's lead back to the New Leads pool: clear
   * its owner, reset its status to 'New', mark the proposal superseded, and
   * re-run duplicate detection now the lead is unowned again. The dup call is
   * best-effort (wrapped in try/catch) so it never unwinds the status change.
   */
  async sendProposalToNewLeads(
    id: string,
    deciderId: string,
  ): Promise<LeadAssignmentProposal> {
    const proposal = await this.proposalRepository.findOne({ where: { id } });
    if (!proposal) throw new NotFoundException('Proposal not found');

    const lead = await this.leadRepository.findOne({
      where: { id: proposal.lead_id },
    });
    if (!lead) throw new NotFoundException('Lead no longer exists');

    const before = { status: lead.status, assigned_to: lead.assigned_to };
    const patch: Partial<Lead> = { status: 'New', assigned_to: null };
    await this.leadRepository.update(lead.id, patch);

    proposal.status = AssignmentProposalStatus.SUPERSEDED;
    proposal.reason = `Sent back to New Leads after reject. Original: ${proposal.reason}`;
    proposal.decided_by_id = deciderId;
    proposal.decided_at = new Date();
    await this.proposalRepository.save(proposal);

    // Re-scan for duplicates now the lead is back in the New pool. Best-effort:
    // a detection failure must never unwind the status change above.
    try {
      await this.runDuplicateDetectionForLead(lead.id, deciderId);
    } catch (error: any) {
      this.logger.warn(
        `Duplicate detection failed for lead ${lead.id} after send-to-new-leads: ${error?.message}`,
      );
    }

    await this.activityLogsService.logUpdate(
      'Lead',
      lead.id,
      before,
      { status: 'New', assigned_to: null },
      deciderId,
      'Auto-assign suggestion rejected → lead sent back to New Leads',
    );

    return proposal;
  }

  /**
   * Per-lead duplicate re-scan, mirroring the inner loop of
   * DuplicateDetectionService.rebuildLeadSuspicions: peek the lead against
   * the book and, if a strong-enough candidate exists, record a pending
   * suspicion for a manager to review. recordSuspicion de-dupes pending
   * pairs, so re-running is safe.
   */
  private async runDuplicateDetectionForLead(
    leadId: string,
    raisedById?: string | null,
  ): Promise<void> {
    const lead = await this.leadRepository.findOne({
      where: { id: leadId },
      relations: ['primary_contact'],
    });
    if (!lead) return;
    const pc = (
      lead as { primary_contact?: { phone?: string; email?: string } }
    ).primary_contact;
    const candidates = await this.duplicateDetection.peekLead({
      lead_name: lead.lead_name,
      school_id: lead.school_id,
      primary_contact_id: lead.primary_contact_id,
      phone: pc?.phone ?? null,
      email: pc?.email ?? null,
    });
    const top = candidates.find((c) => c.record.id !== lead.id);
    if (top) {
      await this.duplicateDetection.recordSuspicion({
        record_type: 'lead',
        new_record_id: lead.id,
        existing_record_id: top.record.id,
        score: top.score,
        signals: top.signals,
        raised_by_id: raisedById ?? null,
      });
    }
  }

  // --------------------------- rebalance ---------------------------

  /**
   * Manager rebalance (Kim, 30 July): even out load by moving a batch of
   * leads from one rep to another. Unlike auto-assign this is a DELIBERATE
   * manual action and is CROSS-TERRITORY ALLOWED (owner decision, 3 Aug):
   * a manager may move leads between ANY two reps — the territory hard
   * filter that governs auto-distribution does not bind a hand-driven move.
   *
   * Guardrails that stay:
   *  - Never moves terminal (Disqualified/Converted) or deleted leads.
   *  - Prefers UNWORKED leads first (no activity), so a rep never loses a
   *    lead they have already started a relationship with unless the chosen
   *    count needs them.
   *  - Respects the fairness gap: caps the move so `to` never ends up more
   *    than FAIRNESS_GAP leads ahead of `from`.
   *  - preview:true computes the move without writing (the "will move X" check).
   *
   * The receiving rep's first-touch SLA clock starts on a moved lead only if
   * one is not already running (never extends an existing deadline), mirroring
   * proposal approval.
   */
  async rebalance(opts: {
    fromRepId: string;
    toRepId: string;
    count?: number | null;
    deciderId: string;
    preview?: boolean;
  }): Promise<RebalanceResult> {
    const { fromRepId, toRepId, deciderId } = opts;
    if (!fromRepId || !toRepId || fromRepId === toRepId) {
      throw new BadRequestException(
        'Pick two different reps to rebalance between',
      );
    }
    const names = await this.getUserNames([fromRepId, toRepId]);
    if (!names.has(fromRepId) || !names.has(toRepId)) {
      throw new NotFoundException('One of the selected reps was not found');
    }

    const loads = await this.getOpenLeadCounts([fromRepId, toRepId]);
    const fromLoad = loads.get(fromRepId) ?? 0;
    const toLoad = loads.get(toRepId) ?? 0;

    // How many to move. An explicit count wins; otherwise even the two to the
    // middle so the gap between them closes.
    let want =
      typeof opts.count === 'number' && opts.count > 0
        ? Math.floor(opts.count)
        : Math.max(0, Math.floor((fromLoad - toLoad) / 2));

    // Never leave `to` more than the fairness gap ahead of `from` after moving:
    //   (toLoad + n) - (fromLoad - n) <= FAIRNESS_GAP
    const maxByGap = Math.floor((FAIRNESS_GAP + fromLoad - toLoad) / 2);
    want = Math.min(want, Math.max(0, maxByGap), fromLoad);

    const leads = want > 0 ? await this.pickRebalanceLeads(fromRepId, want) : [];
    const leadIds = leads.map((l) => l.id);
    const moved = leadIds.length;

    const result: RebalanceResult = {
      preview: !!opts.preview,
      moved,
      from: {
        id: fromRepId,
        name: names.get(fromRepId)!,
        before: fromLoad,
        after: fromLoad - moved,
      },
      to: {
        id: toRepId,
        name: names.get(toRepId)!,
        before: toLoad,
        after: toLoad + moved,
      },
      lead_ids: leadIds,
    };

    if (opts.preview || moved === 0) {
      if (moved === 0) {
        result.note =
          fromLoad <= toLoad
            ? `${names.get(fromRepId)} is not carrying more than ${names.get(toRepId)} — nothing to move`
            : 'Moving any leads would push the pair past the fairness gap';
      }
      return result;
    }

    // Commit. Per-lead so the SLA clock is handled correctly (only started
    // when one isn't already running).
    const slaByStatus = await this.getActiveSlaHoursByStatus();
    await this.dataSource.transaction(async (mgr) => {
      const repo = mgr.getRepository(Lead);
      for (const lead of leads) {
        const patch: Partial<Lead> = { assigned_to: toRepId };
        if (!lead.current_sla_due_date) {
          const slaHours = slaByStatus.get(lead.status as unknown as string);
          if (slaHours && slaHours > 0) {
            patch.current_sla_due_date = addBusinessHours(new Date(), slaHours);
            patch.sla_breached = false;
          }
        }
        await repo.update(lead.id, patch);
      }
    });

    // Audit each move (before/after owner), then tell the receiving rep.
    for (const lead of leads) {
      try {
        await this.activityLogsService.logUpdate(
          'Lead',
          lead.id,
          { assigned_to: fromRepId },
          { assigned_to: toRepId },
          deciderId,
          `Rebalanced ${names.get(fromRepId)} → ${names.get(toRepId)} (manager workload move)`,
        );
      } catch {
        // Audit failure never unwinds a completed move.
      }
    }
    try {
      await this.userNotificationsService.sendToUsers({
        title: 'Leads moved to you',
        message: `${moved} lead(s) were moved to you in a workload rebalance by a manager. Pick them up before their SLA expires.`,
        severity: 'info',
        entity: 'Lead',
        entityId: 'rebalance',
        dedupeKey: `lead-rebalance-${toRepId}-${new Date().getTime()}`,
        actionUrl: '/leads',
        userIds: [toRepId],
      });
    } catch {
      // Notification failure never unwinds a completed move.
    }

    this.logger.log(
      `Rebalance: moved ${moved} lead(s) ${names.get(fromRepId)} → ${names.get(toRepId)} by ${deciderId}`,
    );
    return result;
  }

  /** Display names for a set of user ids. */
  private async getUserNames(ids: string[]): Promise<Map<string, string>> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('user.id', 'id')
      .addSelect('user.first_name', 'first_name')
      .addSelect('user.last_name', 'last_name')
      .from('users', 'user')
      .where('user.id IN (:...ids)', { ids })
      .getRawMany<{ id: string; first_name: string; last_name: string }>();
    return new Map(
      rows.map((r) => [r.id, `${r.first_name} ${r.last_name}`.trim()]),
    );
  }

  /**
   * The leads a rebalance may move from a rep: open (non-terminal, not
   * deleted), unworked first (no activity), then most-recently created —
   * so the rep keeps the leads they have held longest / already worked.
   */
  private async pickRebalanceLeads(
    fromRepId: string,
    limit: number,
  ): Promise<Lead[]> {
    return this.leadRepository
      .createQueryBuilder('lead')
      .where('lead.assigned_to = :fromRepId', { fromRepId })
      .andWhere('lead.deleted_at IS NULL')
      .andWhere('lead.status NOT IN (:...terminal)', {
        terminal: [...TERMINAL_LEAD_STATUSES],
      })
      // Unworked (no activity) sorts first — Postgres orders false before true.
      .orderBy(
        '(EXISTS (SELECT 1 FROM activities a WHERE a.lead_id = lead.id))',
        'ASC',
      )
      .addOrderBy('lead.created_at', 'DESC')
      .limit(limit)
      .getMany();
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
    schoolProvince: string | null | undefined,
    managerCap: number,
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

    // Managers are capped (#19): once a manager holds `managerCap` open leads,
    // they drop out and leads in their territory go to the rep. Reps are never
    // capped.
    const eligible = territorial.filter(
      (r) => r.cohort === 'rep' || (load.get(r.id) ?? 0) + 1 <= managerCap,
    );

    // No province, no covering recipient, or the only covering recipient is a
    // capped manager → not auto-assignable. Skip it; the lead stays unassigned
    // for a manager to place by hand — never forced onto the wrong rep.
    if (eligible.length === 0) return null;

    // Fairness applies ONLY among the recipients who share this territory:
    // give the lead to the lightest-loaded of them.
    const chosen = leastLoaded(eligible);
    if (!chosen) return null;

    // Plain, non-confusing wording. The old `(N open)` exposed the rep's
    // RUNNING load mid-distribution — a number that climbed lead-to-lead and
    // confused managers — so it's dropped. The territory match is what
    // actually justifies the pick; fairness is called out only when more than
    // one rep covers the province.
    const reason =
      territorial.length > 1
        ? `${chosen.name} covers ${schoolProvince} — lightest-loaded of the ${territorial.length} reps who cover it`
        : `${schoolProvince} is in ${chosen.name}'s territory`;
    return { recipient: chosen, reason };
  }

  /**
   * Recipients = active SALES REPS who have a territory configured.
   * Territory is the opt-in: no territory, no auto-assigned leads.
   * Managers are excluded — they approve and reassign, they don't receive
   * auto-distributed leads (Kim, 29 July). All recipients are one 'rep'
   * cohort, balanced against each other by the fairness gap.
   */
  private async getRecipients(includeManagers: boolean): Promise<Recipient[]> {
    const reps = await this.queryRecipientsByRole([...ROUTABLE_ROLES], 'rep');
    if (!includeManagers) return reps;
    // Managers opt in (compliance switch): they share their office rep's
    // territory and receive up to the manager cap. A user who is both stays a
    // rep (uncapped).
    const managers = await this.queryRecipientsByRole(['sales_manager'], 'manager');
    const repIds = new Set(reps.map((r) => r.id));
    return [...reps, ...managers.filter((m) => !repIds.has(m.id))];
  }

  private async queryRecipientsByRole(
    roles: string[],
    cohort: 'rep' | 'manager',
  ): Promise<Recipient[]> {
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
      .where('role.name IN (:...roles)', { roles })
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
        cohort,
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
  private async getDistributablePool(
    limit: number | null,
    campaignId: string | null = null,
  ): Promise<Lead[]> {
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
      );
    // Campaign scope: when the manager distributes a specific import, limit the
    // pool to that campaign's leads so an old backlog is never swept in.
    if (campaignId) {
      qb.andWhere('lead.source_campaign_id = :campaignId', { campaignId });
    }
    qb.orderBy('lead.created_at', 'ASC');
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
