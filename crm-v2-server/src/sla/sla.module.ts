import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlaBreachService } from './sla-breach.service';
import { SlaController } from './sla.controller';
import { Lead } from '../leads/entities/lead.entity';
import { LeadSLA } from '../leads/entities/lead-sla.entity';
import { LeadSLAHistory } from '../leads/entities/lead-sla-history.entity';
import { Deal } from '../deals/entities/deal.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { User } from '../users/entities/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lead,
      LeadSLA,
      LeadSLAHistory,
      Deal,
      Stage,
      User,
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [SlaController],
  providers: [SlaBreachService],
  exports: [SlaBreachService],
})
export class SlaModule {}
