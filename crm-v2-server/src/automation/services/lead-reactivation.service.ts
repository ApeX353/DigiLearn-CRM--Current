import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';
import { Deal } from '../../deals/entities/deal.entity';
import { UserNotificationsService } from '../../notifications/user-notifications.service';
import { AUTOMATION_CRON, REACTIVATION } from '../automation.constants';

/**
 * #3 — Stalled-lead/deal reactivation → DRAFT outreach.
 *
 * Tariro only *reports* stale items; a human then acts from memory.
 * 943 leads sit in the Contacted graveyard, the Nurture bucket goes
 * untouched, and the ongoing deals are all aged. This daily sweep
 * turns "stale" into an actionable, ready-to-send DRAFT delivered to
 * the owning rep as a notification.
 *
 * IMPORTANT — why this notifies rather than enqueues into EmailQueue:
 * the EmailQueue/EmailSequence outbox AUTO-SENDS on its 15-min
 * processQueue, which would bypass the human-approval gate (AGENTS.md
 * Golden Rule: drafts and queues; humans decide). WhatsApp is also the
 * real channel (1,223 msgs vs 3 emails) and must stay rep-sent to
 * protect the "advisor not vendor" framing. So we surface a suggested
 * WhatsApp draft to the rep and let them edit-and-send. We never
 * mutate lead timers here — that would mask the very staleness #1's
 * temperature sweeper exists to detect.
 *
 * Dedupe is weekly per lead/deal so a rep isn't nagged daily.
 */
