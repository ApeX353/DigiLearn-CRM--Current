import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import {
  IEmailProvider,
  ISmsProvider,
  EmailOptions,
  SmsOptions,
  EmailResponse,
  SmsResponse,
  TemplateData,
} from './interfaces';
import { MustacheTemplateEngine } from './templates/template.engine';
import { NotificationConfig } from './dto';

/** What the diagnostics layer needs from a provider call; attached lazily (see AlertsService). */
export interface DeliveryRecorder {
  recordDelivery(input: {
    channel: 'email' | 'sms' | 'whatsapp';
    provider?: string | null;
    eventType?: string | null;
    target?: string | null;
    requestSummary?: Record<string, unknown> | null;
    responseStatus?: number | null;
    responseBody?: string | null;
    success: boolean;
    error?: string | null;
    durationMs?: number | null;
  }): void;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private emailProviders: Map<string, IEmailProvider> = new Map();
  private smsProviders: Map<string, ISmsProvider> = new Map();
  private templateEngine: MustacheTemplateEngine;
  private templatesPath: string;
  private defaultEmailFrom?: string;
  private defaultSmsFrom?: string;
  private recorder: DeliveryRecorder | null = null;

  /**
   * This service is built by a factory in NotificationsModule.forRoot, so it
   * cannot inject DiagnosticsService; the diagnostics module attaches itself
   * at boot. Until then (and in unit tests) nothing is recorded.
   */
  attachDeliveryRecorder(recorder: DeliveryRecorder): void {
    this.recorder = recorder;
  }

  private record(
    channel: 'email' | 'sms',
    provider: string | null,
    target: string,
    summary: Record<string, unknown>,
    result: EmailResponse | SmsResponse,
    durationMs: number,
  ): void {
    this.recorder?.recordDelivery({
      channel,
      provider,
      eventType: typeof summary.template === 'string' ? summary.template : null,
      target,
      requestSummary: summary,
      responseStatus: result.status ?? null,
      responseBody: result.responseBody ?? null,
      success: result.success,
      error: result.error ?? null,
      durationMs: result.durationMs ?? durationMs,
    });
  }

  constructor(private config?: NotificationConfig) {
    this.templateEngine = new MustacheTemplateEngine(
      config?.templates?.cache ?? true,
    );
    this.templatesPath =
      config?.templates?.path || join(__dirname, 'templates');
    this.defaultEmailFrom = config?.email?.defaultFrom;
    this.defaultSmsFrom = config?.sms?.defaultFrom;
  }

  registerEmailProvider(provider: IEmailProvider): void {
    if (provider.isConfigured()) {
      this.emailProviders.set(provider.name, provider);
      this.logger.log(`Email provider registered: ${provider.name}`);
    } else {
      this.logger.warn(
        `Email provider ${provider.name} is not configured and will not be registered`,
      );
    }
  } 

  registerSmsProvider(provider: ISmsProvider): void {
    if (provider.isConfigured()) {
      this.smsProviders.set(provider.name, provider);
      this.logger.log(`SMS provider registered: ${provider.name}`);
    } else {
      this.logger.warn(
        `SMS provider ${provider.name} is not configured and will not be registered`,
      );
    }
  }

  getEmailProvider(name?: string): IEmailProvider | undefined {
    if (name) {
      return this.emailProviders.get(name);
    }
    return this.emailProviders.values().next().value;
  }

  getSmsProvider(name?: string): ISmsProvider | undefined {
    if (name) {
      return this.smsProviders.get(name);
    }
    return this.smsProviders.values().next().value;
  }

  async sendEmail(
    options: EmailOptions,
    providerName?: string,
  ): Promise<EmailResponse> {
    const provider = this.getEmailProvider(providerName);
    const target = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    const summary = {
      subject: options.subject?.slice(0, 120),
      has_html: !!options.html,
      has_text: !!options.text,
      attachments: options.attachments?.length ?? 0,
      cc: Array.isArray(options.cc) ? options.cc.length : options.cc ? 1 : 0,
    };

    if (!provider) {
      // Not an error of this request: the deployment has no e-mail provider.
      // Recorded as a failed attempt so the gap shows on the health page.
      this.logger.warn('No email provider available');
      const result: EmailResponse = { success: false, error: 'No email provider available' };
      this.record('email', null, target, summary, result, 0);
      return result;
    }

    const emailOptions = {
      ...options,
      from: options.from || this.defaultEmailFrom,
    };

    const t0 = Date.now();
    const result = await provider.sendEmail(emailOptions);
    this.record('email', provider.name, target, summary, result, Date.now() - t0);
    return result;
  }

