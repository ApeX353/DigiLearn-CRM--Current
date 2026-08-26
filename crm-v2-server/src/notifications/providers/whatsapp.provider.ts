import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WhatsAppSendOptions {
  to: string;
  templateName: string;
  templateVariables?: Record<string, string>;
  message?: string;
}

export interface WhatsAppResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppProvider.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly phoneId: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('WHATSAPP_API_URL') || '';
    this.apiKey = this.configService.get<string>('WHATSAPP_API_KEY') || '';
    this.phoneId = this.configService.get<string>('WHATSAPP_PHONE_ID') || '';
  }

  isConfigured(): boolean {
    return !!(this.apiUrl && this.apiKey && this.phoneId);
  }

  async sendTemplateMessage(
    options: WhatsAppSendOptions,
  ): Promise<WhatsAppResponse> {
    if (!this.isConfigured()) {
      this.logger.warn('WhatsApp provider is not configured');
      return { success: false, error: 'WhatsApp provider not configured' };
    }

    try {
      const phone = options.to.replace(/[^0-9+]/g, '');

      const payload: any = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: options.templateName,
          language: { code: 'en' },
          components: options.templateVariables
            ? [
                {
                  type: 'body',
                  parameters: Object.values(options.templateVariables).map(
                    (val) => ({
                      type: 'text',
                      text: val,
                    }),
                  ),
                },
              ]
            : [],
        },
      };

      const response = await fetch(
        `${this.apiUrl}/${this.phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`WhatsApp API error: ${response.status} ${errorBody}`);
        return { success: false, error: `WhatsApp API error: ${response.status}` };
      }

      const data = await response.json();
      const messageId = data?.messages?.[0]?.id;

      this.logger.log(`WhatsApp message sent to ${phone}, id: ${messageId}`);
      return { success: true, messageId };
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async sendTextMessage(
    to: string,
    message: string,
  ): Promise<WhatsAppResponse> {
    if (!this.isConfigured()) {
      return { success: false, error: 'WhatsApp provider not configured' };
    }

    try {
      const phone = to.replace(/[^0-9+]/g, '');

      const payload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message },
      };

      const response = await fetch(
        `${this.apiUrl}/${this.phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return { success: false, error: `WhatsApp API error: ${response.status}` };
      }

      const data = await response.json();
      return { success: true, messageId: data?.messages?.[0]?.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
