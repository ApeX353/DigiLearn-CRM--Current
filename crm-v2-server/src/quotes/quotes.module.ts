import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { Quote } from './entities/quote.entity';
import { DocumentItem } from '../document-items/entities/document-item.entity';
import { School } from '../schools/entities/schools.entity';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { PaymentTermsModule } from '../payment-terms/payment-terms.module';
import { DocumentGeneratorModule } from '../document-generator/document-generator.module';
import { FileManagerModule } from '../file-manager/file-manager.module';
import { AuthModule } from '../auth/auth.module';
import { CanAccessQuoteGuard } from './guards/can-access-quote.guard';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quote, DocumentItem, School]),
    ActivityLogsModule,
    PaymentTermsModule,
    DocumentGeneratorModule,
    FileManagerModule,
    SettingsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [QuotesController],
  providers: [QuotesService, CanAccessQuoteGuard],
  exports: [QuotesService],
})
export class QuotesModule {}
