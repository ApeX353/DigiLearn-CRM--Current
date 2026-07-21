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
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      this.logger.error('Failed to send email via SMTP', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
