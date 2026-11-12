import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Lead } from '../leads/entities/lead.entity';
import { LeadSLA } from '../leads/entities/lead-sla.entity';
import { Deal } from '../deals/entities/deal.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { User } from '../users/entities/user.entity';
import { Activity } from '../activities/entities/activity.entity';
import { WhatsAppMessage } from '../activities/entities/whats-app.entity';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { LeadsModule } from '../leads/leads.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { LeadAssignmentProposal } from './entities/lead-assignment-proposal.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { LeadAutoRouterService } from './services/lead-auto-router.service';
import { LeadReactivationService } from './services/lead-reactivation.service';
import { FollowupDisciplineService } from './services/followup-discipline.service';
import { FollowupReminderService } from './services/followup-reminder.service';
import { DemoFollowupDraftService } from './services/demo-followup-draft.service';
import { WhatsappIngestService } from './services/whatsapp-ingest.service';
import { SocialHandoffService } from './services/social-handoff.service';
import { QuoteDraftService } from './services/quote-draft.service';
import { AttributionService } from './services/attribution.service';
import { AutomationController } from './automation.controller';

/**
 * Phase-2 automation features built from the DigiLearn automation
 * register. Isolated in one module so they can be reviewed and, if
 * needed, disabled as a unit.
 *
 * Cron jobs (drafts/queues/assignment only — never auto-send):
 *   #2 LeadAutoRouterService       — route unassigned leads + start SLA
 *   #3 LeadReactivationService     — stalled lead/deal draft outreach
 *   #4 FollowupDisciplineService   — daily no-next-step digest
 *   #7 DemoFollowupDraftService    — drafted demo follow-up packs
 * Endpoints (AutomationController):
 *   #5 WhatsappIngestService       — WhatsApp message ingestion
 *   #9 SocialHandoffService        — triaged inbound → CRM lead
 *   #8 QuoteDraftService           — read-only quote draft (no prices)
 *   #12 AttributionService         — lead source attribution
 *
 * Import set mirrors SlaModule (proven consumer of
 * UserNotificationsService via the AuthModule chain) plus LeadsModule
 * (for LeadsService, used by the social handoff).
 */
@Module({
  imports: [
    ScheduleModule,
    TypeOrmModule.forFeature([
      Lead,
      LeadSLA,
      Deal,
      Stage,
      User,
      Activity,
      WhatsAppMessage,
      LeadAssignmentProposal,
      NotificationPreference,
    ]),
    forwardRef(() => AuthModule),
    SettingsModule,
    LeadsModule,
    ActivityLogsModule,
  ],
  controllers: [AutomationController],
  providers: [
    LeadAutoRouterService,
    LeadReactivationService,
    FollowupDisciplineService,
    FollowupReminderService,
    DemoFollowupDraftService,
    WhatsappIngestService,
    SocialHandoffService,
    QuoteDraftService,
    AttributionService,
  ],
  exports: [
    LeadAutoRouterService,
    LeadReactivationService,
    FollowupDisciplineService,
    FollowupReminderService,
    DemoFollowupDraftService,
    WhatsappIngestService,
    SocialHandoffService,
    QuoteDraftService,
    AttributionService,
  ],
})
export class AutomationModule {}
