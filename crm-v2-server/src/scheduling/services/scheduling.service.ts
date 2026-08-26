import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import {
  SchedulingLink,
  SchedulingLinkLocation,
  WeeklyAvailabilityWindow,
} from '../entities/scheduling-link.entity';
import {
  SchedulingHold,
  SchedulingHoldStatus,
} from '../entities/scheduling-hold.entity';
import {
  Activity,
  ActivityStatus,
  ActivityType,
} from '../../activities/entities/activity.entity';
import {
  Meeting,
  MeetingPlatform,
} from '../../activities/entities/meetings.entity';
import { CalendarSyncService } from '../../calendar-sync/services/calendar-sync.service';
import { VideoIntegrationsService } from '../../video-integrations/services/video-integrations.service';
import { VideoProvider } from '../../video-integrations/entities/video-provider-connection.entity';
import {
  CreateHoldDto,
  CreateSchedulingLinkDto,
  UpdateSchedulingLinkDto,
} from '../dto/scheduling.dto';

/** Public-page payload — everything the booker needs to render a slot grid. */
export interface PublicLinkView {
  slug: string;
  title: string;
  description: string | null;
  location_type: SchedulingLinkLocation;
  duration_minutes: number;
  timezone: string;
  owner: { name: string };
}

/**
 * A single slot on the booking grid. "held" covers both PENDING holds
 * (grayed out to reduce races) and external calendar conflicts — the
 * public UI doesn't need to distinguish.
 */
export interface Slot {
  start_at: string;
  end_at: string;
  held: boolean;
}

/** Short TTL for a pending hold — see SchedulingHoldStatus.PENDING. */
const HOLD_TTL_MINUTES = 5;

const MS_PER_MINUTE = 60 * 1000;

/**
 * Matches a scheduling link's location enum to the richer MeetingPlatform
 * used on the activities side. We keep two enums because the scheduling
 * surface has a distinct "CUSTOM" bucket the activities side doesn't
 * need (meetings always resolve to a concrete platform at creation).
 */
function locationToMeetingPlatform(
  loc: SchedulingLinkLocation,
): MeetingPlatform {
  switch (loc) {
    case SchedulingLinkLocation.ZOOM:
      return MeetingPlatform.ZOOM;
    case SchedulingLinkLocation.GOOGLE_MEET:
      return MeetingPlatform.GOOGLE_MEET;
    case SchedulingLinkLocation.TEAMS:
      return MeetingPlatform.TEAMS;
    case SchedulingLinkLocation.PHONE:
      return MeetingPlatform.PHONE;
    case SchedulingLinkLocation.IN_PERSON:
      return MeetingPlatform.IN_PERSON;
    default:
      return MeetingPlatform.OTHER;
  }
}

/**
 * Scheduling is the public-facing "Calendly" surface. The service
 * splits into three responsibilities:
 *
 *   1. Owner CRUD over `SchedulingLink` — straightforward.
 *   2. Slot rendering for the public page — window math + hold diffing.
 *   3. The hold → confirm → Activity/Meeting handshake. This is where
 *      the "grayed-out provisional slot" requirement lives: we
 *      optimistically reserve the time with a PENDING hold and only
 *      promote it to a real meeting after the invitee submits their
 *      form. Anything older than HOLD_TTL_MINUTES is ignored, so a tab
 *      left open doesn't block future bookings.
 *
 * Calendar push happens through CalendarSyncService — we deliberately
 * don't know what Google/Microsoft think; we just say "this activity
 * became a meeting, go tell the connected calendars".
 */
