import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import {
  CalendarProvider,
  UserCalendarConnection,
} from '../entities/user-calendar-connection.entity';
import { CalendarEventLink } from '../entities/calendar-event-link.entity';
import { CredentialsCipher } from '../../user-email/services/credentials-cipher.service';
import { GoogleCalendarAdapter } from '../adapters/google-calendar.adapter';
import { MicrosoftCalendarAdapter } from '../adapters/microsoft-calendar.adapter';
import {
  ICalendarAdapter,
  PushEventInput,
} from '../interfaces/calendar-adapter.interface';

export interface CalendarConnectionPublic {
  id: string;
  user_id: string;
  provider: CalendarProvider;
  provider_account_id: string;
  calendar_id: string | null;
  is_active: boolean;
  last_sync_at: Date | null;
  created_at: Date;
}

/**
 * Central orchestrator for two-way calendar sync.
 *
 *  - OAuth lifecycle: begin + finish connect, soft-revoke.
 *  - Push: called by activity hooks when a meeting is created / moved /
 *    cancelled in the CRM.
 *  - Pull: called by the reconciler cron and by the webhook endpoint
 *    when the provider pings us.
 *
 * The actual HTTP details live in provider-specific adapters; this
 * class does the ownership / state-machine / token-rotation work that
 * is the same regardless of provider.
 */
