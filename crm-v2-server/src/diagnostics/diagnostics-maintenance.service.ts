import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { DiagnosticsService } from './diagnostics.service';
import { JobRunnerService } from './job-runner.service';
import { JOBS } from './job-registry';

const BATCH = 5000;
const TABLES = ['system_events', 'job_runs', 'delivery_attempts', 'client_events'] as const;

/**
 * Keeps the diagnostics tables at 30 days (setting diagnostics.retention_days)
 * and marks runs that never finished. Runs through the job runner like every
 * other job, so it is visible on the System Health page too.
 * `activity_logs` is deliberately not touched: it is the business record.
 */
@Injectable()
export class DiagnosticsMaintenanceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly diagnostics: DiagnosticsService,
    private readonly jobs: JobRunnerService,
  ) {}

  @Cron(JOBS['diagnostics.prune'].cron)
  async handlePrune(): Promise<void> {
    await this.jobs.run('diagnostics.prune', async (ctx) => {
      const days = await this.diagnostics.getNumberSetting('diagnostics.retention_days', 30);
      ctx.note('retention_days', days);
      for (const table of TABLES) {
        let removed = 0;
        for (;;) {
          const result: unknown = await this.dataSource.query(
            `DELETE FROM ${table} WHERE id IN (
               SELECT id FROM ${table} WHERE created_at < now() - make_interval(days => $1)
               ORDER BY created_at LIMIT ${BATCH})`,
            [days],
          );
          const affected = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
          removed += affected;
          if (affected < BATCH) break;
        }
        ctx.count(table, removed);
      }
      ctx.count('lost_runs', await this.jobs.markLostRuns());
    });
  }
}
