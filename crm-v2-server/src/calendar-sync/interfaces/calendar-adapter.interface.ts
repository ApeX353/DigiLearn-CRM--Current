/**
 * Shared shape for a pushed / pulled event. Intentionally leaner than
 * either Google's or Microsoft's wire format — we keep only what the
 * CRM cares about.
 */
export interface ExternalCalendarEvent {
  external_event_id: string;
  etag?: string;
  html_link?: string;
  subject: string;
  description?: string;
  location?: string;
  meeting_link?: string;
  start: Date;
  end: Date;
  attendees: Array<{ email: string; name?: string; response?: string }>;
  cancelled?: boolean;
}

export interface PushEventInput {
  subject: string;
  description?: string;
  location?: string;
  meeting_link?: string;
  start: Date;
  end: Date;
  attendees: Array<{ email: string; name?: string }>;
}

/**
 * Result of an incremental pull. `next_sync_token` is whatever the
 * provider wants echoed back on the next pull; the reconciler stores
 * it opaquely.
 */
export interface PullDelta {
  events: ExternalCalendarEvent[];
  next_sync_token: string | null;
}

/**
 * Provider-specific calendar driver.  We keep the surface area small on
 * purpose — anything bigger belongs in a dedicated module (e.g. full
 * user-provisioning flows live with auth, not here).
 */
export interface ICalendarAdapter {
  readonly provider: 'google' | 'microsoft';

  /** Hand back a hosted OAuth consent URL for the given user. */
  getAuthorizeUrl(state: string): string;

  /**
   * Exchange the OAuth code (and PKCE verifier / nonce) for tokens.
   * The returned `tokens` blob is what we encrypt and persist.
   */
  exchangeCode(code: string): Promise<{
    provider_account_id: string;
    tokens: Record<string, unknown>;
  }>;

  pushEvent(
    tokens: Record<string, unknown>,
    calendarId: string | null,
    input: PushEventInput,
  ): Promise<ExternalCalendarEvent>;

  patchEvent(
    tokens: Record<string, unknown>,
    calendarId: string | null,
    externalId: string,
    etag: string | null,
    input: PushEventInput,
  ): Promise<ExternalCalendarEvent>;

  cancelEvent(
    tokens: Record<string, unknown>,
    calendarId: string | null,
    externalId: string,
  ): Promise<void>;

  pullDelta(
    tokens: Record<string, unknown>,
    calendarId: string | null,
    sinceSyncToken: string | null,
  ): Promise<PullDelta>;
}
