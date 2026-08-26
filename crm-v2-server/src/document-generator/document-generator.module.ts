import { Module } from '@nestjs/common';
import { DocumentGeneratorService } from './document-generator.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [DocumentGeneratorService],
  exports: [DocumentGeneratorService],
})
export class DocumentGeneratorModule {}
