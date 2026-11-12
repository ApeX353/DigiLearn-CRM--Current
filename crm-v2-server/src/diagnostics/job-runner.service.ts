import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hostname } from 'os';
import { auditStorage, emptyAuditContext } from '../audit/audit-context';
import { getBuildInfo } from '../common/build-info';
import { AlertsService } from './alerts.service';
import { DiagnosticsService, fallbackLine } from './diagnostics.service';
import { JobRun } from './entities/job-run.entity';
import { jobDefinition, JobName } from './job-registry';

/** What a job body can tell the runner while it works. */
export interface JobContext {
  runId: string | null;
  /** Add to a named counter: ctx.count('breached') or ctx.count('checked', rows.length). */
  count(key: string, by?: number): void;
  /** Attach a free-form note to the run. */
  note(key: string, value: unknown): void;
  /** Stop here, recorded as `skipped` with the reason (a setting is off, nothing to do yet…). */
  skip(reason: string): never;
}

export interface JobOutcome {
  runId: string | null;
  status: 'ok' | 'failed' | 'skipped';
  counts: Record<string, number>;
  skipReason?: string;
  errorReference?: string;
  durationMs: number;
}

export interface RunOptions {
  trigger?: 'cron' | 'manual';
  triggeredBy?: string | null;
  /** After this long a `running` row is treated as abandoned by the clean-up job. */
  maxRuntimeMs?: number;
}

class JobSkip extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'JobSkip';
  }
}

export const DEFAULT_MAX_RUNTIME_MS = 2 * 60 * 60 * 1000;

/**
 * Runs a scheduled job and leaves a `job_runs` row behind: started, finished,
 * how long, what it counted, whether it failed (with the error's reference)
 * or was skipped and why. Two replicas cannot run the same job at once: the
 * partial unique index on job_runs(name) WHERE status='running' refuses the
 * second insert, which is recorded as `skipped / already_running`.
 *
 * The runner never throws. The body runs inside a job-scoped audit context,
 * so audit rows and diagnostics written by the job carry the run id.
 */
@Injectable()
export class JobRunnerService {
  private readonly logger = new Logger(JobRunnerService.name);
  private readonly host = safeHostname();

  /** Handlers the owning services registered, so a job can be run by name (manual trigger). */
  private readonly handlers = new Map<JobName, () => Promise<unknown>>();

  constructor(
    @InjectRepository(JobRun) private readonly jobRuns: Repository<JobRun>,
    private readonly diagnostics: DiagnosticsService,
    @Optional() private readonly alerts?: AlertsService,
  ) {}

  /** Each cron-owning service registers its handler once so POST /diagnostics/jobs/:name/run can call it. */
  registerHandler(name: JobName, handler: () => Promise<unknown>): void {
    this.handlers.set(name, handler);
  }

  registeredJobs(): JobName[] {
    return [...this.handlers.keys()];
  }

  /**
   * Runs a registered job now. The handler itself calls run(), so the run is
   * recorded like a cron run but with trigger=manual and the caller's id.
   */
  async runByName(name: JobName, triggeredBy: string | null): Promise<JobOutcome | { status: 'unregistered' }> {
    const handler = this.handlers.get(name);
    if (!handler) return { status: 'unregistered' };
    // The handler awaits run() internally and returns nothing useful, so the
    // outcome is handed back through a side channel keyed by job name.
    this.pendingManual = { trigger: 'manual', triggeredBy };
    this.lastOutcome.delete(name);
    try {
      await handler();
      return this.lastOutcome.get(name) ?? { runId: null, status: 'ok', counts: {}, durationMs: 0 };
    } finally {
      this.pendingManual = null;
    }
  }

  private pendingManual: RunOptions | null = null;
  private readonly lastOutcome = new Map<JobName, JobOutcome>();

  async run<T>(name: JobName, fn: (ctx: JobContext) => Promise<T>, opts: RunOptions = {}): Promise<JobOutcome> {
    if (this.pendingManual) {
      opts = { ...opts, ...this.pendingManual };
      this.pendingManual = null;
    }
    const outcome = await this.runInner(name, fn, opts);
    this.lastOutcome.set(name, outcome);
    return outcome;
  }

