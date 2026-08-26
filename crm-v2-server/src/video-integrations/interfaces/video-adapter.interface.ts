/**
 * Common shape for a created video meeting. We keep only what CRM
 * records need — the provider's full response is discarded to avoid
 * leaking vendor lock-in across layers.
 */
export interface CreatedVideoMeeting {
  /** Stable provider-side id. */
  external_meeting_id: string;
  /** URL the invitee clicks to join. */
  join_url: string;
  /** Optional host-only URL (Zoom surfaces this separately). */
  start_url?: string;
  /** Optional numeric/textual passcode, surfaced in invites. */
  passcode?: string;
}

export interface CreateVideoMeetingInput {
  topic: string;
  start: Date;
  duration_minutes: number;
  agenda?: string;
  timezone?: string;
}

/**
 * Provider-specific driver for Zoom / Google Meet / Teams. Same
 * "authorize → exchange → create / cancel" contract as the calendar
 * adapters — this keeps the orchestrator code uniform.
 */
export interface IVideoAdapter {
  readonly provider: 'zoom' | 'google_meet' | 'teams';

  getAuthorizeUrl(state: string): string;

  exchangeCode(code: string): Promise<{
    provider_account_id: string;
    tokens: Record<string, unknown>;
  }>;

  createMeeting(
    tokens: Record<string, unknown>,
    input: CreateVideoMeetingInput,
  ): Promise<CreatedVideoMeeting>;

  cancelMeeting(
    tokens: Record<string, unknown>,
    externalMeetingId: string,
  ): Promise<void>;
}
