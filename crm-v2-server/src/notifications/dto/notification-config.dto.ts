export class SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
}

export class SendGridConfig {
  apiKey: string;
  from?: string;
}

export class TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

export class AwsSnsConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class NotificationConfig {
  email?: {
    defaultFrom?: string;
    smtp?: SmtpConfig;
    sendgrid?: SendGridConfig;
  };
  sms?: {
    defaultFrom?: string;
    twilio?: TwilioConfig;
    awsSns?: AwsSnsConfig;
  };
  templates?: {
    path?: string;
    cache?: boolean;
  };
}
