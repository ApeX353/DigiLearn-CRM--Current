import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailSequence } from './entities/email-sequence.entity';
import { EmailQueue } from './entities/email-queue.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { EmailSequenceService } from './email-sequence.service';
import { EmailSequenceSchedulerService } from './email-sequence-scheduler.service';
import { EmailSequencesController } from './email-sequences.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ScheduleModule,
    TypeOrmModule.forFeature([
      EmailSequence,
      EmailQueue,
      Lead,
      Contact,
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [EmailSequencesController],
  providers: [EmailSequenceService, EmailSequenceSchedulerService],
  exports: [EmailSequenceService],
})
export class EmailSequencesModule {}
