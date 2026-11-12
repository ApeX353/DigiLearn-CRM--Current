import {
  BadRequestException,
  Injectable,
  Logger,
  NotImplementedException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { assertSafeSmtpHost, SMTP_TIMEOUTS } from '../smtp-host-guard';
import { UserEmailProvider } from '../entities/user-email-account.entity';
import {
  UserEmailAccountsService,
  SmtpCredentialsV1,
} from './user-email-accounts.service';

export interface SendUserEmailRequest {
  userId: string;
  /** Optional account override. Defaults to the caller's default sender. */
  accountId?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_html: string;
  body_text?: string;
}

export interface UserEmailSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  fromAccountId: string;
  fromAddress: string;
}

/**
 * Routes outgoing mail through the caller's own `UserEmailAccount`.
 * Only SMTP is live today; the OAuth branches are stubbed so anything
 * trying to send through Gmail/Outlook fails loudly instead of silently
 * hitting the notifications module's shared relay.
 *
 * This module is intentionally thin — no retries, no queuing, no
 * templating. Those belong to callers (e.g. the email-sequences module
 * wraps this in a cron + retry loop).
 */
@Injectable()
export class UserEmailSenderService {
  private readonly logger = new Logger(UserEmailSenderService.name);

  constructor(private readonly accounts: UserEmailAccountsService) {}

  async send(req: SendUserEmailRequest): Promise<UserEmailSendResult> {
    if (!req.to?.length) {
      throw new BadRequestException('At least one "to" address is required');
    }

    const acct = await this.accounts.resolveSender(req.userId, req.accountId);

    switch (acct.provider) {
      case UserEmailProvider.SMTP:
        return this.sendViaSmtp(acct, req);
      case UserEmailProvider.GMAIL:
      case UserEmailProvider.MICROSOFT:
        // Hard failure is better than pretending — the UI copy makes
        // this actionable ("connect your account").
        throw new NotImplementedException(
          `${acct.provider} sending is not wired up yet; use SMTP for now.`,
        );
      default:
        throw new BadRequestException(`Unknown provider: ${String(acct.provider)}`);
    }
  }

  private async sendViaSmtp(
    acct: { id: string; email_address: string; display_name: string | null },
    req: SendUserEmailRequest,
  ): Promise<UserEmailSendResult> {
    // Fetch the full entity (with ciphertext) then decrypt.
    const full = await this.accounts.getOwned(acct.id, req.userId);
    const raw = this.accounts.decryptCredentials(full);
    if (raw.type !== 'smtp') {
      throw new BadRequestException(
        'Stored credentials do not match SMTP provider',
      );
    }
    const creds: SmtpCredentialsV1 = raw;

    // C-05: re-check the host immediately before connecting, so a DNS
    // record that changed since the account was saved is caught here.
    await assertSafeSmtpHost(creds.host);

    const transport = nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.secure,
      auth: { user: creds.username, pass: creds.password },
      ...SMTP_TIMEOUTS,
    });

    const fromHeader = acct.display_name
      ? `"${acct.display_name}" <${acct.email_address}>`
      : acct.email_address;

    try {
      const info = await transport.sendMail({
        from: fromHeader,
        to: req.to,
        cc: req.cc?.length ? req.cc : undefined,
        bcc: req.bcc?.length ? req.bcc : undefined,
        subject: req.subject,
        html: req.body_html,
        text: req.body_text,
      });

      this.logger.log(
        `Email sent via ${acct.email_address} (${info.messageId})`,
      );

      return {
        messageId: info.messageId,
        accepted: (info.accepted as string[]) ?? req.to,
        rejected: (info.rejected as string[]) ?? [],
        fromAccountId: acct.id,
        fromAddress: acct.email_address,
      };
    } finally {
      transport.close();
    }
  }
}
