import { Injectable, Logger, BadRequestException, Optional } from '@nestjs/common';
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
import { DiagnosticsService } from '../diagnostics/diagnostics.service';
import {
  WHATSAPP_TEMPLATES,
  WhatsAppTemplateName,
} from './constants/whatsapp-templates';

// The request shape lives in dto/send-whatsapp.dto.ts (a validated class);
// this service only needs the type.
export type { SendWhatsAppDto } from './dto/send-whatsapp.dto';
import type { SendWhatsAppDto } from './dto/send-whatsapp.dto';

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
    @Optional() private readonly diagnostics?: DiagnosticsService,
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

    // Send via WhatsApp API. The provider's answer is recorded whatever it
    // was; before this a refused send kept only the word "failed".
    const apiResult = await this.whatsAppProvider.sendTemplateMessage({
      to: dto.contactPhone,
      templateName: dto.templateName,
      templateVariables: dto.templateVariables,
    });
    this.diagnostics?.recordDelivery({
      channel: 'whatsapp',
      provider: 'meta',
      eventType: dto.templateName,
      target: dto.contactPhone,
      entity: 'Lead',
      entityId: dto.leadId,
      requestSummary: { template: dto.templateName, variables: Object.keys(dto.templateVariables ?? {}) },
      responseStatus: apiResult.status ?? null,
      responseBody: apiResult.responseBody ?? null,
      success: apiResult.success,
      error: apiResult.error ?? null,
      durationMs: apiResult.durationMs ?? null,
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
      whatsAppMessage.failure_reason = apiResult.success
        ? null
        : [apiResult.error, apiResult.responseBody].filter(Boolean).join(' — ').slice(0, 4000) || 'send failed';

      const savedMessage = await manager.save(WhatsAppMessage, whatsAppMessage);

      // A message the provider refused never reached the school, so it is
      // not contact: `last_contacted_at` moves only on success. The attempt
      // is still work the rep did, so `last_action_at` moves either way
      // (the idle-lead and SLA sweeps read it — see sla-scheduler.service).
      const now = new Date();
      await manager.update(
        Lead,
        dto.leadId,
        apiResult.success
          ? { last_contacted_at: now, last_action_at: now }
          : { last_action_at: now },
      );

      return {
        activity: savedActivity,
        whatsAppMessage: savedMessage,
        sent: apiResult.success,
      };
    });
  }
}
