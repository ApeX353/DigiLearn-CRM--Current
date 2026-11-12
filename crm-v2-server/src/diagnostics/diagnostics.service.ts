import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, MoreThan, Repository } from 'typeorm';
import { hostname } from 'os';
import {
  paginate,
  Pagination,
} from 'nestjs-typeorm-paginate';
import { getAuditContext } from '../audit/audit-context';
import { getBuildInfo } from '../common/build-info';
import { ActivityLog } from '../activity-logs/entities/activity-log.entity';
import { User } from '../users/entities/user.entity';
import {
  SystemEvent,
  SystemEventKind,
  SystemEventLevel,
  SystemEventSource,
} from './entities/system-event.entity';
import { JobRun } from './entities/job-run.entity';
import { DeliveryAttempt, DeliveryChannel } from './entities/delivery-attempt.entity';
import { ClientEvent, ClientEventKind } from './entities/client-event.entity';
import { newReference } from './reference';
import { BODY_LIMITS, RESPONSE_LIMITS, maskPii, maskTarget, sanitize } from './masking';
import { QueryEventsDto } from './dto/query-events.dto';
import { isOverdue, JOB_NAMES, JOBS } from './job-registry';

export interface RecordEventInput {
  kind: SystemEventKind;
  level?: SystemEventLevel;
  /** One sentence, already safe to show a reader. */
  message: string;
  /** The thrown value, if any; name/stack are taken from it. */
  error?: unknown;
  statusCode?: number | null;
  entity?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  source?: SystemEventSource;
  /** Request facts the filter knows better than the context store. */
  request?: {
    method?: string | null;
    path?: string | null;
    params?: unknown;
    query?: unknown;
    body?: unknown;
    userId?: string | null;
    userRoles?: string[] | null;
    requestId?: string | null;
  };
  /** Pre-chosen reference (the filter picks one before persisting). */
  reference?: string;
  /** Dedupe key: at most one row per key per minute. */
  dedupeKey?: string;
}

export interface RecordDeliveryInput {
  channel: DeliveryChannel;
  provider?: string | null;
  eventType?: string | null;
  target?: string | null;
  entity?: string | null;
  entityId?: string | null;
  requestSummary?: Record<string, unknown> | null;
  responseStatus?: number | null;
  responseBody?: string | null;
  success: boolean;
  error?: string | null;
  durationMs?: number | null;
}

export interface ClientEventInput {
  kind: ClientEventKind;
  message: string;
  stack?: string | null;
  pageUrl?: string | null;
  userAgent?: string | null;
  appCommit?: string | null;
  apiReference?: string | null;
  requestId?: string | null;
  statusCode?: number | null;
  details?: Record<string, unknown> | null;
  occurredAt?: string | Date | null;
}

type QueuedRow =
  | { table: 'system_events'; row: Partial<SystemEvent> }
  | { table: 'delivery_attempts'; row: Partial<DeliveryAttempt> }
  | { table: 'client_events'; row: Partial<ClientEvent> };

/** What Repository.insert() accepts; jsonb columns need the cast. */
type InsertRows<T extends object> = Parameters<Repository<T>['insert']>[0];

const QUEUE_MAX = 1000;
const FLUSH_EVERY_MS = 1000;
const FLUSH_AT = 50;
const DEDUPE_WINDOW_MS = 60_000;
const SETTINGS_TTL_MS = 60_000;
const BURST_WINDOW_MS = 5 * 60_000;
const BURST_THRESHOLD = 10;
const CONSECUTIVE_DELIVERY_FAILURES = 3;
const USER_ERRORS_PER_DAY = 3;
const USER_DENIALS_PER_DAY = 5;
const LAST_SEEN_EVERY_MS = 5 * 60_000;

/** What AlertsService offers; registered at boot to avoid a DI cycle. */
export interface AlertSink {
  errorBurst(count: number, windowMinutes: number, sampleReference: string | null): Promise<void>;
  deliveryFailures(channel: string, consecutive: number, lastError: string | null): Promise<void>;
  userStruggling(userId: string, userName: string, errors: number, denials: number, page: string | null): Promise<void>;
}

/**
 * The one place the API writes its own trouble.
 *
 * Rules that every method keeps:
 *  - never throws, never awaits the database on the caller's path;
 *  - a reference is returned synchronously so the user can be told it even
 *    if the row is written a second later (or never, if Postgres is the
 *    thing that failed — then the row goes to stdout as one JSON line);
 *  - bodies and messages pass through `masking.ts` before they are kept.
 */
@Injectable()
export class DiagnosticsService implements OnApplicationShutdown {
  /** For code that runs with no DI at hand (process handlers in main.ts). */
  private static instance: DiagnosticsService | null = null;

