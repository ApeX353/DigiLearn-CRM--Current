import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserCalendarConnection } from './entities/user-calendar-connection.entity';
import { CalendarEventLink } from './entities/calendar-event-link.entity';
import { Activity } from '../activities/entities/activity.entity';
import { Meeting } from '../activities/entities/meetings.entity';
import { CalendarSyncService } from './services/calendar-sync.service';
import { CalendarReconcilerService } from './services/calendar-reconciler.service';
import { MeetingCancellationService } from './services/meeting-cancellation.service';
import { GoogleCalendarAdapter } from './adapters/google-calendar.adapter';
import { MicrosoftCalendarAdapter } from './adapters/microsoft-calendar.adapter';
import { CalendarSyncController } from './calendar-sync.controller';
import { UserEmailModule } from '../user-email/user-email.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Section 2 of the spec: two-way sync with Google + Microsoft calendars.
 *
 * We lean on UserEmailModule's CredentialsCipher so OAuth token blobs
 * get the same AES-256-GCM treatment as SMTP passwords — one envelope
 * format for every user-owned secret in the system.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserCalendarConnection,
      CalendarEventLink,
      Activity,
      Meeting,
    ]),
    UserEmailModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [CalendarSyncController],
  providers: [
    CalendarSyncService,
    CalendarReconcilerService,
    MeetingCancellationService,
    GoogleCalendarAdapter,
    MicrosoftCalendarAdapter,
  ],
  exports: [CalendarSyncService, MeetingCancellationService],
})
export class CalendarSyncModule {}
