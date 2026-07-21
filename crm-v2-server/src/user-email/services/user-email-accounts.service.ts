import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import {
  UserEmailAccount,
  UserEmailProvider,
} from '../entities/user-email-account.entity';
import { CredentialsCipher } from './credentials-cipher.service';
import {
  CreateSmtpAccountDto,
  UpdateUserEmailAccountDto,
  UserEmailAccountPublic,
} from '../dto/user-email-account.dto';

/**
 * Shape we persist inside `encrypted_credentials` for SMTP accounts.
 * Keeping an explicit discriminator makes it painless to decrypt when
 * OAuth tiers land and the blob schema changes.
 */
export interface SmtpCredentialsV1 {
  type: 'smtp';
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export interface OAuthCredentialsV1 {
  type: 'oauth';
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string;
}

export type StoredCredentials = SmtpCredentialsV1 | OAuthCredentialsV1;

@Injectable()
export class UserEmailAccountsService {
  private readonly logger = new Logger(UserEmailAccountsService.name);

  constructor(
    @InjectRepository(UserEmailAccount)
    private readonly accounts: Repository<UserEmailAccount>,
    private readonly cipher: CredentialsCipher,
    private readonly dataSource: DataSource,
  ) {}

  /** Strip the ciphertext before returning to the client. */
  private toPublic(entity: UserEmailAccount): UserEmailAccountPublic {
    return {
      id: entity.id,
      user_id: entity.user_id,
      provider: entity.provider,
      email_address: entity.email_address,
      display_name: entity.display_name,
      is_default: entity.is_default,
      is_active: entity.is_active,
      last_verified_at: entity.last_verified_at,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }

  async listForUser(userId: string): Promise<UserEmailAccountPublic[]> {
    const rows = await this.accounts.find({
      where: { user_id: userId },
      order: { is_default: 'DESC', created_at: 'DESC' },
    });
    return rows.map((r) => this.toPublic(r));
  }

  async getOwned(id: string, userId: string): Promise<UserEmailAccount> {
    const acct = await this.accounts.findOne({ where: { id } });
    if (!acct) throw new NotFoundException(`Email account ${id} not found`);
    if (acct.user_id !== userId) {
      // Don't leak existence to unrelated users.
      throw new NotFoundException(`Email account ${id} not found`);
    }
    return acct;
  }

  async createSmtp(
    userId: string,
    dto: CreateSmtpAccountDto,
  ): Promise<UserEmailAccountPublic> {
    const existing = await this.accounts.findOne({
      where: { user_id: userId, email_address: dto.email_address },
    });
    if (existing) {
      throw new BadRequestException(
        `You already have an account for ${dto.email_address}`,
      );
    }

    const credentials: SmtpCredentialsV1 = {
      type: 'smtp',
      host: dto.host,
      port: dto.port,
      secure: dto.secure ?? dto.port === 465,
      username: dto.username,
      password: dto.password,
    };

    // Promoting default requires a transaction — we never want two
    // accounts flagged default for the same user.
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(UserEmailAccount);
      const wantsDefault = dto.make_default === true;
      if (wantsDefault) {
        await repo.update(
          { user_id: userId, is_default: true },
          { is_default: false },
        );
      }

      // If the user has no accounts at all yet, make this one default
      // automatically — nobody benefits from a "no default" state.
      const hasAny = await repo.count({ where: { user_id: userId } });
      const isDefault = wantsDefault || hasAny === 0;

      const entity = repo.create({
        user_id: userId,
        provider: UserEmailProvider.SMTP,
        email_address: dto.email_address,
        display_name: dto.display_name ?? null,
        encrypted_credentials: this.cipher.encryptJson(credentials),
        is_default: isDefault,
        is_active: true,
        last_verified_at: null,
      });
      const saved = await repo.save(entity);
      return this.toPublic(saved);
    });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateUserEmailAccountDto,
  ): Promise<UserEmailAccountPublic> {
    const acct = await this.getOwned(id, userId);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(UserEmailAccount);

      if (dto.is_default === true && !acct.is_default) {
        await repo.update(
          { user_id: userId, is_default: true },
          { is_default: false },
        );
        acct.is_default = true;
      } else if (dto.is_default === false) {
        acct.is_default = false;
      }

      if (dto.is_active !== undefined) acct.is_active = dto.is_active;
      if (dto.display_name !== undefined)
        acct.display_name = dto.display_name || null;

      const saved = await repo.save(acct);

      // Always leave the user with a default if they still have active
      // accounts — otherwise the composer silently has nowhere to send.
      const stillDefault = await repo.count({
        where: { user_id: userId, is_default: true },
      });
      if (stillDefault === 0) {
        const candidate = await repo.findOne({
          where: { user_id: userId, is_active: true },
          order: { created_at: 'ASC' },
        });
        if (candidate) {
          candidate.is_default = true;
          await repo.save(candidate);
        }
      }

      return this.toPublic(saved);
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    const acct = await this.getOwned(id, userId);
    await this.accounts.remove(acct);

    // Same "always have a default" invariant as update().
    const hasDefault = await this.accounts.count({
      where: { user_id: userId, is_default: true },
    });
    if (hasDefault === 0) {
      const candidate = await this.accounts.findOne({
        where: { user_id: userId, is_active: true },
        order: { created_at: 'ASC' },
      });
      if (candidate) {
        candidate.is_default = true;
        await this.accounts.save(candidate);
      }
    }
  }

