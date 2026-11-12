import { Global, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLog } from './entities/activity-log.entity';
import { ActivityLogsService } from './activity-logs.service';
import { ActivityLogsController } from './activity-logs.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Global since 14 Oct 2026: the audit trail is written from users, rbac,
 * settings and sla as well, and those modules should not each have to
 * import this one to record who changed what.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityLog]),
    forwardRef(() => AuthModule),
  ],
  controllers: [ActivityLogsController],
  providers: [ActivityLogsService],
  exports: [ActivityLogsService],
})
export class ActivityLogsModule {}
