import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Deal } from '../deals/entities/deal.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Activity } from '../activities/entities/activity.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { LeadQualificationCriteria } from '../leads/entities/lead-qualification-criteria.entity';
import { User } from '../users/entities/user.entity';
import { DocumentItem } from '../document-items/entities/document-item.entity';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    SettingsModule,
    TypeOrmModule.forFeature([
      Deal,
      Lead,
      Invoice,
      Payment,
      Activity,
      Stage,
      LeadQualificationCriteria,
      User,
      DocumentItem,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