  readonly enabled = process.env.DIAGNOSTICS_ENABLED !== 'false';
  private readonly host = safeHostname();
  private queue: QueuedRow[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;
  private readonly dedupe = new Map<string, { at: number; reference: string; count: number }>();
  private readonly settings = new Map<string, { value: unknown; at: number }>();
  private alerts: AlertSink | null = null;
  /** Timestamps of recent 5xx, for burst detection. */
  private burst: number[] = [];
  private burstAlertedAt = 0;
  private readonly consecutiveFailures = new Map<string, { n: number; lastError: string | null }>();
  /** Per user per day: errors and denials seen, and whether support was told. */
  private readonly userDay = new Map<string, { day: string; errors: number; denials: number; page: string | null; alerted: boolean }>();
  private readonly lastSeen = new Map<string, number>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(SystemEvent) private readonly events: Repository<SystemEvent>,
    @InjectRepository(JobRun) private readonly jobRuns: Repository<JobRun>,
    @InjectRepository(DeliveryAttempt) private readonly deliveries: Repository<DeliveryAttempt>,
    @InjectRepository(ClientEvent) private readonly clientEvents: Repository<ClientEvent>,
    @InjectRepository(ActivityLog) private readonly activityLogs: Repository<ActivityLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    DiagnosticsService.instance = this;
    this.timer = setInterval(() => void this.flush(), FLUSH_EVERY_MS);
    this.timer.unref?.();
  }

  // ---------------------------------------------------------------- writes

  /** Records one thing that went wrong. Returns the reference immediately. */
  recordEvent(input: RecordEventInput): string {
    try {
      const ctx = getAuditContext();
      const now = Date.now();

      if (input.dedupeKey) {
        const seen = this.dedupe.get(input.dedupeKey);
        if (seen && now - seen.at < DEDUPE_WINDOW_MS) {
          seen.count += 1;
          return seen.reference;
        }
      }
      if (this.dedupe.size > 500) this.pruneDedupe(now);

      const reference = input.reference ?? newReference();
      const err = input.error instanceof Error ? input.error : null;
      const req = input.request ?? {};
      const row: Partial<SystemEvent> = {
        reference,
        level: input.level ?? 'error',
        kind: input.kind,
        message: maskPii(input.message).slice(0, 2000),
        error_name: err?.name?.slice(0, 100) ?? null,
        stack: err?.stack?.slice(0, 8000) ?? null,
        status_code: input.statusCode ?? null,
        request_id: req.requestId ?? ctx.requestId,
        user_id: req.userId ?? ctx.userId,
        user_roles: req.userRoles ?? (ctx.userRoles.length ? ctx.userRoles : null),
        method: (req.method ?? ctx.method)?.slice(0, 8) ?? null,
        path: (req.path ?? ctx.path)?.slice(0, 500) ?? null,
        params: req.params === undefined ? null : (sanitize(req.params, RESPONSE_LIMITS) as Record<string, unknown>),
        query: req.query === undefined ? null : (sanitize(req.query, RESPONSE_LIMITS) as Record<string, unknown>),
        body: req.body === undefined ? null : sanitize(req.body, BODY_LIMITS),
        entity: input.entity?.slice(0, 100) ?? null,
        entity_id: input.entityId?.slice(0, 64) ?? null,
        details: input.details ? (sanitize(input.details, BODY_LIMITS) as Record<string, unknown>) : null,
        app_commit: getBuildInfo().commit?.slice(0, 40) ?? null,
        source: input.source ?? (ctx.jobRunId ? 'job' : ctx.requestId ? 'http' : 'process'),
        job_run_id: ctx.jobRunId,
      };

      if (input.dedupeKey) {
        this.dedupe.set(input.dedupeKey, { at: now, reference, count: 1 });
      }
      this.enqueue({ table: 'system_events', row });
      this.watchBurst(row, now);
      this.watchUser(row, now);
      return reference;
    } catch (e) {
      fallbackLine('recordEvent failed', { error: String(e), message: input.message });
      return 'ERR-UNSAVED';
    }
  }

  setAlertSink(sink: AlertSink): void {
    this.alerts = sink;
  }

  /** Ten server errors in five minutes is a burst; one alert per hour. */
  private watchBurst(row: Partial<SystemEvent>, now: number): void {
    if (row.kind !== 'http_5xx' && row.kind !== 'unhandled_rejection' && row.kind !== 'uncaught_exception') return;
    this.burst.push(now);
    this.burst = this.burst.filter((t) => now - t < BURST_WINDOW_MS);
    if (this.burst.length >= BURST_THRESHOLD && now - this.burstAlertedAt > 60 * 60_000) {
      this.burstAlertedAt = now;
      void this.alerts?.errorBurst(this.burst.length, BURST_WINDOW_MS / 60_000, row.reference ?? null).catch(() => undefined);
    }
  }

