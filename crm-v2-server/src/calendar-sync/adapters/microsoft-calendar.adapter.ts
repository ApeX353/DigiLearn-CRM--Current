import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import {
  ExternalCalendarEvent,
  ICalendarAdapter,
  PullDelta,
  PushEventInput,
} from '../interfaces/calendar-adapter.interface';

/**
 * Microsoft Graph calendar adapter — mirror of the Google one. Same
 * "shape first, network later" stance. The tenant id lets us target
 * single-tenant Azure apps (common for enterprise customers who hate
 * the `/common` multi-tenant endpoint).
 */
@Injectable()
export class MicrosoftCalendarAdapter implements ICalendarAdapter {
  readonly provider = 'microsoft' as const;
  private readonly logger = new Logger(MicrosoftCalendarAdapter.name);

  private readonly clientId = process.env.MS_GRAPH_CLIENT_ID;
  private readonly clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  private readonly redirectUri = process.env.MS_GRAPH_REDIRECT_URI;
  private readonly tenantId = process.env.MS_GRAPH_TENANT_ID ?? 'common';

  getAuthorizeUrl(state: string): string {
    if (!this.clientId || !this.redirectUri) {
      this.logger.warn(
        'MS_GRAPH_CLIENT_ID / MS_GRAPH_REDIRECT_URI not set — returning placeholder URL',
      );
    }
    const params = new URLSearchParams({
      client_id: this.clientId ?? 'unset',
      redirect_uri: this.redirectUri ?? 'http://localhost/unset',
      response_type: 'code',
      response_mode: 'query',
      scope:
        'offline_access Calendars.ReadWrite User.Read',
      state,
    });
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCode(
    _code: string,
  ): Promise<{
    provider_account_id: string;
    tokens: Record<string, unknown>;
  }> {
    throw new NotImplementedException(
      'Microsoft Graph token exchange is not wired yet — set MS_GRAPH_* env vars and implement the /token call.',
    );
  }

  async pushEvent(
    _tokens: Record<string, unknown>,
    _calendarId: string | null,
    _input: PushEventInput,
  ): Promise<ExternalCalendarEvent> {
    throw new NotImplementedException('Microsoft Graph pushEvent pending');
  }

  async patchEvent(
    _tokens: Record<string, unknown>,
    _calendarId: string | null,
    _externalId: string,
    _etag: string | null,
    _input: PushEventInput,
  ): Promise<ExternalCalendarEvent> {
    throw new NotImplementedException('Microsoft Graph patchEvent pending');
  }

  async cancelEvent(
    _tokens: Record<string, unknown>,
    _calendarId: string | null,
    _externalId: string,
  ): Promise<void> {
    throw new NotImplementedException('Microsoft Graph cancelEvent pending');
  }

  async pullDelta(
    _tokens: Record<string, unknown>,
    _calendarId: string | null,
    _sinceSyncToken: string | null,
  ): Promise<PullDelta> {
    throw new NotImplementedException('Microsoft Graph pullDelta pending');
  }
}
