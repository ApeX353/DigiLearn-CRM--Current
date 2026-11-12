import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { CollectionsController } from './collections.controller';
import { ReportExportService } from './report-export.service';
import { ReportsReadService } from './reports-read.service';
import { Deal } from '../deals/entities/deal.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { Pipeline } from '../pipelines/entities/pipeline.entity';
import { User } from '../users/entities/user.entity';
import { School } from '../schools/entities/schools.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Installment } from '../payment-terms/entities/installment.entity';
import { Payment } from '../payments/entities/payment.entity';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Deal,
      Lead,
      Stage,
      Pipeline,
      User,
      School,
      Invoice,
      Installment,
      Payment,
    ]),
    forwardRef(() => AuthModule),
    DashboardModule,
  ],
  controllers: [ReportsController, CollectionsController],
  providers: [ReportExportService, ReportsReadService],
  exports: [ReportExportService, ReportsReadService],
})
export class ReportsModule {}
