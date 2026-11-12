import { Module, forwardRef } from '@nestjs/common';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentTermsModule } from '../payment-terms/payment-terms.module';
import { FinanceController } from './finance.controller';
import { FinanceReconciliationService } from './finance-reconciliation.service';

/**
 * Money invariants, the nightly check and the reviewed repairs (FIN-05,
 * FIN-07). DiagnosticsModule is global; on the production lineage
 * ActivityLogsModule is not, so it is imported here (21 Oct 2026 outage).
 */
@Module({
  imports: [forwardRef(() => AuthModule), PaymentTermsModule, ActivityLogsModule],
  controllers: [FinanceController],
  providers: [FinanceReconciliationService],
  exports: [FinanceReconciliationService],
})
export class FinanceModule {}
