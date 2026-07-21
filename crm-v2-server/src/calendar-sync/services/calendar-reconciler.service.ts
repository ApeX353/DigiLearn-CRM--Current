import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CalendarSyncService } from './calendar-sync.service';

/**
 * Fallback reconciler — runs every 15 minutes as a safety net for
 * connections whose webhooks failed or whose watch channels expired.
 * Real-time updates come through the `/calendar-sync/webhook/*`
 * handlers; this cron just makes sure nothing stays stale for long.
 *
 * Kept small on purpose — all the heavy lifting lives on the sync
 * service so both code paths share behaviour.
 */
@Injectable()
export class CalendarReconcilerService {
  private readonly logger = new Logger(CalendarReconcilerService.name);

  constructor(private readonly sync: CalendarSyncService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async tick(): Promise<void> {
    try {
      const result = await this.sync.pullAll();
      if (result.pulled > 0) {
        this.logger.log(`Reconciler pulled ${result.pulled} event(s)`);
      }
    } catch (err) {
      this.logger.error(
        'Reconciler tick failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
