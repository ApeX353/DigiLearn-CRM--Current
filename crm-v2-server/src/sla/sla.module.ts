import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SlaBreachService } from './sla-breach.service';
import { SlaSchedulerService } from './sla-scheduler.service';
import { SlaController } from './sla.controller';
import { Lead } from '../leads/entities/lead.entity';
import { LeadSLA } from '../leads/entities/lead-sla.entity';
import { LeadSLAHistory } from '../leads/entities/lead-sla-history.entity';
import { Deal } from '../deals/entities/deal.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { User } from '../users/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { Activity } from '../activities/entities/activity.entity';

@Module({
  imports: [
    ScheduleModule,
    TypeOrmModule.forFeature([
      Lead,
      LeadSLA,
      LeadSLAHistory,
      Deal,
      Stage,
      User,
      Activity,
    ]),
    forwardRef(() => AuthModule),
    SettingsModule,
  ],
  controllers: [SlaController],
  providers: [SlaBreachService, SlaSchedulerService],
  exports: [SlaBreachService],
})
export class SlaModule {}
