import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Activity,
  ActivityStatus,
  ActivityType,
} from '../../activities/entities/activity.entity';
import { Lead } from '../../leads/entities/lead.entity';
import { Deal } from '../../deals/entities/deal.entity';
import { NotificationPreference } from '../../notifications/entities/notification-preference.entity';
import { UserNotificationsService } from '../../notifications/user-notifications.service';
import { AUTOMATION_CRON } from '../automation.constants';

/**
 * FU6: emits the lead/deal follow-up notifications the Admin Settings toggles
 * always promised but no server process ever sent. Two passes on a schedule:
 *   - "due"    — an open follow-up whose effective date falls in the next
 *                DUE_WINDOW_HOURS. event: <lead|deal>.followup_due
 *   - "missed" — an open follow-up whose effective date has already passed.
 *                event: <lead|deal>.followup_missed
 *
 * Ownership is scoped: the notification goes to the activity's assignee, then
 * the lead owner, then the deal owner. Delivery honours the per-user
 * NotificationPreference toggle for the event (default ON when no row exists),
 * which is what makes the restored Settings toggles actually mean something.
 * A dedupe key of <event>:<activityId>:<YYYY-MM-DD> fires each reminder at
 * most once per day even though the sweep runs hourly.
 */
const REMINDER_TYPES = [
  ActivityType.TASK,
  ActivityType.CALL,
  ActivityType.EMAIL,
  ActivityType.WHATSAPP,
  ActivityType.MEETING,
  ActivityType.DEMO_BOOKING,
  ActivityType.DEMO_DELIVERY,
  ActivityType.DEMO_FOLLOWUP,
];
const DUE_WINDOW_HOURS = 24;
// "Missed" alerts only for RECENTLY missed follow-ups. The full overdue backlog
// lives on the Nurture Follow-ups dashboard (FU1); a notification about a
// follow-up missed months ago is noise and would flood reps on first run.
const MISSED_WINDOW_DAYS = 7;
const EFFECTIVE_DATE = 'COALESCE(a.due_at, a.scheduled_at)';
const PER_SWEEP_LIMIT = 500;

@Injectable()
export class FollowupReminderService {
  private readonly logger = new Logger(FollowupReminderService.name);

  constructor(
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
    @InjectRepository(NotificationPreference)
    private readonly prefRepo: Repository<NotificationPreference>,
    private readonly userNotifications: UserNotificationsService,
  ) {}

  @Cron(AUTOMATION_CRON.followupReminders)
  async run(): Promise<{ due: number; missed: number }> {
    const now = new Date();
    const soon = new Date(now.getTime() + DUE_WINDOW_HOURS * 60 * 60 * 1000);
    try {
      const due = await this.sweep('due', now, soon);
      const missed = await this.sweep('missed', now, null);
      this.logger.log(
        `follow-up reminders: ${due} due-soon, ${missed} missed notified`,
      );
      return { due, missed };
    } catch (err) {
      this.logger.error(`follow-up reminder sweep failed: ${String(err)}`);
      return { due: 0, missed: 0 };
    }
  }

  private async sweep(
    kind: 'due' | 'missed',
    now: Date,
    soon: Date | null,
  ): Promise<number> {
    const qb = this.activityRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.lead', 'lead')
      .leftJoinAndSelect('a.deal', 'deal')
      .where('a.status = :scheduled', { scheduled: ActivityStatus.SCHEDULED })
      .andWhere('a.archived_at IS NULL')
      .andWhere('a.type IN (:...types)', { types: REMINDER_TYPES });

    if (kind === 'due') {
      qb.andWhere(`${EFFECTIVE_DATE} > :now`, { now }).andWhere(
        `${EFFECTIVE_DATE} <= :soon`,
        { soon },
      );
    } else {
      // Recently missed only — bound the lower edge so the backlog does not
      // flood; the dashboard still shows everything older.
      const missedFloor = new Date(
        now.getTime() - MISSED_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
      qb.andWhere(`${EFFECTIVE_DATE} < :now`, { now }).andWhere(
        `${EFFECTIVE_DATE} >= :missedFloor`,
        { missedFloor },
      );
    }

    const rows = await qb.limit(PER_SWEEP_LIMIT).getMany();
    let sent = 0;

    for (const a of rows) {
      // An activity attached to a deal is deal work; otherwise it is lead work.
      const isDeal = !!a.deal_id;
      const event = isDeal
        ? `deal.followup_${kind}`
        : `lead.followup_${kind}`;

      const ownerId =
        a.assigned_to_id ??
        (isDeal ? a.deal?.assigned_to : a.lead?.assigned_to) ??
        a.lead?.assigned_to ??
        null;
      if (!ownerId) continue;

      if (!(await this.deliveryEnabled(ownerId, event))) continue;

      const effective = a.due_at ?? a.scheduled_at ?? now;
      const day = effective.toISOString().slice(0, 10);
      const subject = a.subject || 'Follow-up';
      const name = a.lead?.lead_name || a.deal?.title || 'a record';

      await this.userNotifications.sendToUsers({
        userIds: [ownerId],
        title: kind === 'due' ? 'Follow-up due soon' : 'Follow-up missed',
        message:
          kind === 'due'
            ? `"${subject}" for ${name} is due soon.`
            : `"${subject}" for ${name} is overdue — it was not completed on time.`,
        severity: kind === 'due' ? 'info' : 'warning',
        entity: isDeal ? 'Deal' : 'Lead',
        entityId: isDeal ? a.deal_id : a.lead_id,
        actionUrl: isDeal ? `/deals/${a.deal_id}` : `/leads/${a.lead_id}`,
        dedupeKey: `${event}:${a.id}:${day}`,
      });
      sent += 1;
    }

    return sent;
  }

  /**
   * A user gets the notification unless they have explicitly turned the
   * in-app toggle OFF for this event. No preference row = default ON.
   */
  private async deliveryEnabled(
    userId: string,
    eventType: string,
  ): Promise<boolean> {
    const rows = await this.prefRepo.find({
      where: { user_id: userId, event_type: eventType },
    });
    if (!rows.length) return true;
    const inApp = rows.find((r) => r.channel === 'in_app');
    return inApp ? inApp.is_enabled : true;
  }
}