@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    @InjectRepository(SchedulingLink)
    private readonly links: Repository<SchedulingLink>,
    @InjectRepository(SchedulingHold)
    private readonly holds: Repository<SchedulingHold>,
    @InjectRepository(Activity)
    private readonly activities: Repository<Activity>,
    @InjectRepository(Meeting)
    private readonly meetings: Repository<Meeting>,
    private readonly dataSource: DataSource,
    private readonly calendarSync: CalendarSyncService,
    private readonly videoIntegrations: VideoIntegrationsService,
  ) {}

  /**
   * Map the public-facing location enum to the internal video provider.
   * Returns `null` when the location isn't a video-managed provider,
   * i.e. phone/in-person/custom — in those cases we don't auto-create
   * a join link.
   */
  private providerForLocation(
    loc: SchedulingLinkLocation,
  ): VideoProvider | null {
    switch (loc) {
      case SchedulingLinkLocation.ZOOM:
        return VideoProvider.ZOOM;
      case SchedulingLinkLocation.GOOGLE_MEET:
        return VideoProvider.GOOGLE_MEET;
      case SchedulingLinkLocation.TEAMS:
        return VideoProvider.TEAMS;
      default:
        return null;
    }
  }

  // ---------------------------- owner CRUD ----------------------------

  async createLink(
    ownerUserId: string,
    dto: CreateSchedulingLinkDto,
  ): Promise<SchedulingLink> {
    this.assertAvailabilityWindows(dto.availability ?? null);
    // Slug collisions surface as 409 — the unique index enforces it too,
    // but the explicit lookup lets us give a friendlier error than a
    // raw constraint-violation trace.
    const existing = await this.links.findOne({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`Scheduling slug "${dto.slug}" is in use`);
    }
    const link = this.links.create({
      owner_user_id: ownerUserId,
      slug: dto.slug,
      title: dto.title,
      description: dto.description ?? null,
      location_type: dto.location_type,
      location_detail: dto.location_detail ?? null,
      duration_minutes: dto.duration_minutes,
      buffer_before_minutes: dto.buffer_before_minutes ?? 0,
      buffer_after_minutes: dto.buffer_after_minutes ?? 0,
      min_notice_minutes: dto.min_notice_minutes ?? 60,
      max_days_ahead: dto.max_days_ahead ?? 30,
      availability: dto.availability ?? null,
      timezone: dto.timezone ?? 'UTC',
      is_active: dto.is_active ?? true,
    });
    return this.links.save(link);
  }

  async listLinksForOwner(ownerUserId: string): Promise<SchedulingLink[]> {
    return this.links.find({
      where: { owner_user_id: ownerUserId },
      order: { created_at: 'DESC' },
    });
  }

  async updateLink(
    id: string,
    ownerUserId: string,
    dto: UpdateSchedulingLinkDto,
  ): Promise<SchedulingLink> {
    const link = await this.getOwnedOrFail(id, ownerUserId);
    if (dto.availability !== undefined) {
      this.assertAvailabilityWindows(dto.availability);
    }
    Object.assign(link, {
      title: dto.title ?? link.title,
      description: dto.description ?? link.description,
      location_type: dto.location_type ?? link.location_type,
      location_detail: dto.location_detail ?? link.location_detail,
      duration_minutes: dto.duration_minutes ?? link.duration_minutes,
      buffer_before_minutes:
        dto.buffer_before_minutes ?? link.buffer_before_minutes,
      buffer_after_minutes:
        dto.buffer_after_minutes ?? link.buffer_after_minutes,
      min_notice_minutes: dto.min_notice_minutes ?? link.min_notice_minutes,
      max_days_ahead: dto.max_days_ahead ?? link.max_days_ahead,
      availability:
        dto.availability !== undefined ? dto.availability : link.availability,
      timezone: dto.timezone ?? link.timezone,
      is_active: dto.is_active ?? link.is_active,
    });
    return this.links.save(link);
  }

  async deleteLink(id: string, ownerUserId: string): Promise<void> {
    const link = await this.getOwnedOrFail(id, ownerUserId);
    await this.links.remove(link);
  }

  private async getOwnedOrFail(
    id: string,
    ownerUserId: string,
  ): Promise<SchedulingLink> {
    const link = await this.links.findOne({ where: { id } });
    if (!link || link.owner_user_id !== ownerUserId) {
      throw new NotFoundException(`Scheduling link ${id} not found`);
    }
    return link;
  }

  // ---------------------------- public view ----------------------------

  /**
   * Resolve the link by slug for the public booking page. Inactive links
   * return 404 rather than a "disabled" banner — we don't want stale
   * links indexed by search engines.
   */
  async getPublicView(slug: string): Promise<{
    link: PublicLinkView;
    slots: Slot[];
  }> {
    const link = await this.links.findOne({
      where: { slug, is_active: true },
      relations: ['owner'],
    });
    if (!link) {
      throw new NotFoundException(`No active scheduling link for "${slug}"`);
    }

    const slots = await this.computeSlots(link, new Date());
    return {
      link: {
        slug: link.slug,
        title: link.title,
        description: link.description,
        location_type: link.location_type,
        duration_minutes: link.duration_minutes,
        timezone: link.timezone,
        owner: {
          name:
            [link.owner?.first_name, link.owner?.last_name]
              .filter(Boolean)
              .join(' ') || 'Host',
        },
      },
      slots,
    };
  }

  /**
   * Turn weekly windows + existing holds into an ordered list of slot
   * candidates for the public grid. We purposely do the arithmetic in
   * UTC and let the client render in whatever timezone the invitee
   * prefers — the wire values are all absolute.
   *
   * This is a deliberately simple implementation:
   *  - No DST skew handling (TODO when the timezone field becomes
   *    configurable per invitee).
   *  - No integration with external calendar busy-times yet; the hook
   *    exists (`calendarSync.pullAll()` keeps sync tokens fresh) but
   *    merging calendar busy-blocks into the conflict check is a
   *    follow-up. Holds on our own table are the authoritative
   *    short-term signal.
   */
  async computeSlots(link: SchedulingLink, from: Date): Promise<Slot[]> {
    const windows = link.availability ?? [];
    if (!windows.length || !link.is_active) return [];

    const minBookable = new Date(
      from.getTime() + link.min_notice_minutes * MS_PER_MINUTE,
    );
    const horizon = new Date(
      from.getTime() + link.max_days_ahead * 24 * 60 * MS_PER_MINUTE,
    );

    // Fetch everything that could block a slot: active holds that still
    // matter (pending & unexpired, or confirmed).
    const conflicts = await this.holds.find({
      where: { link_id: link.id },
    });
    const activeConflicts = conflicts.filter((h) => this.isBlocking(h, from));

    const candidates: Slot[] = [];
    const cursor = new Date(minBookable);
    cursor.setSeconds(0, 0);
    // Round up to the next 5-min boundary so slot starts look tidy.
    cursor.setMinutes(cursor.getMinutes() + ((5 - (cursor.getMinutes() % 5)) % 5));

    while (cursor <= horizon) {
      const daySlots = this.slotsForDay(link, cursor, windows);
      for (const s of daySlots) {
        if (s.start_at < minBookable) continue;
        if (s.start_at > horizon) break;
        const end = new Date(
          s.start_at.getTime() + link.duration_minutes * MS_PER_MINUTE,
        );
        const held = activeConflicts.some((c) =>
          this.overlaps(s.start_at, end, c.start_at, c.end_at),
        );
        candidates.push({
          start_at: s.start_at.toISOString(),
          end_at: end.toISOString(),
          held,
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(0, 0, 0, 0);
    }
    return candidates;
  }

  private slotsForDay(
    link: SchedulingLink,
    day: Date,
    windows: WeeklyAvailabilityWindow[],
  ): Array<{ start_at: Date }> {
    const dow = day.getUTCDay();
    const dayWindows = windows.filter((w) => w.day_of_week === dow);
    if (!dayWindows.length) return [];
    const stride = link.duration_minutes + link.buffer_after_minutes;
    const results: Array<{ start_at: Date }> = [];
    for (const w of dayWindows) {
      if (w.end_minutes_from_midnight <= w.start_minutes_from_midnight) continue;
      for (
        let m = w.start_minutes_from_midnight;
        m + link.duration_minutes <= w.end_minutes_from_midnight;
        m += stride
      ) {
        const d = new Date(day);
        d.setUTCHours(Math.floor(m / 60), m % 60, 0, 0);
        results.push({ start_at: d });
      }
    }
    return results;
  }

  private overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart < bEnd && bStart < aEnd;
  }

  private isBlocking(h: SchedulingHold, now: Date): boolean {
    if (h.status === SchedulingHoldStatus.CONFIRMED) return true;
    if (h.status === SchedulingHoldStatus.PENDING) {
      return h.expires_at > now;
    }
    return false;
  }

  // ---------------------------- holds ----------------------------

  /**
   * Create a short-lived PENDING hold. The invitee's page will gray out
   * this slot for *other* invitees. A concurrent second booker gets a
   * 409 and a fresh slots payload — same UX as Calendly.
   */
  async createHold(slug: string, dto: CreateHoldDto): Promise<SchedulingHold> {
    const link = await this.links.findOne({
      where: { slug, is_active: true },
    });
    if (!link) {
      throw new NotFoundException(`No active scheduling link for "${slug}"`);
    }

    const start = new Date(dto.start_at);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('start_at must be an ISO8601 timestamp');
    }
    const end = new Date(start.getTime() + link.duration_minutes * MS_PER_MINUTE);
    const now = new Date();

    if (start < new Date(now.getTime() + link.min_notice_minutes * MS_PER_MINUTE)) {
      throw new BadRequestException(
        'Slot is inside the minimum notice window',
      );
    }
    if (start > new Date(now.getTime() + link.max_days_ahead * 24 * 60 * MS_PER_MINUTE)) {
      throw new BadRequestException('Slot is beyond the booking horizon');
    }

    // C-04: the requested time must be one the link actually OFFERS —
    // generated by the same code the public slots endpoint uses. Before
    // this, any syntactically valid future timestamp could be held and
    // confirmed, including times far outside the owner's working hours.
    const offered = this.slotsForDay(link, start, link.availability ?? []).some(
      (s) => s.start_at.getTime() === start.getTime(),
    );
    if (!offered) {
      throw new BadRequestException(
        'That time is not one of the offered slots — please pick from the list.',
      );
    }

    // We must race-check against existing holds atomically. The safest
    // path on PostgreSQL is a small transaction with SERIALIZABLE — the
    // slots table is tiny per link, so isolation contention is a
    // non-issue in practice.
    return this.dataSource.transaction('SERIALIZABLE', async (em) => {
      const holdsRepo = em.getRepository(SchedulingHold);
      const existing = await holdsRepo
        .createQueryBuilder('h')
        .where('h.link_id = :linkId', { linkId: link.id })
        .andWhere(
          '(h.status = :confirmed OR (h.status = :pending AND h.expires_at > :now))',
          {
            confirmed: SchedulingHoldStatus.CONFIRMED,
            pending: SchedulingHoldStatus.PENDING,
            now,
          },
        )
        .andWhere('h.start_at < :end AND h.end_at > :start', { start, end })
        .getCount();
      if (existing > 0) {
        throw new ConflictException(
          'That slot was just taken — please pick another.',
        );
      }
      const hold = holdsRepo.create({
        link_id: link.id,
        start_at: start,
        end_at: end,
        invitee_email: dto.invitee_email ?? null,
        expires_at: new Date(now.getTime() + HOLD_TTL_MINUTES * MS_PER_MINUTE),
        status: SchedulingHoldStatus.PENDING,
        activity_id: null,
      });
      return holdsRepo.save(hold);
    });
  }

  // ---------------------------- confirm ----------------------------

  /**
   * Promote a PENDING hold into an Activity (type=MEETING) with a
   * Meeting subrecord, then push to the owner's calendar connections.
   *
   * This is the critical business moment — once we commit, the slot is
   * "really" booked. We do the DB work in a transaction so an external
   * calendar failure doesn't leave an orphan Activity floating. Calendar
   * push runs AFTER the commit: failures there are logged and the
   * reconciler retries. Losing a calendar push is recoverable; losing
   * the Activity is not.
   */
  async confirmHold(
    slug: string,
    holdId: string,
    inviteeEmail: string,
    inviteeName: string,
    notes: string | undefined,
  ): Promise<{
    hold: SchedulingHold;
    activity_id: string;
    meeting_id: string;
  }> {
    const link = await this.links.findOne({
      where: { slug, is_active: true },
    });
    if (!link) {
      throw new NotFoundException(`No active scheduling link for "${slug}"`);
    }

    const result = await this.dataSource.transaction(async (em) => {
      const holdsRepo = em.getRepository(SchedulingHold);
      const activitiesRepo = em.getRepository(Activity);
      const meetingsRepo = em.getRepository(Meeting);

      // C-04: locked for the transaction. Two simultaneous confirms
      // serialize here — the second sees CONFIRMED and takes the
      // idempotent path instead of creating a duplicate meeting.
      const hold = await holdsRepo.findOne({
        where: { id: holdId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!hold || hold.link_id !== link.id) {
        throw new NotFoundException('Hold not found for this link');
      }
      if (hold.status === SchedulingHoldStatus.CONFIRMED && hold.activity_id) {
        // Idempotent — the invitee double-clicked "Confirm". Return the
        // REAL meeting id, not a blank (C-04).
        const existingMeeting = await meetingsRepo.findOne({
          where: { activity_id: hold.activity_id },
        });
        return {
          hold,
          activity_id: hold.activity_id,
          meeting_id: existingMeeting?.id ?? (null as string | null),
        };
      }
      if (hold.status !== SchedulingHoldStatus.PENDING) {
        throw new BadRequestException(
          `Hold is ${hold.status}; please start over.`,
        );
      }
      if (hold.expires_at <= new Date()) {
        throw new BadRequestException(
          'This reservation timed out — please pick the slot again.',
        );
      }

      const subject = `${link.title} with ${inviteeName}`;
      const description =
        (notes ? `${notes}\n\n` : '') +
        `Booked via ${link.slug} — invitee ${inviteeName} <${inviteeEmail}>`;

      // lead_id / deal_id / contact_id are left blank on purpose — a
      // bookable link is typed to the owner, and the invitee isn't
      // necessarily a known CRM entity yet. The controller that turns a
      // confirmed hold into a lead is a follow-up.
      const activity = activitiesRepo.create({
        type: ActivityType.MEETING,
        status: ActivityStatus.SCHEDULED,
        subject,
        description,
        created_by_id: link.owner_user_id,
        assigned_to_id: link.owner_user_id,
        scheduled_at: hold.start_at,
        due_at: hold.start_at,
        duration: link.duration_minutes,
        is_automated: true,
        is_pinned: false,
      });
      await activitiesRepo.save(activity);

      // We create the Meeting row without a join link for now — if the
      // location is a managed video provider, we populate `meeting_link`
      // via an out-of-transaction call below. Doing the provider API
      // inside the DB transaction would hold row locks during external
      // network latency.
      const meeting = meetingsRepo.create({
        activity_id: activity.id,
        title: subject,
        platform: locationToMeetingPlatform(link.location_type),
        start_time: hold.start_at,
        end_time: hold.end_at,
        location: link.location_detail ?? undefined,
        attendees: JSON.stringify([
          { type: 'external', email: inviteeEmail, name: inviteeName },
        ]),
        agenda: link.description ?? undefined,
      });
      await meetingsRepo.save(meeting);

      hold.status = SchedulingHoldStatus.CONFIRMED;
      hold.invitee_email = inviteeEmail;
      hold.activity_id = activity.id;
      await holdsRepo.save(hold);

      return {
        hold,
        activity_id: activity.id,
        meeting_id: meeting.id,
      };
    });

    // Post-commit step 1: if the link is a managed video provider
    // (Zoom/Meet/Teams) AND the owner has that provider connected,
    // create the meeting and stamp the join URL onto the Meeting row.
    // Provider outages shouldn't block the booking — we silently fall
    // back to "no link" and log.
    let meetingLink: string | undefined;
    const videoProvider = this.providerForLocation(link.location_type);
    if (videoProvider) {
      try {
        const created = await this.videoIntegrations.createMeetingForUser(
          link.owner_user_id,
          videoProvider,
          {
            topic: `${link.title} with ${inviteeName}`,
            start: result.hold.start_at,
            duration_minutes: link.duration_minutes,
            agenda: link.description ?? undefined,
            timezone: link.timezone,
          },
        );
        if (created) {
          meetingLink = created.join_url;
          await this.meetings.update(
            { activity_id: result.activity_id },
            { meeting_link: created.join_url },
          );
        }
      } catch (err) {
        this.logger.warn(
          `Video meeting creation failed for activity ${result.activity_id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Post-commit step 2: push to the owner's calendars.  Best-effort;
    // the sync service already swallows individual connection failures.
    try {
      await this.calendarSync.onMeetingCreated(
        link.owner_user_id,
        result.activity_id,
        {
          subject: `${link.title} with ${inviteeName}`,
          description: notes ?? link.description ?? undefined,
          location: link.location_detail ?? undefined,
          meeting_link: meetingLink,
          start: result.hold.start_at,
          end: result.hold.end_at,
          attendees: [{ email: inviteeEmail, name: inviteeName }],
        },
      );
    } catch (err) {
      this.logger.warn(
        `Calendar push after confirm failed for activity ${result.activity_id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return {
      hold: result.hold,
      activity_id: result.activity_id,
      // meeting_id is always present on a fresh confirm; only null on
      // the idempotent path, and the caller doesn't need it there.
      meeting_id: result.meeting_id ?? '',
    };
  }

  // ---------------------------- maintenance ----------------------------

  /**
   * Sweep pending holds past their TTL. Called by the calendar
   * reconciler cron. Correctness doesn't depend on this — slot queries
   * filter by `expires_at > now` — but it keeps the table trim.
   */
  async expirePendingHolds(): Promise<{ expired: number }> {
    const { affected } = await this.holds
      .createQueryBuilder()
      .update(SchedulingHold)
      .set({ status: SchedulingHoldStatus.EXPIRED })
      .where('status = :pending', { pending: SchedulingHoldStatus.PENDING })
      .andWhere('expires_at <= :now', { now: new Date() })
      .execute();
    return { expired: affected ?? 0 };
  }

  private assertAvailabilityWindows(
    windows: WeeklyAvailabilityWindow[] | null,
  ): void {
    if (!windows) return;
    for (const w of windows) {
      if (w.end_minutes_from_midnight <= w.start_minutes_from_midnight) {
        throw new BadRequestException(
          'availability window end must be after start',
        );
      }
    }
  }

  /**
   * Used by a future hourly cleanup job. Kept separate from
   * expirePendingHolds so ops can tune sweep cadence per status.
   */
  async purgeAncientHolds(olderThanDays = 90): Promise<void> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    await this.holds.delete({ created_at: LessThan(cutoff) });
  }
}
