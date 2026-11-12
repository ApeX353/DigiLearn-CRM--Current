import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';
import { UserNotificationsService } from '../../notifications/user-notifications.service';

/**
 * #7 — Demo-followup SLA → auto-drafted follow-up pack.
 *
 * The SLA scheduler already FLAGS `demo_followup_sla_breached` when a
 * delivered demo has no follow-up within 48h, and notifies the rep
 * that one is overdue. What it does not do is write the follow-up for
 * them — so the rep still hand-crafts every recap and warm intent
 * cools while they do. This job closes that gap: for each lead whose
 * demo follow-up is overdue, it drops a ready-to-edit recap + next-step
 * draft into the rep's notifications.
 *
 * Deliberately NO pricing in the draft. Quote figures depend on the
 * pricing files being filled + ZAR/USD resolved + the two pricing
 * sources reconciled (register Gate-0e). Until then, inventing a price
 * would violate the "never invent prices — say CANNOT CONFIRM" rule,
 * so the draft routes the rep to confirm pricing before quoting.
 *
 * Weekly dedupe per lead so the rep isn't nagged daily. No timer
 * mutation, no external send — the rep edits and sends.
 */
@Injectable()
export class DemoFollowupDraftService {
  private readonly logger = new Logger(DemoFollowupDraftService.name);

  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    private readonly userNotificationsService: UserNotificationsService,
  ) {}

  // Daily at 07:00, just after the reactivation/discipline jobs.
  @Cron('0 0 7 * * *')
  async handleDemoFollowupDrafts(): Promise<void> {
    try {
      const leads = await this.leadRepository
        .createQueryBuilder('lead')
        .where('lead.demo_followup_sla_breached = :b', { b: true })
        .andWhere('lead.deleted_at IS NULL')
        .andWhere('lead.assigned_to IS NOT NULL')
        .getMany();

      if (leads.length === 0) return;

      const weekKey = this.weekKey(new Date());
      let drafted = 0;

      for (const lead of leads) {
        const draft = this.buildDraft(lead.lead_name);
        try {
          await this.userNotificationsService.sendToUsers({
            title: 'Demo follow-up draft ready',
            message: `"${lead.lead_name}" had a demo with no follow-up logged. Suggested message to send (edit; confirm pricing before quoting): "${draft}"`,
            severity: 'warning',
            entity: 'Lead',
            entityId: lead.id,
            dedupeKey: `demo-followup-draft-${lead.id}-${weekKey}`,
            actionUrl: `/leads/${lead.id}`,
            userIds: [lead.assigned_to as string],
          });
          drafted++;
        } catch (e: any) {
          if (
            e?.code !== 'ER_DUP_ENTRY' &&
            e?.code !== '23505' &&
            !e?.message?.includes('duplicate')
          ) {
            this.logger.error(
              `Demo-followup draft: notify failed for lead ${lead.id}: ${e?.message}`,
            );
          }
        }
      }

      if (drafted > 0) {
        this.logger.log(`Demo-followup drafts suggested: ${drafted}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Demo-followup draft job failed: ${error?.message}`,
        error?.stack,
      );
    }
  }

  private buildDraft(name: string): string {
    return `Thank you again for the time during our demo at ${name} — it was great to walk the team through how DigiLearn fits day-to-day teaching. As a next step, I'd suggest a short call to map this to your priorities and timeline, and I can pull together the specifics for your school. When would suit you this week? (Pricing/payment-plan details to be confirmed before I send anything formal.)`;
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
