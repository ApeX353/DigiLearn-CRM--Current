import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BugReport } from './entities/bug-report.entity';
import { User } from '../users/entities/user.entity';
import { BugReportsService } from './bug-reports.service';
import { BugReportsController } from './bug-reports.controller';
import { AuthModule } from '../auth/auth.module';
import { BugScreenshotsController } from './bug-screenshots.controller';
import { BugScreenshotsService } from './bug-screenshots.service';
import { ContentUploadLimitInterceptor } from '../file-manager/content-upload-limit.interceptor';

@Module({
  imports: [
    // User repo: resolve triage recipients by role and validate assignees.
    TypeOrmModule.forFeature([BugReport, User]),
    // RolesGuard needs CaslAbilityFactory etc. from AuthModule.
    forwardRef(() => AuthModule),
  ],
  controllers: [BugReportsController, BugScreenshotsController],
  providers: [
    BugReportsService,
    BugScreenshotsService,
    ContentUploadLimitInterceptor,
  ],
  exports: [BugReportsService],
})
export class BugReportsModule {}
