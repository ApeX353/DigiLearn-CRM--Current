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

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private emailProviders: Map<string, IEmailProvider> = new Map();
  private smsProviders: Map<string, ISmsProvider> = new Map();
  private templateEngine: MustacheTemplateEngine;
  private templatesPath: string;
  private defaultEmailFrom?: string;
  private defaultSmsFrom?: string;

  constructor(private config?: NotificationConfig) {
    this.templateEngine = new MustacheTemplateEngine(
      config?.templates?.cache ?? true,
    );
    this.templatesPath =
      config?.templates?.path ||
      join(process.cwd(), 'notifications', 'templates');
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

    if (!provider) {
      this.logger.error('No email provider available');
      return {
        success: false,
        error: 'No email provider available',
      };
    }

    const emailOptions = {
      ...options,
      from: options.from || this.defaultEmailFrom,
    };

    return provider.sendEmail(emailOptions);
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

    if (!provider) {
      this.logger.error('No SMS provider available');
      return {
        success: false,
        error: 'No SMS provider available',
      };
    }

    const smsOptions = {
      ...options,
      from: options.from || this.defaultSmsFrom,
    };

    return provider.sendSms(smsOptions);
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
