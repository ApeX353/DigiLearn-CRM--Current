import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BugReport } from './entities/bug-report.entity';
import { User } from '../users/entities/user.entity';
import { BugReportsService } from './bug-reports.service';
import { BugReportsController } from './bug-reports.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    // User repo: resolve triage recipients by role and validate assignees.
    TypeOrmModule.forFeature([BugReport, User]),
    // RolesGuard needs CaslAbilityFactory etc. from AuthModule.
    forwardRef(() => AuthModule),
  ],
  controllers: [BugReportsController],
  providers: [BugReportsService],
  exports: [BugReportsService],
})
export class BugReportsModule {}
