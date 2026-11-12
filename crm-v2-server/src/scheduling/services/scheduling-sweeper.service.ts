import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobRunnerService, runJob } from '../../diagnostics/job-runner.service';
import { SchedulingService } from './scheduling.service';

/**
 * Background maintenance for the scheduling module. Correctness of slot
 * availability does NOT depend on this cron — the slot query filters
 * by `expires_at > now()` — but we flip expired PENDING rows to the
 * EXPIRED state so the status column reflects reality in reports and
 * the table doesn't accumulate pseudo-active rows forever.
 */
@Injectable()
export class SchedulingSweeperService {
  constructor(
    private readonly scheduling: SchedulingService,
    @Optional() private readonly jobs?: JobRunnerService,
  ) {}

  onModuleInit(): void {
    this.jobs?.registerHandler('scheduling.expire_holds', () => this.tick());
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick(): Promise<void> {
    await runJob(this.jobs, 'scheduling.expire_holds', async (ctx) => {
      const result = await this.scheduling.expirePendingHolds();
      ctx.count('expired', result.expired);
    });
  }
}