@Injectable()
export class LeadReactivationService {
  private readonly logger = new Logger(LeadReactivationService.name);

  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Deal)
    private readonly dealRepository: Repository<Deal>,
    private readonly dataSource: DataSource,
    private readonly userNotificationsService: UserNotificationsService,
  ) {}

  @Cron(AUTOMATION_CRON.reactivation)
  async handleReactivationSweep(): Promise<void> {
    try {
      const now = new Date();
      const weekKey = this.weekKey(now);
      const perRep = new Map<string, number>();

      const leadCount = await this.sweepLeads(now, weekKey, perRep);
      const dealCount = await this.sweepDeals(now, weekKey);

      if (leadCount > 0 || dealCount > 0) {
        this.logger.log(
          `Reactivation: ${leadCount} lead draft(s), ${dealCount} deal nudge(s) suggested`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Reactivation sweep failed: ${error?.message}`,
        error?.stack,
      );
    }
  }

  private async sweepLeads(
    now: Date,
    weekKey: string,
    perRep: Map<string, number>,
  ): Promise<number> {
    const contactedCutoff = this.daysAgo(now, REACTIVATION.contactedStaleDays);
    const nurtureMin = this.daysAgo(now, REACTIVATION.nurtureMaxDays); // older bound
    const nurtureMax = this.daysAgo(now, REACTIVATION.nurtureMinDays); // newer bound

    const leads = await this.leadRepository
      .createQueryBuilder('lead')
      .where('lead.deleted_at IS NULL')
      .andWhere('lead.assigned_to IS NOT NULL')
      .andWhere(
        new Brackets((qb) => {
          // Contacted graveyard: no touch for >= contactedStaleDays.
          qb.where(
            new Brackets((c) => {
              c.where('lead.status = :contacted', {
                contacted: 'Contacted',
              }).andWhere(
                'COALESCE(lead.last_action_at, lead.last_contacted_at, lead.created_at) < :contactedCutoff',
                { contactedCutoff },
              );
            }),
          ).orWhere(
            // Nurture re-engagement window.
            new Brackets((n) => {
              n.where('lead.status = :nurture', { nurture: 'Nurture' })
                .andWhere(
                  'COALESCE(lead.last_action_at, lead.last_contacted_at, lead.created_at) >= :nurtureMin',
                  { nurtureMin },
                )
                .andWhere(
                  'COALESCE(lead.last_action_at, lead.last_contacted_at, lead.created_at) <= :nurtureMax',
                  { nurtureMax },
                );
            }),
          );
        }),
      )
      .orderBy(
        'COALESCE(lead.last_action_at, lead.last_contacted_at, lead.created_at)',
        'ASC',
      )
      .getMany();

    let emitted = 0;
    for (const lead of leads) {
      const rep = lead.assigned_to as string;
      const used = perRep.get(rep) ?? 0;
      if (used >= REACTIVATION.perRepLimit) continue;

      const lastTouch =
        lead.last_action_at ?? lead.last_contacted_at ?? lead.created_at;
      const days = this.daysBetween(lastTouch, now);
      const draft = this.buildLeadDraft(lead.lead_name, days);

      const ok = await this.notify({
        title: `Reactivation suggested: ${lead.status} lead idle ${days}d`,
        message: `"${lead.lead_name}" has had no contact for ~${days} days. Suggested WhatsApp to send (edit as needed): "${draft}"`,
        entity: 'Lead',
        entityId: lead.id,
        dedupeKey: `reactivation-lead-${lead.id}-${weekKey}`,
        actionUrl: `/leads/${lead.id}`,
        userIds: [rep],
      });
      if (ok) {
        perRep.set(rep, used + 1);
        emitted++;
      }
    }
    return emitted;
  }

  private async sweepDeals(now: Date, weekKey: string): Promise<number> {
    const agedCutoff = this.daysAgo(now, REACTIVATION.agedDealDays);

    const deals = await this.dealRepository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.current_stage', 'stage')
      .where('deal.close_status = :status', { status: 'ongoing' })
      .andWhere('deal.currentStageSince < :agedCutoff', { agedCutoff })
      .getMany();

    let emitted = 0;
    for (const deal of deals) {
      if (!deal.assigned_to) continue; // unowned deals fall to #2/managers
      const days = this.daysBetween(deal.currentStageSince, now);
      const stageName = (deal as any).current_stage?.name ?? 'its current stage';
      const draft = this.buildDealDraft(deal.title, stageName, days);

      const ok = await this.notify({
        title: `Aged deal nudge: ${days}d in stage`,
        message: `Deal "${deal.title}" has sat in "${stageName}" for ${days} days. Suggested next move (edit as needed): "${draft}"`,
        entity: 'Deal',
        entityId: deal.id,
        dedupeKey: `reactivation-deal-${deal.id}-${weekKey}`,
        actionUrl: `/deals/${deal.id}`,
        userIds: [deal.assigned_to],
      });
      if (ok) emitted++;
    }
    return emitted;
  }

  /** Advisor-not-vendor tone (per approved brand framing). */
  private buildLeadDraft(name: string, days: number): string {
    return `Hi — it's been about ${days} days since we last connected about ${name}. No pressure at all; I just wanted to check in on how things are tracking and whether there's anything I can help clarify about getting digital classrooms running. Happy to share what's worked for similar schools whenever the timing suits you.`;
  }

  private buildDealDraft(title: string, stage: string, days: number): string {
    return `Following up on ${title} — it's been ${days} days at "${stage}". Whenever you're ready, I can walk the team through the next step or answer any open questions. What would be most useful from our side?`;
  }

  private async notify(p: {
    title: string;
    message: string;
    entity: 'Lead' | 'Deal';
    entityId: string;
    dedupeKey: string;
    actionUrl: string;
    userIds: string[];
  }): Promise<boolean> {
    try {
      await this.userNotificationsService.sendToUsers({
        title: p.title,
        message: p.message,
        severity: 'info',
        entity: p.entity,
        entityId: p.entityId,
        dedupeKey: p.dedupeKey,
        actionUrl: p.actionUrl,
        userIds: p.userIds,
      });
      return true;
    } catch (e: any) {
      // Weekly dedupe collision = already suggested this week; not an error.
      if (
        e?.code === 'ER_DUP_ENTRY' ||
        e?.code === '23505' ||
        e?.message?.includes('duplicate')
      ) {
        return false;
      }
      this.logger.error(`Reactivation notify failed (${p.entityId}): ${e?.message}`);
      return false;
    }
  }

  private daysAgo(now: Date, days: number): Date {
    return new Date(now.getTime() - days * 86_400_000);
  }

  private daysBetween(from: Date, to: Date): number {
    return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
  }

  private weekKey(now: Date): string {
    const onejan = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil(
      ((now.getTime() - onejan.getTime()) / 86_400_000 + onejan.getDay() + 1) /
        7,
    );
    return `${now.getFullYear()}W${week}`;
  }
}
