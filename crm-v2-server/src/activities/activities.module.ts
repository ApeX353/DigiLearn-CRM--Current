import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { Activity } from './entities/activity.entity';
import { Task } from './entities/tasks.entity';
import { Note } from './entities/notes.entity';
import { Call } from './entities/calls.entity';
import { Email } from './entities/emails.entity';
import { Meeting } from './entities/meetings.entity';
import { WhatsAppMessage } from './entities/whats-app.entity';
import { ActivityAttachment } from './entities/activity-attachments.entity';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { CallOutcomeTag } from './entities/call-outcome-tags.entity';
import { TaskComment } from './entities/task-comments.entity';
import { ActivityComment } from './entities/activity-comments.entity';
import { Lead } from '../leads/entities/lead.entity';
import { User } from '../users/entities/user.entity';

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
      ActivityAttachment,
      CallOutcomeTag,
      TaskComment,
      ActivityComment,
      Lead,
      User
    ]),
    ActivityLogsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
