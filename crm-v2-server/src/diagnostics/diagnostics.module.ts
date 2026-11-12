import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLog } from '../activity-logs/entities/activity-log.entity';
import { User } from '../users/entities/user.entity';
import { AlertsService } from './alerts.service';
import { AppLogger } from './app-logger';
import { ClientEventsController } from './client-events.controller';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsExceptionFilter } from './diagnostics-exception.filter';
import { DiagnosticsMaintenanceService } from './diagnostics-maintenance.service';
import { DiagnosticsService } from './diagnostics.service';
import { DiagnosticsVisibilityGuard } from './diagnostics-visibility.guard';
import { DiagnosticsLogService } from './diagnostics-log.service';
import { ClientEvent } from './entities/client-event.entity';
import { DeliveryAttempt } from './entities/delivery-attempt.entity';
import { JobRun } from './entities/job-run.entity';
import { SystemEvent } from './entities/system-event.entity';
import { JobRunnerService } from './job-runner.service';
import { RequestContextInterceptor } from './request-context.interceptor';

/**
 * Global so any service can inject DiagnosticsService or JobRunnerService
 * without importing the module; the filter and interceptor are registered
 * here, app-wide.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SystemEvent, JobRun, DeliveryAttempt, ClientEvent, ActivityLog, User])],
  controllers: [DiagnosticsController, ClientEventsController],
  providers: [
    DiagnosticsService,
    AppLogger,
    AlertsService,
    JobRunnerService,
    DiagnosticsMaintenanceService,
    DiagnosticsExceptionFilter,
    DiagnosticsVisibilityGuard,
    DiagnosticsLogService,
    RequestContextInterceptor,
    { provide: APP_FILTER, useClass: DiagnosticsExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
  exports: [DiagnosticsService, AppLogger, DiagnosticsExceptionFilter, JobRunnerService, AlertsService],
})
export class DiagnosticsModule {}