  async sendEmailWithTemplate(
    to: string | string[],
    subject: string,
    templateName: string,
    data: TemplateData,
    providerName?: string,
    options?: {
      attachments?: EmailOptions['attachments'];
    },
  ): Promise<EmailResponse> {
    try {
      const htmlPath = join(this.templatesPath, 'email', `${templateName}.html`);
      const txtPath = join(this.templatesPath, 'email', `${templateName}.txt`);

      const [html, text] = await Promise.all([
        this.templateEngine.compileFromFile(htmlPath, data),
        this.templateEngine
          .compileFromFile(txtPath, data)
          .catch(() => undefined),
      ]);

      return this.sendEmail(
        {
          to,
          subject,
          html,
          text,
          attachments: options?.attachments,
        },
        providerName,
      );
    } catch (error) {
      this.logger.error(`Failed to send email with template: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async sendSms(
    options: SmsOptions,
    providerName?: string,
  ): Promise<SmsResponse> {
    const provider = this.getSmsProvider(providerName);
    const summary = { length: options.message?.length ?? 0 };

    if (!provider) {
      // There is no SMS provider in this deployment at all; every SMS path
      // (2FA by SMS included) ends here. Recorded so the gap is visible.
      this.logger.warn('No SMS provider available');
      const result: SmsResponse = { success: false, error: 'No SMS provider available' };
      this.record('sms', null, options.to, summary, result, 0);
      return result;
    }

    const smsOptions = {
      ...options,
      from: options.from || this.defaultSmsFrom,
    };

    const t0 = Date.now();
    const result = await provider.sendSms(smsOptions);
    this.record('sms', provider.name, options.to, summary, result, Date.now() - t0);
    return result;
  }

  async sendSmsWithTemplate(
    to: string,
    templateName: string,
    data: TemplateData,
    providerName?: string,
  ): Promise<SmsResponse> {
    try {
      const templatePath = join(
        this.templatesPath,
        'sms',
        `${templateName}.txt`,
      );
      const message = await this.templateEngine.compileFromFile(
        templatePath,
        data,
      );

      return this.sendSms({ to, message }, providerName);
    } catch (error) {
      this.logger.error(`Failed to send SMS with template: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async sendPasswordReset(
    email: string,
    name: string,
    resetLink: string,
    options?: {
      token?: string;
      expiryHours?: number;
      appName?: string;
    },
  ): Promise<EmailResponse> {
    const data: TemplateData = {
      name,
      resetLink,
      hasToken: !!options?.token,
      token: options?.token,
      expiryHours: options?.expiryHours || 24,
      appName: options?.appName || 'DigiLearn',
      year: new Date().getFullYear(),
    };

    return this.sendEmailWithTemplate(
      email,
      'Password Reset Request',
      'password-reset',
      data,
    );
  }

  async send2FACode(
    email: string,
    name: string,
    code: string,
    options?: {
      expiryMinutes?: number;
      appName?: string;
      ipAddress?: string;
      location?: string;
    },
  ): Promise<EmailResponse> {
    const data: TemplateData = {
      name,
      code,
      expiryMinutes: options?.expiryMinutes || 10,
      appName: options?.appName || 'DigiLearn',
      year: new Date().getFullYear(),
      ipAddress: options?.ipAddress,
      location: options?.location,
      timestamp: new Date().toLocaleString(),
    };

    return this.sendEmailWithTemplate(
      email,
      'Two-Factor Authentication Code',
      '2fa-otp',
      data,
    );
  }

  async send2FACodeSms(
    phoneNumber: string,
    code: string,
    options?: {
      expiryMinutes?: number;
      appName?: string;
    },
  ): Promise<SmsResponse> {
    const data: TemplateData = {
      code,
      expiryMinutes: options?.expiryMinutes || 10,
      appName: options?.appName || 'DigiLearn',
    };

    return this.sendSmsWithTemplate(phoneNumber, '2fa-otp', data);
  }

  async sendRegistrationSuccess(
    email: string,
    name: string,
    username: string,
    options?: {
      role?: string;
      needsVerification?: boolean;
      verificationLink?: string;
      loginLink?: string;
      onboardingLink?: string;
      supportEmail?: string;
      appName?: string;
    },
  ): Promise<EmailResponse> {
    const data: TemplateData = {
      name,
      email,
      username,
      role: options?.role,
      registrationDate: new Date().toLocaleDateString(),
      needsVerification: options?.needsVerification || false,
      verificationLink: options?.verificationLink,
      loginLink: options?.loginLink,
      hasOnboarding: !!options?.onboardingLink,
      onboardingLink: options?.onboardingLink,
      supportEmail: options?.supportEmail,
      appName: options?.appName || 'DigiLearn',
      year: new Date().getFullYear(),
    };

    return this.sendEmailWithTemplate(
      email,
      `Welcome to ${options?.appName || 'DigiLearn'}!`,
      'registration-success',
      data,
    );
  }

  clearTemplateCache(): void {
    this.templateEngine.clearCache();
    this.logger.log('Template cache cleared');
  }
}
