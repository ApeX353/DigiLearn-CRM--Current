import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity } from '../../activities/entities/activity.entity';
import { Meeting } from '../../activities/entities/meetings.entity';
import { CalendarSyncService } from './calendar-sync.service';
import { UserEmailSenderService } from '../../user-email/services/user-email-sender.service';
import { UserEmailAccountsService } from '../../user-email/services/user-email-accounts.service';

interface CancellationAttendee {
  email: string;
  name?: string;
}

/**
 * Fan-out for "meeting was cancelled in the CRM".
 *
 *   1. Tell CalendarSyncService to delete the matching external event(s)
 *      so the attendee's calendar updates too.
 *   2. Send a plain-English cancellation email from the owner's default
 *      email account — so the invitee sees it come "from the rep".
 *
 * Kept in its own service because the two hops are independently
 * failure-prone: a broken calendar push shouldn't swallow the email, and
 * a broken SMTP shouldn't block the calendar cleanup. Each step is
 * caught and logged individually.
 */
@Injectable()
export class MeetingCancellationService {
  private readonly logger = new Logger(MeetingCancellationService.name);

  constructor(
    @InjectRepository(Meeting)
    private readonly meetings: Repository<Meeting>,
    @InjectRepository(Activity)
    private readonly activities: Repository<Activity>,
    private readonly calendarSync: CalendarSyncService,
    private readonly accounts: UserEmailAccountsService,
    private readonly sender: UserEmailSenderService,
  ) {}

  /**
   * Called right BEFORE the meeting row is destroyed — we read everything
   * we need (attendees, start time, owner) while the data still exists,
   * then kick off the side effects. Safe to call even if the activity
   * has no Meeting sub-record; we just no-op in that case.
   */
  async cancelMeetingForActivity(
    activityId: string,
    triggeredBy: string,
  ): Promise<void> {
    const activity = await this.activities.findOne({
      where: { id: activityId },
    });
    if (!activity) return;

    const meeting = await this.meetings.findOne({
      where: { activity_id: activityId },
    });
    if (!meeting) return;

    const attendees = this.parseAttendees(meeting.attendees);

    // Step 1 — calendar cleanup. Safe to call even without connections;
    // CalendarSyncService no-ops when there are no active links.
    try {
      await this.calendarSync.onMeetingCancelled(activityId);
    } catch (err) {
      this.logger.warn(
        `Calendar cancel failed for activity ${activityId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // Step 2 — cancellation emails. Best-effort: a missing default
    // account means the rep hasn't configured email yet; we log and
    // move on rather than failing the delete.
    const ownerUserId = activity.assigned_to_id ?? activity.created_by_id;
    if (!ownerUserId || attendees.length === 0) return;

    // Probe for a default account first — `resolveSender` throws when
    // no account exists, which is a legitimate state (rep hasn't set
    // up SMTP yet) and shouldn't log as an error.
    const defaultAccount = await this.accounts
      .resolveSender(ownerUserId)
      .catch(() => null);
    if (!defaultAccount) {
      this.logger.log(
        `No default email account for owner ${ownerUserId}; skipping cancellation email`,
      );
      return;
    }

    const subject = `Cancelled: ${meeting.title}`;
    const bodyText = this.renderCancellationBody(meeting, triggeredBy);
    const bodyHtml = bodyText
      .split('\n')
      .map((line) => (line.length ? `<p>${line}</p>` : ''))
      .join('');
    for (const a of attendees) {
      try {
        await this.sender.send({
          userId: ownerUserId,
          accountId: defaultAccount.id,
          to: [a.email],
          subject,
          body_html: bodyHtml,
          body_text: bodyText,
        });
      } catch (err) {
        this.logger.warn(
          `Cancellation email to ${a.email} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private parseAttendees(raw: string | null | undefined): CancellationAttendee[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((p) => p as Record<string, unknown>)
        .filter((p) => typeof p.email === 'string')
        .map((p) => ({
          email: String(p.email),
          name: typeof p.name === 'string' ? p.name : undefined,
        }));
    } catch {
      return [];
    }
  }

  private renderCancellationBody(meeting: Meeting, triggeredBy: string): string {
    const when = meeting.start_time
      ? new Date(meeting.start_time).toUTCString()
      : 'the scheduled time';
    return [
      `Hi,`,
      ``,
      `The meeting "${meeting.title}" scheduled for ${when} has been cancelled.`,
      ``,
      `If you have any questions, reply to this email.`,
      ``,
      `— ${triggeredBy}`,
    ].join('\n');
  }
}
