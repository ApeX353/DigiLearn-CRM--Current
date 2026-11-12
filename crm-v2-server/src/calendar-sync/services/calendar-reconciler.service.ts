import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobRunnerService, runJob } from '../../diagnostics/job-runner.service';
import { CalendarSyncService } from './calendar-sync.service';

/**
 * Fallback reconciler — runs every 30 minutes as a safety net for
 * connections whose webhooks failed or whose watch channels expired.
 * Real-time updates come through the `/calendar-sync/webhook/*`
 * handlers; this cron just makes sure nothing stays stale for long.
 *
 * Kept small on purpose — all the heavy lifting lives on the sync
 * service so both code paths share behaviour.
 */
@Injectable()
export class CalendarReconcilerService {
  constructor(
    private readonly sync: CalendarSyncService,
    @Optional() private readonly jobs?: JobRunnerService,
  ) {}

  onModuleInit(): void {
    this.jobs?.registerHandler('calendar.reconcile', () => this.tick());
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async tick(): Promise<void> {
    await runJob(this.jobs, 'calendar.reconcile', async (ctx) => {
      const result = await this.sync.pullAll();
      ctx.count('pulled', result.pulled);
    });
  }
}
