import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DealStageAutomationModule } from '../deals/deal-stage-automation.module';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { Activity } from './entities/activity.entity';
import { Task } from './entities/tasks.entity';
import { Note } from './entities/notes.entity';
import { Call } from './entities/calls.entity';
import { Email } from './entities/emails.entity';
import { Meeting } from './entities/meetings.entity';
import { WhatsAppMessage } from './entities/whats-app.entity';
import { Demo } from './entities/demos.entity';
import { ActivityAttachment } from './entities/activity-attachments.entity';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { CallOutcomeTag } from './entities/call-outcome-tags.entity';
import { TaskComment } from './entities/task-comments.entity';
import { ActivityComment } from './entities/activity-comments.entity';
import { Lead } from '../leads/entities/lead.entity';
import { User } from '../users/entities/user.entity';
import { WhatsAppSendService } from './whatsapp-send.service';
import { WhatsAppProvider } from '../notifications/providers/whatsapp.provider';
import { LeadsModule } from '../leads/leads.module';
import { CalendarSyncModule } from '../calendar-sync/calendar-sync.module';
import { SettingsModule } from '../settings/settings.module';
import { UserEmailModule } from '../user-email/user-email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Activity,
      Task,
      Note,
      Call,
      Email,
      Meeting,
      WhatsAppMessage,
      Demo,
      ActivityAttachment,
      CallOutcomeTag,
      TaskComment,
      ActivityComment,
      Lead,
      User
    ]),
    ActivityLogsModule,
    forwardRef(() => AuthModule),
    forwardRef(() => LeadsModule),
    CalendarSyncModule,
    SettingsModule,
    UserEmailModule,
    // Recording rule 3: ActivitiesService injects DealStageAutomationService,
    // so the module must be imported here as well as the symbol above.
    // TypeScript cannot catch this — a missing entry fails at BOOT with an
    // unresolved-dependency error, which crash-loops the API.
    DealStageAutomationModule,
  ],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, WhatsAppSendService, WhatsAppProvider],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