  private async runInner<T>(name: JobName, fn: (ctx: JobContext) => Promise<T>, opts: RunOptions): Promise<JobOutcome> {
    const def = jobDefinition(name);
    const title = def?.title ?? name;
    const startedAt = new Date();
    const counts: Record<string, number> = {};
    const notes: Record<string, unknown> = {};

    // 1. Claim the run. A 23505 here means another runner holds this job.
    let runId: string | null = null;
    try {
      const inserted = await this.jobRuns.insert({
        name,
        status: 'running',
        started_at: startedAt,
        host: this.host,
        app_commit: getBuildInfo().commit?.slice(0, 40) ?? null,
        trigger: opts.trigger ?? 'cron',
        triggered_by: opts.triggeredBy ?? null,
        notes: { max_runtime_ms: opts.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS },
      });
      runId = (inserted.identifiers[0]?.id as string) ?? null;
    } catch (e) {
      const code = (e as { driverError?: { code?: string } })?.driverError?.code;
      if (code === '23505') {
        await this.safeInsert({
          name,
          status: 'skipped',
          skip_reason: 'already_running',
          started_at: startedAt,
          finished_at: new Date(),
          duration_ms: 0,
          host: this.host,
          trigger: opts.trigger ?? 'cron',
          triggered_by: opts.triggeredBy ?? null,
        });
        this.logger.warn(`${title}: skipped, another runner holds it`);
        return { runId: null, status: 'skipped', counts, skipReason: 'already_running', durationMs: 0 };
      }
      // The table is unreachable; run the job anyway, its work matters more
      // than its record, and say so once.
      fallbackLine(`job_runs claim failed for ${name}`, { error: String(e) });
    }

    const ctx: JobContext = {
      runId,
      count: (key, by = 1) => {
        counts[key] = (counts[key] ?? 0) + by;
      },
      note: (key, value) => {
        notes[key] = value;
      },
      skip: (reason) => {
        throw new JobSkip(reason);
      },
    };

    const store = {
      ...emptyAuditContext(),
      source: 'script' as const,
      automationReason: `job:${name}`,
      requestId: runId ? `job-${runId.slice(0, 8)}` : `job-${name}`,
      startedAt,
      jobRunId: runId,
      jobName: name,
    };

    // 2. Do the work.
    let outcome: JobOutcome;
    try {
      await auditStorage.run(store, () => fn(ctx));
      const finished = new Date();
      outcome = { runId, status: 'ok', counts, durationMs: finished.getTime() - startedAt.getTime() };
      await this.finish(runId, { status: 'ok', finished_at: finished, duration_ms: outcome.durationMs, counts, notes });
      this.logger.log(`${title}: ${def ? def.describe(counts) : JSON.stringify(counts)} (${outcome.durationMs} ms)`);
    } catch (error) {
      const finished = new Date();
      const durationMs = finished.getTime() - startedAt.getTime();
      if (error instanceof JobSkip) {
        outcome = { runId, status: 'skipped', counts, skipReason: error.reason, durationMs };
        await this.finish(runId, {
          status: 'skipped',
          skip_reason: error.reason.slice(0, 200),
          finished_at: finished,
          duration_ms: durationMs,
          counts,
          notes,
        });
        this.logger.log(`${title}: skipped — ${error.reason}`);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        const reference = this.diagnostics.recordEvent({
          kind: 'job_failure',
          level: 'error',
          message: `${title} failed: ${message}`,
          error,
          source: 'job',
          details: { job: name, counts, notes, run_id: runId },
          request: { requestId: store.requestId },
        });
        outcome = { runId, status: 'failed', counts, errorReference: reference, durationMs };
        await this.finish(runId, {
          status: 'failed',
          finished_at: finished,
          duration_ms: durationMs,
          counts,
          notes,
          error_message: message.slice(0, 4000),
          error_reference: reference,
        });
        // One stdout line; AppLogger does not mirror this context (the row exists).
        this.logger.error(`${title} failed ref=${reference}: ${message}`, error instanceof Error ? error.stack : undefined);
        void this.alerts?.jobFailed(name, title, reference, message).catch(() => undefined);
      }
    }
    return outcome;
  }

  /** Rows still `running` past their declared maximum are not running anywhere. */
  async markLostRuns(): Promise<number> {
    const stale = await this.jobRuns
      .createQueryBuilder('j')
      .where("j.status = 'running'")
      .andWhere("j.started_at < now() - make_interval(secs => COALESCE((j.notes->>'max_runtime_ms')::bigint, :def) / 1000.0)", {
        def: DEFAULT_MAX_RUNTIME_MS,
      })
      .getMany();
    for (const run of stale) {
      await this.finish(run.id, {
        status: 'lost',
        finished_at: new Date(),
        error_message: 'Never finished; the process probably stopped while it ran.',
      });
    }
    return stale.length;
  }

  private async finish(runId: string | null, patch: Partial<JobRun>): Promise<void> {
    if (!runId) return;
    try {
      await this.jobRuns.update(runId, patch as never);
    } catch (e) {
      fallbackLine('job_runs update failed', { runId, patch: { ...patch, notes: undefined }, error: String(e) });
    }
  }

  private async safeInsert(row: Partial<JobRun>): Promise<void> {
    try {
      await this.jobRuns.insert(row as never);
    } catch (e) {
      fallbackLine('job_runs insert failed', { row: { ...row, notes: undefined }, error: String(e) });
    }
  }
}

/**
 * For services whose specs build them without the diagnostics module: runs
 * the body directly with a no-op context when no runner was injected.
 * Resolves to the run outcome (or undefined without a runner); the body's
 * own return value is not surfaced, so count what matters with ctx.count().
 */
export async function runJob<T>(
  runner: JobRunnerService | undefined,
  name: JobName,
  fn: (ctx: JobContext) => Promise<T>,
  opts?: RunOptions,
): Promise<JobOutcome | undefined> {
  if (runner) return runner.run(name, fn, opts);
  const ctx: JobContext = {
    runId: null,
    count: () => undefined,
    note: () => undefined,
    skip: (reason) => {
      throw new JobSkip(reason);
    },
  };
  try {
    await fn(ctx);
  } catch (e) {
    // Cron handlers never threw before this layer existed (each had its own
    // catch-and-log); without a runner to record the failure, keep that
    // contract and leave one line on stderr.
    if (!(e instanceof JobSkip)) fallbackLine(`job ${name} failed (no runner)`, { error: e instanceof Error ? e.stack ?? e.message : String(e) });
  }
  return undefined;
}

function safeHostname(): string {
  try {
    return hostname().slice(0, 100);
  } catch {
    return 'unknown';
  }
}