  /** One person hitting errors or refusals repeatedly in a day: tell support once. */
  private watchUser(row: Partial<SystemEvent>, now: number): void {
    if (!row.user_id) return;
    const isError = row.kind === 'http_5xx' || row.kind === 'db_constraint';
    const isDenial = row.kind === 'http_403' || row.kind === 'refused';
    if (!isError && !isDenial) return;
    const day = new Date(now).toISOString().slice(0, 10);
    const entry = this.userDay.get(row.user_id);
    const state = entry && entry.day === day ? entry : { day, errors: 0, denials: 0, page: null as string | null, alerted: false };
    if (isError) state.errors += 1;
    if (isDenial) state.denials += 1;
    state.page = row.path ?? state.page;
    this.userDay.set(row.user_id, state);
    if (this.userDay.size > 2000) this.userDay.clear();
    if (!state.alerted && (state.errors >= USER_ERRORS_PER_DAY || state.denials >= USER_DENIALS_PER_DAY)) {
      state.alerted = true;
      const userId = row.user_id;
      void this.users
        .findOne({ where: { id: userId }, select: ['id', 'first_name', 'last_name'] })
        .then((u) =>
          this.alerts?.userStruggling(
            userId,
            u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'A user' : 'A user',
            state.errors,
            state.denials,
            friendlyPage(state.page),
          ),
        )
        .catch(() => undefined);
    }
  }

