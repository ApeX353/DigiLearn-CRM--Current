import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
  private readonly logger = new Logger(SchedulingSweeperService.name);

  constructor(private readonly scheduling: SchedulingService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick(): Promise<void> {
    try {
      const result = await this.scheduling.expirePendingHolds();
      if (result.expired > 0) {
        this.logger.log(`Expired ${result.expired} pending hold(s)`);
      }
    } catch (err) {
      this.logger.error(
        'Scheduling sweeper tick failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
