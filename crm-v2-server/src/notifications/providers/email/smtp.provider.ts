import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { IEmailProvider, EmailOptions, EmailResponse } from '../../interfaces';
import { SmtpConfig } from '../../dto';

@Injectable()
export class SmtpEmailProvider implements IEmailProvider {
  public readonly name = 'SMTP';
  private transporter: Transporter | null = null;
  private readonly logger = new Logger(SmtpEmailProvider.name);

  constructor(private config?: SmtpConfig) {
    if (config) {
      this.configure(config);
    }
  }

  configure(config: SmtpConfig): void {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? false,
      auth: config.auth,
    });
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendEmail(options: EmailOptions): Promise<EmailResponse> {
    if (!this.isConfigured()) {
      this.logger.error('SMTP provider is not configured');
      return {
        success: false,
        error: 'SMTP provider is not configured',
      };
    }

    const t0 = Date.now();
    try {
      const info = await this.transporter!.sendMail({
        from: options.from,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: Array.isArray(options.cc) ? options.cc.join(', ') : options.cc,
        bcc: Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      });

      this.logger.log(`Email sent successfully: ${info.messageId}`);
      // nodemailer's `response` is the SMTP server's final line ("250 2.0.0 OK …");
      // `rejected` lists addresses the server refused even on a 250.
      const rejected = Array.isArray(info.rejected) ? info.rejected.length : 0;
      return {
        success: true,
        messageId: info.messageId,
        responseBody: [info.response, rejected ? `rejected: ${rejected}` : ''].filter(Boolean).join(' | ').slice(0, 2048),
        durationMs: Date.now() - t0,
      };
    } catch (error) {
      // The SMTP reply code (535 auth, 550 mailbox, 421 greylist…) is on the
      // error; it is what tells support whether this is credentials or the
      // recipient. Warn here; the caller records the attempt as a row.
      const code = (error as { responseCode?: number })?.responseCode;
      const reply = (error as { response?: string })?.response;
      this.logger.warn(`Failed to send email via SMTP${code ? ` (${code})` : ''}: ${error.message}`);
      return {
        success: false,
        error: error.message,
        status: typeof code === 'number' ? code : undefined,
        responseBody: typeof reply === 'string' ? reply.slice(0, 2048) : undefined,
        durationMs: Date.now() - t0,
      };
    }
  }
}