@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    @InjectRepository(UserCalendarConnection)
    private readonly connections: Repository<UserCalendarConnection>,
    @InjectRepository(CalendarEventLink)
    private readonly links: Repository<CalendarEventLink>,
    private readonly cipher: CredentialsCipher,
    private readonly google: GoogleCalendarAdapter,
    private readonly microsoft: MicrosoftCalendarAdapter,
  ) {}

  /**
   * Pending OAuth-state nonces. In-memory is good enough for a single
   * instance; on cluster scale-up this should move to Redis. Mapped
   * value holds the user id + provider we started the flow for.
   */
  private readonly pendingStates = new Map<
    string,
    { userId: string; provider: CalendarProvider; createdAt: number }
  >();

  private adapter(provider: CalendarProvider): ICalendarAdapter {
    switch (provider) {
      case CalendarProvider.GOOGLE:
        return this.google;
      case CalendarProvider.MICROSOFT:
        return this.microsoft;
      default:
        throw new BadRequestException(`Unsupported provider ${String(provider)}`);
    }
  }

  beginConnect(userId: string, provider: CalendarProvider): { url: string } {
    const state = randomBytes(16).toString('hex');
    this.pendingStates.set(state, {
      userId,
      provider,
      createdAt: Date.now(),
    });
    // Lazy GC: drop any pending state older than 10 minutes.
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of this.pendingStates) {
      if (value.createdAt < cutoff) this.pendingStates.delete(key);
    }
    const url = this.adapter(provider).getAuthorizeUrl(state);
    return { url };
  }

  async finishConnect(
    state: string,
    code: string,
  ): Promise<CalendarConnectionPublic> {
    const entry = this.pendingStates.get(state);
    if (!entry) {
      throw new BadRequestException(
        'OAuth state is unknown or expired — please retry connecting.',
      );
    }
    this.pendingStates.delete(state);

    const adapter = this.adapter(entry.provider);
    const { provider_account_id, tokens } = await adapter.exchangeCode(code);

    // Upsert — reconnecting an existing provider should just rotate
    // tokens instead of creating duplicates (unique index covers this,
    // but an explicit upsert gives a clearer error path).
    let connection = await this.connections.findOne({
      where: { user_id: entry.userId, provider: entry.provider },
    });
    if (!connection) {
      connection = this.connections.create({
        user_id: entry.userId,
        provider: entry.provider,
        provider_account_id,
        calendar_id: null,
        encrypted_token_payload: this.cipher.encryptJson(tokens),
        sync_token: null,
        watch_channel_id: null,
        watch_expires_at: null,
        last_sync_at: null,
        is_active: true,
      });
    } else {
      connection.provider_account_id = provider_account_id;
      connection.encrypted_token_payload = this.cipher.encryptJson(tokens);
      connection.is_active = true;
    }
    const saved = await this.connections.save(connection);
    return this.toPublic(saved);
  }

  async listForUser(userId: string): Promise<CalendarConnectionPublic[]> {
    const rows = await this.connections.find({ where: { user_id: userId } });
    return rows.map((r) => this.toPublic(r));
  }

  async disconnect(id: string, userId: string): Promise<void> {
    const conn = await this.connections.findOne({ where: { id } });
    if (!conn || conn.user_id !== userId) {
      throw new NotFoundException(`Calendar connection ${id} not found`);
    }
    // Soft revoke: keep the row for audit, drop the ciphertext so
    // stolen DB dumps can't replay old refresh tokens.
    conn.is_active = false;
    conn.encrypted_token_payload = this.cipher.encryptJson({ revoked: true });
    conn.sync_token = null;
    conn.watch_channel_id = null;
    conn.watch_expires_at = null;
    await this.connections.save(conn);
  }

  private toPublic(c: UserCalendarConnection): CalendarConnectionPublic {
    return {
      id: c.id,
      user_id: c.user_id,
      provider: c.provider,
      provider_account_id: c.provider_account_id,
      calendar_id: c.calendar_id,
      is_active: c.is_active,
      last_sync_at: c.last_sync_at,
      created_at: c.created_at,
    };
  }

  /**
   * Called from the activities module when a meeting is created. Pushes
   * to every active calendar connection the owning user has configured.
   * Failures are logged but don't fail the parent transaction — a user
   * with a flaky calendar account shouldn't lose the meeting itself.
   */
  async onMeetingCreated(
    userId: string,
    activityId: string,
    input: PushEventInput,
  ): Promise<void> {
    const connections = await this.connections.find({
      where: { user_id: userId, is_active: true },
    });
    for (const conn of connections) {
      try {
        const adapter = this.adapter(conn.provider);
        const tokens = this.cipher.decryptJson<Record<string, unknown>>(
          conn.encrypted_token_payload,
        );
        const pushed = await adapter.pushEvent(
          tokens,
          conn.calendar_id,
          input,
        );
        const link = this.links.create({
          connection_id: conn.id,
          activity_id: activityId,
          external_event_id: pushed.external_event_id,
          etag: pushed.etag ?? null,
          html_link: pushed.html_link ?? null,
          last_pushed_at: new Date(),
          last_pulled_at: null,
          cancelled_externally: false,
        });
        await this.links.save(link);
      } catch (err) {
        this.logger.warn(
          `Calendar push failed for conn ${conn.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /**
   * Push an update to every existing link for this activity.  Used when
   * a meeting gets rescheduled or the attendee list changes.
   */
  async onMeetingUpdated(
    activityId: string,
    input: PushEventInput,
  ): Promise<void> {
    const links = await this.links.find({
      where: { activity_id: activityId, cancelled_externally: false },
      relations: ['connection'],
    });
    for (const link of links) {
      if (!link.connection?.is_active) continue;
      try {
        const adapter = this.adapter(link.connection.provider);
        const tokens = this.cipher.decryptJson<Record<string, unknown>>(
          link.connection.encrypted_token_payload,
        );
        const patched = await adapter.patchEvent(
          tokens,
          link.connection.calendar_id,
          link.external_event_id,
          link.etag,
          input,
        );
        link.etag = patched.etag ?? link.etag;
        link.html_link = patched.html_link ?? link.html_link;
        link.last_pushed_at = new Date();
        await this.links.save(link);
      } catch (err) {
        this.logger.warn(
          `Calendar patch failed for link ${link.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /**
   * Remove the event from every external calendar, and return the
   * recipient list we'd want to notify with a cancellation email
   * (aggregated across all links — usually the same set).
   */
  async onMeetingCancelled(
    activityId: string,
  ): Promise<{ notifiedCalendars: number }> {
    const links = await this.links.find({
      where: { activity_id: activityId, cancelled_externally: false },
      relations: ['connection'],
    });
    let notified = 0;
    for (const link of links) {
      if (!link.connection?.is_active) continue;
      try {
        const adapter = this.adapter(link.connection.provider);
        const tokens = this.cipher.decryptJson<Record<string, unknown>>(
          link.connection.encrypted_token_payload,
        );
        await adapter.cancelEvent(
          tokens,
          link.connection.calendar_id,
          link.external_event_id,
        );
        notified++;
      } catch (err) {
        this.logger.warn(
          `Calendar cancel failed for link ${link.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        link.cancelled_externally = true;
        await this.links.save(link);
      }
    }
    return { notifiedCalendars: notified };
  }

  /**
   * Reconciler entry point. Pulls incremental deltas from every active
   * connection.  Called by cron and by the webhook handler.
   */
  async pullAll(): Promise<{ pulled: number }> {
    const active = await this.connections.find({ where: { is_active: true } });
    let total = 0;
    for (const conn of active) {
      try {
        const adapter = this.adapter(conn.provider);
        const tokens = this.cipher.decryptJson<Record<string, unknown>>(
          conn.encrypted_token_payload,
        );
        const delta = await adapter.pullDelta(
          tokens,
          conn.calendar_id,
          conn.sync_token,
        );
        // TODO: reconcile delta.events against `calendar_event_links` —
        // for each remote event, either update the matching activity
        // (reschedule, attendee changes) or mark the link as
        // cancelled_externally if the event is gone. Applying the
        // inverse push-back to the CRM activity is the logical next
        // iteration; for now we just record the sync token so the next
        // pull is incremental.
        conn.sync_token = delta.next_sync_token;
        conn.last_sync_at = new Date();
        await this.connections.save(conn);
        total += delta.events.length;
      } catch (err) {
        this.logger.warn(
          `Pull failed for conn ${conn.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { pulled: total };
  }
}
