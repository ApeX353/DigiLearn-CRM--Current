import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import {
  CreatedVideoMeeting,
  CreateVideoMeetingInput,
  IVideoAdapter,
} from '../interfaces/video-adapter.interface';

/**
 * Zoom adapter — same "shape first, HTTP later" discipline as the
 * calendar adapters. The OAuth URL is fully built so the frontend can
 * start the flow today; the token exchange and meeting-create paths
 * throw NotImplementedException until ops provisions the Zoom app
 * credentials (marketplace.zoom.us → Create App → OAuth).
 */
@Injectable()
export class ZoomAdapter implements IVideoAdapter {
  readonly provider = 'zoom' as const;
  private readonly logger = new Logger(ZoomAdapter.name);

  private readonly clientId = process.env.ZOOM_CLIENT_ID;
  private readonly clientSecret = process.env.ZOOM_CLIENT_SECRET;
  private readonly redirectUri = process.env.ZOOM_REDIRECT_URI;

  getAuthorizeUrl(state: string): string {
    if (!this.clientId || !this.redirectUri) {
      this.logger.warn(
        'ZOOM_CLIENT_ID / ZOOM_REDIRECT_URI not set — returning placeholder URL',
      );
    }
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId ?? 'unset',
      redirect_uri: this.redirectUri ?? 'http://localhost/unset',
      state,
    });
    return `https://zoom.us/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(
    _code: string,
  ): Promise<{
    provider_account_id: string;
    tokens: Record<string, unknown>;
  }> {
    throw new NotImplementedException(
      'Zoom token exchange is not wired yet — set ZOOM_* env vars and implement the /oauth/token call.',
    );
  }

  async createMeeting(
    _tokens: Record<string, unknown>,
    _input: CreateVideoMeetingInput,
  ): Promise<CreatedVideoMeeting> {
    throw new NotImplementedException('Zoom createMeeting pending');
  }

  async cancelMeeting(
    _tokens: Record<string, unknown>,
    _externalMeetingId: string,
  ): Promise<void> {
    throw new NotImplementedException('Zoom cancelMeeting pending');
  }
}
