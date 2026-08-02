import { forwardRef, Module } from '@nestjs/common';
import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deal } from './entities/deal.entity';
import { DealStageHistory } from './entities/deal-stage-history.entity';
import { DealCompetitor } from './entities/deal-competitor.entity';
import { DealHealthHistory } from './entities/deal-health-history.entity';
import { DealRollbackRequest } from './entities/deal-rollback-request.entity';
import { Pipeline } from '../pipelines/entities/pipeline.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { Lead } from '../leads/entities/lead.entity';
import { School } from '../schools/entities/schools.entity';
import { User } from '../users/entities/user.entity';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { QuotesModule } from '../quotes/quotes.module';
import { LeadsModule } from '../leads/leads.module';
import { DealHealthCalculationService } from './deal-health-calculation.service';
import { DealRollbackRequestsController } from './deal-rollback-requests.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Deal,
      DealStageHistory,
      DealCompetitor,
      DealHealthHistory,
      DealRollbackRequest,
      Pipeline,
      Stage,
      Lead,
      School,
      User,
    ]),
    ActivityLogsModule,
    forwardRef(() => QuotesModule),
    forwardRef(() => LeadsModule),
    forwardRef(() => AuthModule),
    SettingsModule,
  ],
  controllers: [DealsController, DealRollbackRequestsController],
  // NotificationsGateway comes from the global NotificationsGatewayModule
  // — it must NOT be re-provided here or a second socket.io instance is
  // created and real-time pushes break.
  providers: [DealsService, DealHealthCalculationService],
  exports: [DealsService],
})
export class DealsModule {}
