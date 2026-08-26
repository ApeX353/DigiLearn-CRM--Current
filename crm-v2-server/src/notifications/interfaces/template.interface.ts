export interface TemplateData {
  [key: string]: any;
}

export interface ITemplateEngine {
  compile(template: string, data: TemplateData): string;
  compileFromFile(templatePath: string, data: TemplateData): Promise<string>;
}

export interface EmailTemplate {
  subject: string;
  html?: string;
  text?: string;
}

export interface SmsTemplate {
  message: string;
}
