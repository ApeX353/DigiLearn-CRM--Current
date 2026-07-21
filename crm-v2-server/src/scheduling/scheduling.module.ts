import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulingLink } from './entities/scheduling-link.entity';
import { SchedulingHold } from './entities/scheduling-hold.entity';
import { Activity } from '../activities/entities/activity.entity';
import { Meeting } from '../activities/entities/meetings.entity';
import { User } from '../users/entities/user.entity';
import { SchedulingService } from './services/scheduling.service';
import { SchedulingSweeperService } from './services/scheduling-sweeper.service';
import { SchedulingController } from './scheduling.controller';
import { CalendarSyncModule } from '../calendar-sync/calendar-sync.module';
import { VideoIntegrationsModule } from '../video-integrations/video-integrations.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Section 2 of the spec — public "Calendly-style" booking links backed
 * by the same Activity/Meeting model the rest of the app uses, so a
 * booked slot shows up on the rep's dashboard with the same colour
 * coding as any other meeting.
 *
 * We pull Activity + Meeting from the activities module (no controller
 * bleed — we just need the repositories) and depend on
 * CalendarSyncModule to push confirmed bookings to the owner's external
 * calendars.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SchedulingLink,
      SchedulingHold,
      Activity,
      Meeting,
      User,
    ]),
    CalendarSyncModule,
    VideoIntegrationsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [SchedulingController],
  providers: [SchedulingService, SchedulingSweeperService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
