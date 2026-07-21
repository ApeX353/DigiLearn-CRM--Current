import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { Invoice } from './entities/invoice.entity';
import { DocumentItem } from '../document-items/entities/document-item.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { School } from '../schools/entities/schools.entity';
import { Payment } from '../payments/entities/payment.entity';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { PaymentTermsModule } from '../payment-terms/payment-terms.module';
import { DocumentGeneratorModule } from '../document-generator/document-generator.module';
import { FileManagerModule } from '../file-manager/file-manager.module';
import { AuthModule } from '../auth/auth.module';
import { CanAccessInvoiceGuard } from './guards/can-access-invoice.guard';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, DocumentItem, Quote, School, Payment]),
    ActivityLogsModule,
    PaymentTermsModule,
    DocumentGeneratorModule,
    FileManagerModule,
    SettingsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService, CanAccessInvoiceGuard],
  exports: [InvoicesService],
})
export class InvoicesModule {}
