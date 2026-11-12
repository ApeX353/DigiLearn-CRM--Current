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
  VideoProvider,
  VideoProviderConnection,
} from '../entities/video-provider-connection.entity';
import { ZoomAdapter } from '../adapters/zoom.adapter';
import { CredentialsCipher } from '../../user-email/services/credentials-cipher.service';
import {
  CreatedVideoMeeting,
  CreateVideoMeetingInput,
  IVideoAdapter,
} from '../interfaces/video-adapter.interface';

export interface VideoConnectionPublic {
  id: string;
  user_id: string;
  provider: VideoProvider;
  provider_account_id: string;
  is_active: boolean;
  created_at: Date;
}

/**
 * Owner-side orchestrator for Zoom / Google Meet / Teams.  Mirrors the
 * calendar-sync service so the shape is familiar:
 *
 *   - `beginConnect` / `finishConnect` — OAuth handshake.
 *   - `createMeetingForUser` — called by the scheduling flow when the
 *      selected location is one of the managed providers.
 *   - `cancelMeeting` — mirror path for the cancellation fan-out.
 *
 * Google Meet creation can technically be done via the Calendar API
 * instead of a separate Meet API — that's a short-term optimization we
 * intentionally do NOT take, because it muddles the "who owns the Meet
 * link" question for customers using Workspace + a non-Workspace calendar.
 */
@Injectable()
export class VideoIntegrationsService {
  private readonly logger = new Logger(VideoIntegrationsService.name);

  constructor(
    @InjectRepository(VideoProviderConnection)
    private readonly connections: Repository<VideoProviderConnection>,
    private readonly cipher: CredentialsCipher,
    private readonly zoom: ZoomAdapter,
  ) {}

  private readonly pendingStates = new Map<
    string,
    { userId: string; provider: VideoProvider; createdAt: number }
  >();

  private adapter(provider: VideoProvider): IVideoAdapter {
    switch (provider) {
      case VideoProvider.ZOOM:
        return this.zoom;
      case VideoProvider.GOOGLE_MEET:
      case VideoProvider.TEAMS:
        throw new BadRequestException(
          `${provider} adapter not implemented yet — use Zoom.`,
        );
      default:
        throw new BadRequestException(`Unknown provider ${String(provider)}`);
    }
  }

  beginConnect(userId: string, provider: VideoProvider): { url: string } {
    const state = randomBytes(16).toString('hex');
    this.pendingStates.set(state, {
      userId,
      provider,
      createdAt: Date.now(),
    });
    // Lazy 10-min GC on the nonce map.
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of this.pendingStates) {
      if (value.createdAt < cutoff) this.pendingStates.delete(key);
    }
    return { url: this.adapter(provider).getAuthorizeUrl(state) };
  }

  async finishConnect(
    state: string,
    code: string,
  ): Promise<VideoConnectionPublic> {
    const entry = this.pendingStates.get(state);
    if (!entry) {
      throw new BadRequestException(
        'OAuth state is unknown or expired — please retry connecting.',
      );
    }
    this.pendingStates.delete(state);

    const adapter = this.adapter(entry.provider);
    const { provider_account_id, tokens } = await adapter.exchangeCode(code);

    let connection = await this.connections.findOne({
      where: { user_id: entry.userId, provider: entry.provider },
    });
    if (!connection) {
      connection = this.connections.create({
        user_id: entry.userId,
        provider: entry.provider,
        provider_account_id,
        encrypted_token_payload: this.cipher.encryptJson(tokens),
        is_active: true,
      });
    } else {
      connection.provider_account_id = provider_account_id;
      connection.encrypted_token_payload = this.cipher.encryptJson(tokens);
      connection.is_active = true;
    }
    return this.toPublic(await this.connections.save(connection));
  }

  async listForUser(userId: string): Promise<VideoConnectionPublic[]> {
    const rows = await this.connections.find({ where: { user_id: userId } });
    return rows.map((r) => this.toPublic(r));
  }

  async disconnect(id: string, userId: string): Promise<void> {
    const c = await this.connections.findOne({ where: { id } });
    if (!c || c.user_id !== userId) {
      throw new NotFoundException(`Video connection ${id} not found`);
    }
    c.is_active = false;
    c.encrypted_token_payload = this.cipher.encryptJson({ revoked: true });
    await this.connections.save(c);
  }

  private toPublic(c: VideoProviderConnection): VideoConnectionPublic {
    return {
      id: c.id,
      user_id: c.user_id,
      provider: c.provider,
      provider_account_id: c.provider_account_id,
      is_active: c.is_active,
      created_at: c.created_at,
    };
  }

  /**
   * Called by the scheduling flow when a booking lands on a Zoom/Meet/
   * Teams slot. Returns `null` if the user hasn't connected the
   * provider yet — callers decide whether that's a hard error or a
   * graceful "no join link, fallback to manual".
   */
  async createMeetingForUser(
    userId: string,
    provider: VideoProvider,
    input: CreateVideoMeetingInput,
  ): Promise<CreatedVideoMeeting | null> {
    const conn = await this.connections.findOne({
      where: { user_id: userId, provider, is_active: true },
    });
    if (!conn) return null;
    try {
      const adapter = this.adapter(provider);
      const tokens = this.cipher.decryptJson<Record<string, unknown>>(
        conn.encrypted_token_payload,
      );
      return await adapter.createMeeting(tokens, input);
    } catch (err) {
      this.logger.warn(
        `Video createMeeting failed for conn ${conn.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  async cancelMeetingForUser(
    userId: string,
    provider: VideoProvider,
    externalMeetingId: string,
  ): Promise<void> {
    const conn = await this.connections.findOne({
      where: { user_id: userId, provider, is_active: true },
    });
    if (!conn) return;
    try {
      const adapter = this.adapter(provider);
      const tokens = this.cipher.decryptJson<Record<string, unknown>>(
        conn.encrypted_token_payload,
      );
      await adapter.cancelMeeting(tokens, externalMeetingId);
    } catch (err) {
      this.logger.warn(
        `Video cancelMeeting failed for conn ${conn.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
