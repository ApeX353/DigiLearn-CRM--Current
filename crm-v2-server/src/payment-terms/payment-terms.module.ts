import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentTermsController } from './payment-terms.controller';
import { PaymentTermsService } from './payment-terms.service';
import { PaymentTerm } from './entities/payment-term.entity';
import { PaymentTermPeriod } from './entities/payment-term-period.entity';
import { AppliedPaymentTerm } from './entities/applied-payment-term.entity';
import { Installment } from './entities/installment.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { Payment } from '../payments/entities/payment.entity';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { InstallmentCalculationService } from './installment-calculation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentTerm,
      PaymentTermPeriod,
      AppliedPaymentTerm,
      Installment,
      PaymentAllocation,
      Payment,
    ]),
    ActivityLogsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [PaymentTermsController],
  providers: [PaymentTermsService, InstallmentCalculationService],
  exports: [PaymentTermsService, InstallmentCalculationService],
})
export class PaymentTermsModule {}
