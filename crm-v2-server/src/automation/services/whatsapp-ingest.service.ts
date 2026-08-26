import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Activity,
  ActivityStatus,
  ActivityType,
} from '../../activities/entities/activity.entity';
import {
  WhatsAppMessage,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
} from '../../activities/entities/whats-app.entity';
import { Lead } from '../../leads/entities/lead.entity';
import { IngestWhatsAppDto } from '../dto/ingest-whatsapp.dto';

/**
 * #5 — WhatsApp/SMS ingestion bridge (the in-CRM half).
 *
 * WhatsApp is the real sales channel (1,223 msgs vs 3 emails) but is
 * NOT connected, so temperature/triage/reactivation are half-blind.
 * This service is the landing zone: it takes already-normalized
 * messages and records them as `whatsapp` activities so they feed the
 * temperature engine and every downstream worklist.
 *
 * OUT OF SESSION (flagged, not built here): the external connector —
 * WhatsApp Business API/export access, phone→lead resolution, and a
 * privacy review. That connector calls this endpoint; it is a genuine
 * integration, not a script.
 *
 * Idempotent: each message's provider `externalId` is stored as
 * `thread_id = ext:<id>` and re-posts are skipped (no new id column
 * needed, so no migration). Recorded messages advance the lead's
 * last_contacted_at/last_action_at so recency scoring sees real touches.
 */
@Injectable()
export class WhatsappIngestService {
  private readonly logger = new Logger(WhatsappIngestService.name);

  constructor(
    @InjectRepository(WhatsAppMessage)
    private readonly whatsAppRepository: Repository<WhatsAppMessage>,
    private readonly dataSource: DataSource,
  ) {}

  async ingest(
    dto: IngestWhatsAppDto,
    userId: string,
  ): Promise<{ created: number; skipped: number; missingLead: number }> {
    let created = 0;
    let skipped = 0;
    let missingLead = 0;

    for (const msg of dto.messages) {
      if (!msg.leadId) {
        missingLead++;
        continue;
      }

      const dedupeKey = `ext:${msg.externalId}`;
      const existing = await this.whatsAppRepository.findOne({
        where: { thread_id: dedupeKey },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const ts = new Date(msg.timestamp);

      try {
        await this.dataSource.transaction(async (manager) => {
          const activity = new Activity();
          activity.type = ActivityType.WHATSAPP;
          activity.status = ActivityStatus.COMPLETED;
          activity.subject = `WhatsApp (${msg.direction})`;
          activity.description = msg.body.slice(0, 2000);
          activity.lead_id = msg.leadId as string;
          activity.created_by_id = userId;
          activity.is_automated = true;
          activity.completed_at = ts;
          const savedActivity = await manager.save(Activity, activity);

          const wa = new WhatsAppMessage();
          wa.activity_id = savedActivity.id;
          wa.phone_number = msg.phone;
          wa.message = msg.body;
          wa.direction = msg.direction;
          wa.message_type = WhatsAppMessageType.TEXT;
          wa.status = WhatsAppMessageStatus.DELIVERED;
          wa.sent_at = ts;
          wa.thread_id = dedupeKey;
          await manager.save(WhatsAppMessage, wa);

          // Advance recency only forward, never backward.
          const lead = await manager.findOne(Lead, {
            where: { id: msg.leadId as string },
          });
          if (lead) {
            const patch: Partial<Lead> = {};
            if (!lead.last_contacted_at || lead.last_contacted_at < ts) {
              patch.last_contacted_at = ts;
            }
            if (!lead.last_action_at || lead.last_action_at < ts) {
              patch.last_action_at = ts;
            }
            if (Object.keys(patch).length > 0) {
              await manager.update(Lead, msg.leadId as string, patch);
            }
          }
        });
        created++;
      } catch (e: any) {
        this.logger.error(
          `WhatsApp ingest failed for externalId ${msg.externalId}: ${e?.message}`,
        );
      }
    }

    this.logger.log(
      `WhatsApp ingest: ${created} created, ${skipped} duplicate, ${missingLead} skipped (no leadId)`,
    );
    return { created, skipped, missingLead };
  }
}