  /**
   * Called by the request interceptor for every authenticated request;
   * writes users.last_seen_at at most once every five minutes per user so the
   * People view can say "has not opened the CRM since Tuesday".
   */
  touchLastSeen(userId: string): void {
    const now = Date.now();
    const last = this.lastSeen.get(userId) ?? 0;
    if (now - last < LAST_SEEN_EVERY_MS) return;
    this.lastSeen.set(userId, now);
    if (this.lastSeen.size > 5000) this.lastSeen.clear();
    void this.dataSource
      .query('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId])
      .catch((e) => fallbackLine('last_seen update failed', { userId, error: String(e) }));
  }

  /** One provider call, success or failure. */
  recordDelivery(input: RecordDeliveryInput): void {
    try {
      const ctx = getAuditContext();
      this.enqueue({
        table: 'delivery_attempts',
        row: {
          channel: input.channel,
          provider: input.provider?.slice(0, 50) ?? null,
          event_type: input.eventType?.slice(0, 100) ?? null,
          target_masked: maskTarget(input.target),
          entity: input.entity?.slice(0, 100) ?? null,
          entity_id: input.entityId?.slice(0, 64) ?? null,
          request_summary: input.requestSummary
            ? (sanitize(input.requestSummary, RESPONSE_LIMITS) as Record<string, unknown>)
            : null,
          response_status: input.responseStatus ?? null,
          response_body: input.responseBody ? maskPii(input.responseBody).slice(0, 2048) : null,
          success: input.success,
          error: input.error ? maskPii(input.error).slice(0, 2000) : null,
          duration_ms: input.durationMs ?? null,
          request_id: ctx.requestId,
          job_run_id: ctx.jobRunId,
          user_id: ctx.userId,
        },
      });
      // Three failures in a row on one channel is an outage until proven otherwise.
      const streak = this.consecutiveFailures.get(input.channel) ?? { n: 0, lastError: null };
      if (input.success) {
        streak.n = 0;
      } else {
        streak.n += 1;
        streak.lastError = input.error ?? (input.responseBody ? input.responseBody.slice(0, 200) : null);
        if (streak.n === CONSECUTIVE_DELIVERY_FAILURES) {
          void this.alerts?.deliveryFailures(input.channel, streak.n, streak.lastError).catch(() => undefined);
        }
      }
      this.consecutiveFailures.set(input.channel, streak);
    } catch (e) {
      fallbackLine('recordDelivery failed', { error: String(e) });
    }
  }

  /** Browser-side events, already validated by the controller DTO. */
  async recordClientEvents(userId: string | null, inputs: ClientEventInput[]): Promise<number> {
    let n = 0;
    for (const input of inputs.slice(0, 20)) {
      try {
        const occurred = input.occurredAt ? new Date(input.occurredAt) : null;
        this.enqueue({
          table: 'client_events',
          row: {
            user_id: userId,
            kind: input.kind,
            message: maskPii(input.message).slice(0, 2000),
            stack: input.stack ? maskPii(input.stack).slice(0, 4096) : null,
            page_url: input.pageUrl ? maskPii(input.pageUrl).slice(0, 500) : null,
            user_agent: input.userAgent?.slice(0, 300) ?? null,
            app_commit: input.appCommit?.slice(0, 40) ?? null,
            api_reference: input.apiReference?.slice(0, 16) ?? null,
            request_id: input.requestId?.slice(0, 64) ?? null,
            status_code: input.statusCode ?? null,
            details: input.details ? (sanitize(input.details, RESPONSE_LIMITS) as Record<string, unknown>) : null,
            occurred_at: occurred && !Number.isNaN(occurred.getTime()) ? occurred : null,
          },
        });
        n += 1;
      } catch (e) {
        fallbackLine('recordClientEvents failed', { error: String(e) });
      }
    }
    return n;
  }

  /**
   * For work nobody awaits (`void this.something()`): the rejection becomes
   * a row instead of silence. Resolves to `undefined` on failure.
   */
  track<T>(label: string, promise: Promise<T>, extra?: { entity?: string; entityId?: string }): Promise<T | undefined> {
    return promise.catch((error: unknown) => {
      this.recordEvent({
        kind: 'custom',
        level: 'error',
        message: `${label} failed in the background`,
        error,
        entity: extra?.entity ?? null,
        entityId: extra?.entityId ?? null,
        details: { label, cause: error instanceof Error ? error.message : String(error) },
      });
      return undefined;
    });
  }

  /** Process-level handlers in main.ts have no DI; they come through here. */
  static recordProcessError(kind: 'unhandled_rejection' | 'uncaught_exception', reason: unknown): string {
    const message =
      reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'non-error value rejected';
    if (DiagnosticsService.instance) {
      return DiagnosticsService.instance.recordEvent({
        kind,
        level: 'error',
        message: `${kind === 'unhandled_rejection' ? 'Unhandled promise rejection' : 'Uncaught exception'}: ${message}`,
        error: reason,
        source: 'process',
        dedupeKey: `${kind}|${message.slice(0, 200)}`,
      });
    }
    const reference = newReference();
    fallbackLine(kind, { reference, message, stack: reason instanceof Error ? reason.stack : undefined });
    return reference;
  }

  static async flushAll(): Promise<void> {
    await DiagnosticsService.instance?.flush();
  }

  // --------------------------------------------------------------- settings

  /** `app_settings` flag, cached for a minute; the default wins on any failure. */
  async getFlag(key: string, fallback: boolean): Promise<boolean> {
    const v = await this.getSetting(key);
    if (v === null || v === undefined) return fallback;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.toLowerCase() === 'true';
    return fallback;
  }

  async getNumberSetting(key: string, fallback: number): Promise<number> {
    const v = await this.getSetting(key);
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private async getSetting(key: string): Promise<unknown> {
    const cached = this.settings.get(key);
    if (cached && Date.now() - cached.at < SETTINGS_TTL_MS) return cached.value;
    try {
      const rows: Array<{ value: unknown }> = await this.dataSource.query(
        'SELECT value FROM app_settings WHERE key = $1 AND is_active = true LIMIT 1',
        [key],
      );
      const value = rows[0]?.value ?? null;
      this.settings.set(key, { value, at: Date.now() });
      return value;
    } catch {
      this.settings.set(key, { value: cached?.value ?? null, at: Date.now() });
      return cached?.value ?? null;
    }
  }

  // ---------------------------------------------------------------- reads

  findEvents(query: QueryEventsDto): Promise<Pagination<SystemEvent>> {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '50', 10), 200);
    const qb = this.events
      .createQueryBuilder('e')
      .leftJoin('e.user', 'u')
      .addSelect(['u.id', 'u.first_name', 'u.last_name'])
      .orderBy('e.created_at', 'DESC');
    if (query.level) qb.andWhere('e.level = :level', { level: query.level });
    if (query.kind) qb.andWhere('e.kind = :kind', { kind: query.kind });
    if (query.user_id) qb.andWhere('e.user_id = :uid', { uid: query.user_id });
    if (query.request_id) qb.andWhere('e.request_id = :rid', { rid: query.request_id });
    if (query.path) qb.andWhere('e.path ILIKE :path', { path: `%${query.path}%` });
    if (query.q) qb.andWhere('(e.message ILIKE :q OR e.reference ILIKE :q)', { q: `%${query.q}%` });
    if (query.from) qb.andWhere('e.created_at >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('e.created_at <= :to', { to: new Date(query.to) });
    return paginate<SystemEvent>(qb, { page, limit });
  }

  findByReference(reference: string): Promise<SystemEvent | null> {
    return this.events.findOne({ where: { reference }, relations: ['user'] });
  }

  findJobRuns(query: { page?: string; limit?: string; name?: string; status?: string }): Promise<Pagination<JobRun>> {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '50', 10), 200);
    const qb = this.jobRuns.createQueryBuilder('j').orderBy('j.started_at', 'DESC');
    if (query.name) qb.andWhere('j.name = :name', { name: query.name });
    if (query.status) qb.andWhere('j.status = :status', { status: query.status });
    return paginate<JobRun>(qb, { page, limit });
  }

  /** Latest run per registered job, with a plain sentence and an overdue flag. */
  async jobSummary() {
    const latest: JobRun[] = await this.dataSource.query(
      `SELECT DISTINCT ON (name) * FROM job_runs ORDER BY name, started_at DESC`,
    );
    const lastOk: Array<{ name: string; started_at: Date }> = await this.dataSource.query(
      `SELECT DISTINCT ON (name) name, started_at FROM job_runs WHERE status = 'ok' ORDER BY name, started_at DESC`,
    );
    const failures24h: Array<{ name: string; n: number }> = await this.dataSource.query(
      `SELECT name, count(*)::int AS n FROM job_runs WHERE status = 'failed' AND started_at > now() - interval '24 hours' GROUP BY name`,
    );
    const [{ since }] = (await this.dataSource.query(`SELECT min(started_at) AS since FROM job_runs`)) as Array<{ since: Date | null }>;
    const trackingSince = since ? new Date(since) : null;
    const byName = new Map(latest.map((r) => [r.name, r]));
    const okByName = new Map(lastOk.map((r) => [r.name, new Date(r.started_at)]));
    const failByName = new Map(failures24h.map((r) => [r.name, r.n]));
    const now = new Date();
    return JOB_NAMES.map((name) => {
      const def = JOBS[name];
      const run = byName.get(name) ?? null;
      const overdue = isOverdue(name, run ? new Date(run.started_at) : null, now, trackingSince);
      return {
        name,
        title: def.title,
        purpose: def.purpose,
        cron: def.cron,
        everyMs: def.everyMs,
        lastRun: run
          ? {
              id: run.id,
              status: run.status,
              startedAt: run.started_at,
              finishedAt: run.finished_at,
              durationMs: run.duration_ms,
              counts: run.counts ?? {},
              skipReason: run.skip_reason,
              errorReference: run.error_reference,
              trigger: run.trigger,
            }
          : null,
        lastOkAt: okByName.get(name) ?? null,
        failuresLast24h: failByName.get(name) ?? 0,
        overdue,
        sentence: describeRun(def.title, run, overdue, def.describe),
      };
    });
  }

  findDeliveries(query: { page?: string; limit?: string; channel?: string; success?: string; entity_id?: string }): Promise<Pagination<DeliveryAttempt>> {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '50', 10), 200);
    const qb = this.deliveries.createQueryBuilder('d').orderBy('d.created_at', 'DESC');
    if (query.channel) qb.andWhere('d.channel = :channel', { channel: query.channel });
    if (query.success === 'true' || query.success === 'false') qb.andWhere('d.success = :s', { s: query.success === 'true' });
    if (query.entity_id) qb.andWhere('d.entity_id = :eid', { eid: query.entity_id });
    return paginate<DeliveryAttempt>(qb, { page, limit });
  }

  findClientEvents(query: { page?: string; limit?: string; user_id?: string; kind?: string }): Promise<Pagination<ClientEvent>> {
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '50', 10), 200);
    const qb = this.clientEvents.createQueryBuilder('c').orderBy('c.created_at', 'DESC');
    if (query.user_id) qb.andWhere('c.user_id = :uid', { uid: query.user_id });
    if (query.kind) qb.andWhere('c.kind = :kind', { kind: query.kind });
    return paginate<ClientEvent>(qb, { page, limit });
  }

  /**
   * The People view: for every active user, what the last `days` days looked
   * like from the system's side, so support can reach out before anyone
   * complains. Sentences, not just numbers.
   */
  async people(days = 7) {
    const users: Array<{ id: string; first_name: string | null; last_name: string | null; roles: string[]; last_seen_at: Date | null }> =
      await this.dataSource.query(
        `SELECT u.id, u.first_name, u.last_name, u.last_seen_at,
                COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         WHERE u.is_active = true
         GROUP BY u.id ORDER BY u.first_name, u.last_name`,
      );
    const serverSide: Array<{ user_id: string; errors: number; denials: number; last_reference: string | null; last_at: Date; top_path: string | null }> =
      await this.dataSource.query(
        `WITH e AS (
           SELECT user_id, kind, path, reference, created_at FROM system_events
           WHERE user_id IS NOT NULL AND created_at > now() - make_interval(days => $1)
             AND kind IN ('http_5xx','db_constraint','http_403','refused','validation')
         ),
         top AS (
           SELECT DISTINCT ON (user_id) user_id, path FROM (
             SELECT user_id, path, count(*) AS n FROM e GROUP BY user_id, path
           ) t ORDER BY user_id, n DESC
         )
         SELECT e.user_id,
                count(*) FILTER (WHERE e.kind IN ('http_5xx','db_constraint'))::int AS errors,
                count(*) FILTER (WHERE e.kind IN ('http_403','refused'))::int AS denials,
                (array_agg(e.reference ORDER BY e.created_at DESC))[1] AS last_reference,
                max(e.created_at) AS last_at,
                (SELECT path FROM top WHERE top.user_id = e.user_id) AS top_path
         FROM e GROUP BY e.user_id`,
        [days],
      );
    const browserSide: Array<{ user_id: string; n: number; failed_requests: number; last_at: Date; top_page: string | null }> =
      await this.dataSource.query(
        `WITH c AS (
           SELECT user_id, kind, page_url, created_at FROM client_events
           WHERE user_id IS NOT NULL AND created_at > now() - make_interval(days => $1)
         ),
         top AS (
           SELECT DISTINCT ON (user_id) user_id, page_url FROM (
             SELECT user_id, page_url, count(*) AS n FROM c GROUP BY user_id, page_url
           ) t ORDER BY user_id, n DESC
         )
         SELECT c.user_id, count(*)::int AS n,
                count(*) FILTER (WHERE c.kind = 'failed_request')::int AS failed_requests,
                max(c.created_at) AS last_at,
                (SELECT page_url FROM top WHERE top.user_id = c.user_id) AS top_page
         FROM c GROUP BY c.user_id`,
        [days],
      );
    const lastWrite: Array<{ actioned_by: string; last_at: Date }> = await this.dataSource.query(
      `SELECT actioned_by, max(created_at) AS last_at FROM activity_logs WHERE actioned_by IS NOT NULL GROUP BY actioned_by`,
    );
    const s = new Map(serverSide.map((r) => [r.user_id, r]));
    const b = new Map(browserSide.map((r) => [r.user_id, r]));
    const w = new Map(lastWrite.map((r) => [r.actioned_by, new Date(r.last_at)]));
    const now = Date.now();
    return users.map((u) => {
      const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unnamed user';
      const sv = s.get(u.id);
      const br = b.get(u.id);
      const lastSeen = u.last_seen_at ? new Date(u.last_seen_at) : (w.get(u.id) ?? null);
      const errors = (sv?.errors ?? 0) + (br?.n ?? 0);
      const denials = sv?.denials ?? 0;
      const page = friendlyPage(sv?.top_path ?? br?.top_page ?? null);
      const sentences: string[] = [];
      if (!lastSeen) sentences.push(`${name} has no recorded activity.`);
      else if (now - lastSeen.getTime() > 3 * 86_400_000) sentences.push(`${name} has not used the CRM since ${lastSeen.toISOString().slice(0, 10)}.`);
      else sentences.push(`${name} was last active ${ago(lastSeen, now)}.`);
      if (errors || denials) {
        const parts: string[] = [];
        if (errors) parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
        if (denials) parts.push(`${denials} refused action${denials === 1 ? '' : 's'}`);
        sentences.push(`${parts.join(' and ')} in the last ${days} days${page ? `, mostly on ${page}` : ''}${sv?.last_reference ? ` (latest ${sv.last_reference})` : ''}.`);
      } else {
        sentences.push(`No errors in the last ${days} days.`);
      }
      return {
        id: u.id,
        name,
        roles: u.roles,
        lastSeenAt: lastSeen,
        errors,
        denials,
        browserEvents: br?.n ?? 0,
        failedRequests: br?.failed_requests ?? 0,
        lastReference: sv?.last_reference ?? null,
        lastProblemAt: sv?.last_at ?? br?.last_at ?? null,
        topPage: page,
        attention: errors >= USER_ERRORS_PER_DAY || denials >= USER_DENIALS_PER_DAY || (!!lastSeen && now - lastSeen.getTime() > 3 * 86_400_000),
        summary: sentences.join(' '),
      };
    });
  }

  /**
   * Everything around one reference, in one answer: the event, who it
   * happened to, the records they were touching, the audit rows written in
   * the five minutes around it, the jobs running at the time, provider calls
   * and browser events tied to the same request, and the build that was live.
   */
  async investigate(reference: string, includeRaw: boolean) {
    const event = await this.findByReference(reference);
    if (!event) return null;
    const at = event.created_at.getTime();
    const from = new Date(at - 5 * 60_000);
    const to = new Date(at + 5 * 60_000);
    const ids = collectUuids([event.params, event.query, event.body, event.path, event.entity_id]).slice(0, 25);

    const [sameRequest, activityLogs, jobRuns, deliveries, clientEvents, recentForUser] = await Promise.all([
      event.request_id
        ? this.events.find({
            where: { request_id: event.request_id },
            order: { created_at: 'ASC' },
            take: 20,
          })
        : Promise.resolve([] as SystemEvent[]),
      event.user_id || ids.length
        ? this.activityLogs
            .createQueryBuilder('log')
            .leftJoin('log.user', 'actor')
            .addSelect(['actor.id', 'actor.first_name', 'actor.last_name'])
            .where('log.created_at BETWEEN :from AND :to', { from, to })
            .andWhere(
              new Brackets((qb) => {
                if (event.user_id) qb.where('log.actioned_by = :uid', { uid: event.user_id });
                if (ids.length) {
                  if (event.user_id) qb.orWhere('log.entity_id IN (:...ids)', { ids });
                  else qb.where('log.entity_id IN (:...ids)', { ids });
                }
              }),
            )
            .orderBy('log.created_at', 'ASC')
            .take(50)
            .getMany()
        : Promise.resolve([] as ActivityLog[]),
      this.jobRuns
        .createQueryBuilder('j')
        .where('j.started_at <= :to', { to })
        .andWhere('(j.finished_at IS NULL OR j.finished_at >= :from)', { from })
        .orderBy('j.started_at', 'DESC')
        .take(20)
        .getMany(),
      event.request_id || event.job_run_id
        ? this.deliveries
            .createQueryBuilder('d')
            .where(
              new Brackets((qb) => {
                if (event.request_id) qb.where('d.request_id = :rid', { rid: event.request_id });
                if (event.job_run_id) {
                  if (event.request_id) qb.orWhere('d.job_run_id = :jid', { jid: event.job_run_id });
                  else qb.where('d.job_run_id = :jid', { jid: event.job_run_id });
                }
              }),
            )
            .orderBy('d.created_at', 'ASC')
            .take(20)
            .getMany()
        : Promise.resolve([] as DeliveryAttempt[]),
      this.clientEvents.find({
        where: [{ api_reference: reference }, ...(event.request_id ? [{ request_id: event.request_id }] : [])],
        order: { created_at: 'ASC' },
        take: 20,
      }),
      event.user_id
        ? this.events.count({ where: { user_id: event.user_id, created_at: MoreThan(new Date(at - 7 * 86_400_000)) } })
        : Promise.resolve(0),
    ]);

    const user = event.user
      ? {
          id: event.user.id,
          name: `${event.user.first_name ?? ''} ${event.user.last_name ?? ''}`.trim(),
          roles: event.user_roles ?? [],
        }
      : null;

    return {
      reference,
      summary: plainSummary(event, user?.name ?? null),
      event: this.redact(event, includeRaw),
      user: user ? { ...user, eventsLast7Days: recentForUser } : null,
      sameRequest: sameRequest.filter((e) => e.id !== event.id).map((e) => this.redact(e, includeRaw)),
      activityLogs: activityLogs.map((l) => ({
        id: l.id,
        at: l.created_at,
        entity: l.entity,
        entity_id: l.entity_id,
        action: l.action,
        summary: l.summary,
        actor: l.user ? `${l.user.first_name ?? ''} ${l.user.last_name ?? ''}`.trim() : null,
        source: l.source,
        from: (l.metadata as Record<string, unknown> | null)?.client ?? null,
        ...(includeRaw ? { old_values: l.old_values, new_values: l.new_values, metadata: l.metadata } : {}),
      })),
      jobRuns,
      deliveries: deliveries.map((d) => (includeRaw ? d : { ...d, response_body: d.response_body ? '[hidden]' : null })),
      clientEvents: clientEvents.map((c) => (includeRaw ? c : { ...c, stack: c.stack ? '[hidden]' : null })),
      deployed: getBuildInfo(),
      window: { from, to },
    };
  }

  /** Stack, body and raw details are for admin_support only. */
  redact(event: SystemEvent, includeRaw: boolean) {
    const base = {
      id: event.id,
      reference: event.reference,
      level: event.level,
      kind: event.kind,
      message: event.message,
      error_name: event.error_name,
      status_code: event.status_code,
      request_id: event.request_id,
      user_id: event.user_id,
      user: event.user
        ? { id: event.user.id, name: `${event.user.first_name ?? ''} ${event.user.last_name ?? ''}`.trim() }
        : null,
      user_roles: event.user_roles,
      method: event.method,
      path: event.path,
      entity: event.entity,
      entity_id: event.entity_id,
      app_commit: event.app_commit,
      source: event.source,
      job_run_id: event.job_run_id,
      created_at: event.created_at,
    };
    return includeRaw
      ? { ...base, stack: event.stack, params: event.params, query: event.query, body: event.body, details: event.details }
      : base;
  }

  async health() {
    const started = Date.now();
    let db: 'ok' | 'down' = 'ok';
    let dbError: string | null = null;
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout after 3000 ms')), 3000)),
      ]);
    } catch (e) {
      db = 'down';
      dbError = e instanceof Error ? e.message : String(e);
    }
    const dbLatencyMs = Date.now() - started;

    let counts: Array<{ kind: string; level: string; n: number }> = [];
    let latestRuns: JobRun[] = [];
    if (db === 'ok') {
      try {
        counts = await this.dataSource.query(
          `SELECT kind, level, count(*)::int AS n FROM system_events
           WHERE created_at > now() - interval '24 hours' GROUP BY kind, level ORDER BY n DESC`,
        );
        latestRuns = await this.dataSource.query(
          `SELECT DISTINCT ON (name) name, status, started_at, finished_at, duration_ms, counts, skip_reason, error_reference
           FROM job_runs ORDER BY name, started_at DESC`,
        );
      } catch {
        // health must never fail because its own extras did
      }
    }

    const pool = (this.dataSource.driver as unknown as { master?: { totalCount?: number; idleCount?: number; waitingCount?: number } }).master;
    const mem = process.memoryUsage();
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      dbError,
      dbLatencyMs,
      pool: pool ? { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } : null,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(mem.rss / 1048576),
      host: this.host,
      diagnosticsEnabled: this.enabled,
      queued: this.queue.length,
      build: getBuildInfo(),
      eventsLast24h: counts,
      latestJobRuns: latestRuns,
      now: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------- plumbing

  private enqueue(item: QueuedRow): void {
    if (!this.enabled) {
      fallbackLine(`disabled:${item.table}`, item.row as Record<string, unknown>);
      return;
    }
    if (this.queue.length >= QUEUE_MAX) {
      const dropped = this.queue.shift();
      if (dropped) fallbackLine(`queue full, dropped ${dropped.table}`, dropped.row as Record<string, unknown>);
    }
    this.queue.push(item);
    if (this.queue.length >= FLUSH_AT) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue;
    this.queue = [];
    try {
      const byTable = {
        system_events: batch.filter((b) => b.table === 'system_events').map((b) => b.row as Partial<SystemEvent>),
        delivery_attempts: batch.filter((b) => b.table === 'delivery_attempts').map((b) => b.row as Partial<DeliveryAttempt>),
        client_events: batch.filter((b) => b.table === 'client_events').map((b) => b.row as Partial<ClientEvent>),
      };
      if (byTable.system_events.length) await this.insertEvents(byTable.system_events);
      if (byTable.delivery_attempts.length) {
        await this.deliveries.insert(byTable.delivery_attempts as unknown as InsertRows<DeliveryAttempt>);
      }
      if (byTable.client_events.length) {
        await this.clientEvents.insert(byTable.client_events as unknown as InsertRows<ClientEvent>);
      }
    } catch (e) {
      // Postgres is probably the thing that failed. The rows still exist, on
      // stdout, keyed by the references the users were told.
      for (const item of batch) fallbackLine(`db write failed: ${String(e)}`, item.row as Record<string, unknown>);
    } finally {
      this.flushing = false;
    }
  }

  private async insertEvents(rows: Partial<SystemEvent>[]): Promise<void> {
    try {
      await this.events.insert(rows as unknown as InsertRows<SystemEvent>);
    } catch (e) {
      const code = (e as { driverError?: { code?: string } })?.driverError?.code;
      if (code !== '23505') throw e;
      // A reference collided (one in a billion). Save the rest one by one and
      // keep the colliding row under a fresh code, noting the one it was issued as.
      for (const row of rows) {
        try {
          await this.events.insert(row as unknown as InsertRows<SystemEvent>);
        } catch (inner) {
          const innerCode = (inner as { driverError?: { code?: string } })?.driverError?.code;
          if (innerCode !== '23505') throw inner;
          const issued = row.reference;
          await this.events.insert({
            ...row,
            reference: newReference(),
            details: { ...(row.details ?? {}), issued_reference: issued, note: 'reference collided on insert' },
          } as unknown as InsertRows<SystemEvent>);
        }
      }
    }
  }

  private pruneDedupe(now: number): void {
    for (const [key, v] of this.dedupe) {
      if (now - v.at > DEDUPE_WINDOW_MS) this.dedupe.delete(key);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }
}

