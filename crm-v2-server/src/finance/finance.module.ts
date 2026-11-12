import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentTermsModule } from '../payment-terms/payment-terms.module';
import { FinanceController } from './finance.controller';
import { FinanceReconciliationService } from './finance-reconciliation.service';

/**
 * Money invariants, the nightly check and the reviewed repairs (FIN-05,
 * FIN-07). DiagnosticsModule and ActivityLogsModule are global.
 */
@Module({
  imports: [forwardRef(() => AuthModule), PaymentTermsModule],
  controllers: [FinanceController],
  providers: [FinanceReconciliationService],
  exports: [FinanceReconciliationService],
})
export class FinanceModule {}
