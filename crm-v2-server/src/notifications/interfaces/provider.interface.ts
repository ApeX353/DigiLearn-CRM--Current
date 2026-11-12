export interface INotificationProvider {
  name: string;
  isConfigured(): boolean;
}

export interface EmailOptions {
  to: string | string[];
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
    contentType?: string;
  }>;
}

export interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IEmailProvider extends INotificationProvider {
  sendEmail(options: EmailOptions): Promise<EmailResponse>;
}

export interface SmsOptions {
  to: string;
  from?: string;
  message: string;
}

export interface SmsResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ISmsProvider extends INotificationProvider {
  sendSms(options: SmsOptions): Promise<SmsResponse>;
}
