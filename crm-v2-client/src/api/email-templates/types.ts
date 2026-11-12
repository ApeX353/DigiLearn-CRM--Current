/**
 * Client-side shape for re-usable email templates.  Kept deliberately
 * small — the variable list is free-form and we don't constrain the
 * Mustache grammar on the frontend (the server will refuse anything it
 * can't parse at create time).
 */
export interface EmailTemplate {
  id: string;
  owner_user_id: string | null;
  slug: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  variables: string[] | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateEmailTemplateDto {
  slug: string;
  name: string;
  subject: string;
  body_html: string;
  body_text?: string;
  variables?: string[];
  category?: string;
  /** Only honoured when the caller is an admin. */
  is_shared?: boolean;
}

export interface UpdateEmailTemplateDto {
  slug?: string;
  name?: string;
  subject?: string;
  body_html?: string;
  body_text?: string;
  variables?: string[];
  category?: string;
  is_active?: boolean;
}

export interface RenderedEmail {
  subject: string;
  body_html: string;
  body_text: string;
}

export interface RenderContext {
  lead_id?: string;
  deal_id?: string;
  contact_id?: string;
}
