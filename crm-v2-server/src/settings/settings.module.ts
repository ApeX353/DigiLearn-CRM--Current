import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { ComplianceSettingsService } from './compliance-settings.service';
import { Settings } from './entities/settings.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Settings]), forwardRef(() => AuthModule)],
  controllers: [SettingsController],
  providers: [SettingsService, ComplianceSettingsService],
  exports: [SettingsService, ComplianceSettingsService],
})
export class SettingsModule {}
