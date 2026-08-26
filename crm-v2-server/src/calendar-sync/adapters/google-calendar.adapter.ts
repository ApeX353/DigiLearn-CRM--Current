import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import {
  ExternalCalendarEvent,
  ICalendarAdapter,
  PullDelta,
  PushEventInput,
} from '../interfaces/calendar-adapter.interface';

/**
 * Google Calendar adapter.
 *
 * This pass lands the *shape* — the contract other services rely on —
 * and leaves the HTTP layer as a clearly-marked follow-up. Reason: to
 * avoid half-finished OAuth plumbing that would fail silently in QA.
 * When we wire real creds we'll fill in the fetch calls and the module
 * tests will catch regressions.
 *
 * The env vars we read from are deliberately namespaced so rotating
 * credentials never collides with the auth module's Google login
 * (different client id / scopes).
 */
@Injectable()
export class GoogleCalendarAdapter implements ICalendarAdapter {
  readonly provider = 'google' as const;
  private readonly logger = new Logger(GoogleCalendarAdapter.name);

  private readonly clientId = process.env.GOOGLE_CAL_CLIENT_ID;
  private readonly clientSecret = process.env.GOOGLE_CAL_CLIENT_SECRET;
  private readonly redirectUri = process.env.GOOGLE_CAL_REDIRECT_URI;

  getAuthorizeUrl(state: string): string {
    if (!this.clientId || !this.redirectUri) {
      this.logger.warn(
        'GOOGLE_CAL_CLIENT_ID / GOOGLE_CAL_REDIRECT_URI not set — returning placeholder URL',
      );
    }
    const params = new URLSearchParams({
      client_id: this.clientId ?? 'unset',
      redirect_uri: this.redirectUri ?? 'http://localhost/unset',
      response_type: 'code',
      // events.owned keeps us out of calendars the user only has read
      // access to — we never want to write into a shared resource.
      scope:
        'https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/userinfo.email',
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(
    _code: string,
  ): Promise<{
    provider_account_id: string;
    tokens: Record<string, unknown>;
  }> {
    throw new NotImplementedException(
      'Google Calendar token exchange is not wired yet — set GOOGLE_CAL_* env vars and implement the /token call.',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pushEvent(
    _tokens: Record<string, unknown>,
    _calendarId: string | null,
    _input: PushEventInput,
  ): Promise<ExternalCalendarEvent> {
    throw new NotImplementedException('Google Calendar pushEvent pending');
  }

  async patchEvent(
    _tokens: Record<string, unknown>,
    _calendarId: string | null,
    _externalId: string,
    _etag: string | null,
    _input: PushEventInput,
  ): Promise<ExternalCalendarEvent> {
    throw new NotImplementedException('Google Calendar patchEvent pending');
  }

  async cancelEvent(
    _tokens: Record<string, unknown>,
    _calendarId: string | null,
    _externalId: string,
  ): Promise<void> {
    throw new NotImplementedException('Google Calendar cancelEvent pending');
  }

  async pullDelta(
    _tokens: Record<string, unknown>,
    _calendarId: string | null,
    _sinceSyncToken: string | null,
  ): Promise<PullDelta> {
    throw new NotImplementedException('Google Calendar pullDelta pending');
  }
}
