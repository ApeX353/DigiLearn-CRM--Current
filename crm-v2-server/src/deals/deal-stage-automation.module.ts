import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deal } from './entities/deal.entity';
import { DealStageHistory } from './entities/deal-stage-history.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { DealStageAutomationService } from './deal-stage-automation.service';

/**
 * Standalone home for DealStageAutomationService so that
 * ActivitiesModule and QuotesModule can import it without touching
 * DealsModule (which imports QuotesModule — a cycle waiting to happen).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Deal, DealStageHistory, Stage]),
    ActivityLogsModule,
  ],
  providers: [DealStageAutomationService],
  exports: [DealStageAutomationService],
})
export class DealStageAutomationModule {}