// ------------------------------------------------------------------ helpers

function safeHostname(): string {
  try {
    return hostname().slice(0, 100);
  } catch {
    return 'unknown';
  }
}

/** Last resort: one JSON line on stderr, never a throw. */
export function fallbackLine(reason: string, row: Record<string, unknown>): void {
  try {
    process.stderr.write(
      JSON.stringify({ t: new Date().toISOString(), level: 'error', ctx: 'Diagnostics', msg: reason, row }) + '\n',
    );
  } catch {
    // nothing left to do
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

function collectUuids(values: unknown[]): string[] {
  const found = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    const text = typeof v === 'string' ? v : safeStringify(v);
    for (const m of text.match(UUID) ?? []) found.add(m.toLowerCase());
  }
  return [...found];
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? '';
  } catch {
    return '';
  }
}

/** "/api/v2/leads/3f2a…" → "Leads"; good enough for a sentence. */
export function friendlyPage(path: string | null): string | null {
  if (!path) return null;
  const seg = path.replace(/^\/api\/v2\//, '').replace(/^\//, '').split(/[/?]/)[0];
  if (!seg) return null;
  const words = seg.replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function ago(d: Date, now: number): string {
  const min = Math.round((now - d.getTime()) / 60_000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} minutes ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const days = Math.round(h / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function describeRun(
  title: string,
  run: JobRun | null,
  overdue: boolean,
  describe: (counts: Record<string, number>) => string,
): string {
  if (!run) return overdue ? `${title} has never run, and should have by now.` : `${title} has not reached its first scheduled time yet.`;
  const when = ago(new Date(run.started_at), Date.now());
  const late = overdue ? ' It is overdue.' : '';
  switch (run.status) {
    case 'ok':
      return `${title} ran ${when}: ${describe(run.counts ?? {})}.${late}`;
    case 'failed':
      return `${title} failed ${when}${run.error_reference ? ` (reference ${run.error_reference})` : ''}.${late}`;
    case 'skipped':
      return `${title} did not run ${when}: ${run.skip_reason ?? 'skipped'}.${late}`;
    case 'running':
      return `${title} started ${when} and is still running.`;
    case 'lost':
      return `${title} started ${when} and never finished; the process probably restarted.${late}`;
    default:
      return `${title}: ${run.status}.`;
  }
}

function plainSummary(event: SystemEvent, userName: string | null): string {
  const who = userName ?? (event.user_id ? 'A signed-in user' : event.source === 'job' ? 'A scheduled job' : 'Someone not signed in');
  const where = event.method && event.path ? ` while calling ${event.method} ${event.path}` : '';
  const when = event.created_at.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const what =
    event.kind === 'http_403'
      ? 'was refused permission'
      : event.kind === 'refused'
        ? 'was told no by a business rule'
      : event.kind === 'validation'
        ? 'sent something the form rejected'
        : event.kind === 'db_constraint'
          ? 'hit a database rule'
          : 'hit an error';
  return `${who} ${what}${where} at ${when}: ${event.message}`;
}