  /**
   * Resolve which account a send should use. Explicit `accountId` wins,
   * otherwise the default, otherwise any active account. Throws if the
   * user has none — callers should surface a "connect an account"
   * prompt rather than silently dropping the send.
   */
  async resolveSender(
    userId: string,
    accountId?: string,
  ): Promise<UserEmailAccount> {
    if (accountId) {
      const acct = await this.getOwned(accountId, userId);
      if (!acct.is_active) {
        throw new BadRequestException(
          `Account ${acct.email_address} is disabled`,
        );
      }
      return acct;
    }

    const def = await this.accounts.findOne({
      where: { user_id: userId, is_active: true, is_default: true },
    });
    if (def) return def;

    const anyActive = await this.accounts.findOne({
      where: { user_id: userId, is_active: true },
      order: { created_at: 'ASC' },
    });
    if (anyActive) return anyActive;

    throw new ForbiddenException(
      'No active email account configured — connect one in Settings first.',
    );
  }

  /**
   * Decrypts the stored credentials. Only to be called from inside the
   * user-email module — every other caller should use the sender.
   */
  decryptCredentials(acct: UserEmailAccount): StoredCredentials {
    return this.cipher.decryptJson<StoredCredentials>(
      acct.encrypted_credentials,
    );
  }

  /**
   * Runs `transporter.verify()` to confirm the SMTP credentials actually
   * open a session. Updates `last_verified_at` on success.
   */
  async verify(id: string, userId: string): Promise<{ ok: boolean; error?: string }> {
    const acct = await this.getOwned(id, userId);
    if (acct.provider !== UserEmailProvider.SMTP) {
      throw new BadRequestException(
        'OAuth providers (Gmail/Microsoft) verify via their own OAuth flow.',
      );
    }

    let creds: SmtpCredentialsV1;
    try {
      const raw = this.decryptCredentials(acct);
      if (raw.type !== 'smtp') {
        throw new Error('Credentials blob is not SMTP');
      }
      creds = raw;
    } catch (err) {
      this.logger.error(`Failed to decrypt credentials for ${acct.id}`, err);
      return {
        ok: false,
        error: 'Stored credentials could not be decrypted',
      };
    }

    const transport = nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.secure,
      auth: { user: creds.username, pass: creds.password },
    });
    try {
      await transport.verify();
      acct.last_verified_at = new Date();
      await this.accounts.save(acct);
      return { ok: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'SMTP connection failed';
      this.logger.warn(`SMTP verify failed for ${acct.email_address}: ${message}`);
      return { ok: false, error: message };
    } finally {
      transport.close();
    }
  }
}
