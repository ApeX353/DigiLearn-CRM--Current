export type UserEmailProvider = "smtp" | "gmail" | "microsoft";

export interface UserEmailAccount {
  id: string;
  user_id: string;
  provider: UserEmailProvider;
  email_address: string;
  display_name: string | null;
  is_default: boolean;
  is_active: boolean;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSmtpAccountDto {
  email_address: string;
  display_name?: string;
  host: string;
  port: number;
  secure?: boolean;
  username: string;
  password: string;
  make_default?: boolean;
}

export interface UpdateUserEmailAccountDto {
  is_active?: boolean;
  is_default?: boolean;
  display_name?: string;
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  fromAccountId: string;
  fromAddress: string;
}

export interface SendUserEmailDto {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_html: string;
  body_text?: string;
  account_id?: string;
  lead_id?: string;
  deal_id?: string;
  contact_id?: string;
}

export interface SendWithTemplateDto {
  to: string[];
  cc?: string[];
  bcc?: string[];
  template_id: string;
  account_id?: string;
  lead_id?: string;
  deal_id?: string;
  contact_id?: string;
}
