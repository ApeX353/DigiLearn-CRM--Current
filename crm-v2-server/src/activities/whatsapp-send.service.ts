import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Activity, ActivityType, ActivityStatus } from './entities/activity.entity';
import {
  WhatsAppMessage,
  WhatsAppDirection,
  WhatsAppMessageType,
  WhatsAppMessageStatus,
} from './entities/whats-app.entity';
import { Lead } from '../leads/entities/lead.entity';
import {
  WhatsAppProvider,
} from '../notifications/providers/whatsapp.provider';
import {
  WHATSAPP_TEMPLATES,
  WhatsAppTemplateName,
} from './constants/whatsapp-templates';

export interface SendWhatsAppDto {
  leadId: string;
  contactPhone: string;
  templateName: WhatsAppTemplateName;
  templateVariables?: Record<string, string>;
}

@Injectable()
export class WhatsAppSendService {
  private readonly logger = new Logger(WhatsAppSendService.name);

  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(WhatsAppMessage)
    private readonly whatsAppRepository: Repository<WhatsAppMessage>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    private readonly whatsAppProvider: WhatsAppProvider,
    private readonly dataSource: DataSource,
  ) {}

  async sendTemplateMessage(
    dto: SendWhatsAppDto,
    userId: string,
  ): Promise<{ activity: Activity; whatsAppMessage: WhatsAppMessage; sent: boolean }> {
    const template = WHATSAPP_TEMPLATES[dto.templateName];
    if (!template) {
      throw new BadRequestException(`Unknown template: ${dto.templateName}`);
    }

    const lead = await this.leadRepository.findOne({
      where: { id: dto.leadId },
    });
    if (!lead) {
      throw new BadRequestException('Lead not found');
    }

    // Send via WhatsApp API
    const apiResult = await this.whatsAppProvider.sendTemplateMessage({
      to: dto.contactPhone,
      templateName: dto.templateName,
      templateVariables: dto.templateVariables,
    });

    // Create Activity + WhatsAppMessage in a transaction
    return this.dataSource.transaction(async (manager) => {
      const activity = new Activity();
      activity.type = ActivityType.WHATSAPP;
      activity.status = apiResult.success ? ActivityStatus.COMPLETED : ActivityStatus.CANCELLED;
      activity.subject = `WhatsApp: ${template.displayName}`;
      activity.description = template.description;
      activity.lead_id = dto.leadId;
      activity.created_by_id = userId;
      activity.is_automated = false;
      if (apiResult.success) activity.completed_at = new Date();

      const savedActivity = await manager.save(Activity, activity);

      const whatsAppMessage = new WhatsAppMessage();
      whatsAppMessage.activity_id = savedActivity.id;
      whatsAppMessage.phone_number = dto.contactPhone;
      whatsAppMessage.message = template.description;
      whatsAppMessage.direction = WhatsAppDirection.OUTBOUND;
      whatsAppMessage.message_type = WhatsAppMessageType.TEXT;
      whatsAppMessage.status = apiResult.success
        ? WhatsAppMessageStatus.SENT
        : WhatsAppMessageStatus.FAILED;
      if (apiResult.success) whatsAppMessage.sent_at = new Date();

      const savedMessage = await manager.save(WhatsAppMessage, whatsAppMessage);

      // Update lead last_contacted_at and last_action_at
      await manager.update(Lead, dto.leadId, {
        last_contacted_at: new Date(),
        last_action_at: new Date(),
      });

      return {
        activity: savedActivity,
        whatsAppMessage: savedMessage,
        sent: apiResult.success,
      };
    });
  }
}
