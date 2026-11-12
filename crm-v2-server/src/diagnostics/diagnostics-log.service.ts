import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { jobDefinition } from './job-registry';

/**
 * The day log: everything people and the system did on one day, read back as
 * sentences in time order. A reader over six tables that already exist
 * (activity_logs, auth_sessions, job_runs, system_events, delivery_attempts,
 * client_events); nothing is written.
 *
 * Days are Africa/Harare days (UTC+2, no daylight saving): the owner reads
 * "08:17" as the clock on his wall. Repetitive rows are folded so a day reads
 * like a logbook, not a firehose: a job that ran 288 times and found nothing
 * is one line; 120 failed e-mails in one minute are one line; the same person
 * refused on the same page in the same hour is one line with a count. The
 * folding of the three high-volume sources (problems, messages, browser
 * errors) happens in SQL, grouped by hour, so a busy day costs a few hundred
 * rows over the wire, not thousands.
 */

export type LogKind = 'action' | 'session' | 'automation' | 'problem' | 'message' | 'browser';

export interface LogEntry {
  at: string; // ISO, UTC
  time: string; // HH:mm Harare, or a range
  kind: LogKind;
  actor: string | null;
  actorId: string | null;
  sentence: string;
  count?: number;
  reference?: string | null;
  entity?: string | null;
  entityId?: string | null;
}

export interface DaySummary {
  day: string;
  timezone: 'Africa/Harare';
  headline: string;
  peopleActive: number;
  actions: number;
  signIns: number;
  jobsRan: number;
  jobsFailed: number;
  problems: number;
  messagesSent: number;
  messagesFailed: number;
  browserErrors: number;
  topActions: Array<{ label: string; n: number }>;
}

const HARARE_OFFSET_MIN = 120;
/** Postgres: the Harare hour a UTC timestamp falls in. */
const HOUR_SQL = (col: string) => `date_trunc('hour', ${col} + interval '2 hours')`;
/**
 * Postgres: a message with record ids and numbers removed, so repeats group.
 * Any run of six or more hex digits, hyphens or mask stars counts as an id
 * (uuids, and uuids the PII masker has already partly starred out); the
 * result is a grouping key only, never shown.
 */
const SHAPE_SQL = (col: string) =>
  `regexp_replace(regexp_replace(left(coalesce(${col}, ''), 200), '[0-9a-f*][0-9a-f*-]{5,}', '<id>', 'gi'), '[0-9]+', '#', 'g')`;

function dayBounds(day: string): { from: Date; to: Date } {
  const [y, m, d] = day.split('-').map(Number);
  const fromUtc = Date.UTC(y, m - 1, d, 0, 0, 0) - HARARE_OFFSET_MIN * 60_000;
  return { from: new Date(fromUtc), to: new Date(fromUtc + 24 * 3600_000) };
}

export function todayHarare(now = new Date()): string {
  return new Date(now.getTime() + HARARE_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

function hhmm(d: Date | string): string {
  const t = new Date(d).getTime() + HARARE_OFFSET_MIN * 60_000;
  return new Date(t).toISOString().slice(11, 16);
}

function span(first: Date | string, last: Date | string): string {
  const a = hhmm(first);
  const b = hhmm(last);
  return a === b ? a : `${a}–${b}`;
}

function oneLine(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function lower(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function friendlyPath(path: string | null): string {
  if (!path) return 'the system';
  const seg = path.replace(/^\/api\/v2\//, '').split(/[/?]/)[0];
  return seg ? seg.replace(/[-_]/g, ' ') : path;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "create", "change", "delete" from the HTTP method, for a refused write. */
function writeVerb(method: string | null | undefined): string {
  switch (String(method ?? '').toUpperCase()) {
    case 'POST':
      return 'create';
    case 'DELETE':
      return 'delete';
    case 'PUT':
    case 'PATCH':
      return 'change';
    default:
      return 'use';
  }
}

/**
 * " — from the Activities page, New Task form, after 'Save'" when the browser
 * said where the request came from (metadata.client, since 16 Oct 2026);
 * nothing for older rows, scripts and jobs.
 */
function fromWhere(client: unknown): string {
  if (!client || typeof client !== 'object') return '';
  const c = client as { screen?: string | null; form?: string | null; action?: string | null };
  const parts: string[] = [];
  if (c.screen) parts.push(`the ${oneLine(c.screen)} page`);
  if (c.form) parts.push(oneLine(c.form).replace(/\s+(form|dialog)$/i, '') + ' form');
  if (c.action) parts.push(`after '${oneLine(c.action)}'`);
  return parts.length ? ` — from ${parts.join(', ')}` : '';
}

type Row = Record<string, any>;

@Injectable()
export class DiagnosticsLogService {
  constructor(private readonly dataSource: DataSource) {}

  async day(day: string, opts: { kinds?: LogKind[]; person?: string | null; q?: string | null } = {}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('day must be YYYY-MM-DD');
    const { from, to } = dayBounds(day);
    const q = (sql: string, params: unknown[]) => this.dataSource.query(sql, params) as Promise<Row[]>;

    const [actions, sessions, runs, problems, deliveries, browser] = await Promise.all([
      q(
        `SELECT l.created_at, l.entity, l.entity_id, l.action, l.summary, l.source, l.actioned_by, l.metadata->'client' AS client,
                u.first_name, u.last_name
         FROM activity_logs l LEFT JOIN users u ON u.id = l.actioned_by
         WHERE l.created_at >= $1 AND l.created_at < $2
         ORDER BY l.created_at ASC LIMIT 3000`,
        [from, to],
      ),
      q(
        `SELECT s.created_at, s.revoked_at, s.revoke_reason, s.browser, s.device_type, s.user_id, u.first_name, u.last_name
         FROM auth_sessions s LEFT JOIN users u ON u.id = s.user_id
         WHERE (s.created_at >= $1 AND s.created_at < $2) OR (s.revoked_at >= $1 AND s.revoked_at < $2)
         ORDER BY s.created_at ASC LIMIT 1000`,
        [from, to],
      ),
      q(
        `SELECT name, status, started_at, duration_ms, counts, skip_reason, error_reference, trigger
         FROM job_runs WHERE started_at >= $1 AND started_at < $2 ORDER BY started_at ASC LIMIT 3000`,
        [from, to],
      ),
      // Problems folded by hour, person, kind, route and message shape.
      q(
        `SELECT ${HOUR_SQL('e.created_at')} AS h, e.user_id, e.kind, e.level, e.method, e.path, ${SHAPE_SQL('e.message')} AS shape,
                (e.job_run_id IS NOT NULL) AS from_job,
                count(*)::int AS n, min(e.created_at) AS first, max(e.created_at) AS last,
                (array_agg(e.reference ORDER BY e.created_at))[1] AS reference,
                (array_agg(e.message ORDER BY e.created_at))[1] AS message,
                max(u.first_name) AS first_name, max(u.last_name) AS last_name
         FROM system_events e LEFT JOIN users u ON u.id = e.user_id
         WHERE e.created_at >= $1 AND e.created_at < $2
         GROUP BY h, e.user_id, e.kind, e.level, e.method, e.path, shape, from_job
         ORDER BY first ASC LIMIT 1000`,
        [from, to],
      ),
      // Messages folded by hour, channel, outcome and error text.
      q(
        `SELECT ${HOUR_SQL('created_at')} AS h, channel, success, left(coalesce(error, ''), 60) AS error,
                count(*)::int AS n, min(created_at) AS first, max(created_at) AS last
         FROM delivery_attempts WHERE created_at >= $1 AND created_at < $2
         GROUP BY h, channel, success, error ORDER BY first ASC LIMIT 500`,
        [from, to],
      ),
      // Browser errors folded by hour, person, kind and page.
      q(
        `SELECT ${HOUR_SQL('c.created_at')} AS h, c.user_id, c.kind, split_part(coalesce(c.page_url, ''), '?', 1) AS page,
                count(*)::int AS n, min(c.created_at) AS first, max(c.created_at) AS last,
                (array_agg(c.message ORDER BY c.created_at))[1] AS message,
                max(u.first_name) AS first_name, max(u.last_name) AS last_name
         FROM client_events c LEFT JOIN users u ON u.id = c.user_id
         WHERE c.created_at >= $1 AND c.created_at < $2
         GROUP BY h, c.user_id, c.kind, page ORDER BY first ASC LIMIT 500`,
        [from, to],
      ),
    ]);

    const name = (r: Row) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || null;
    const entries: LogEntry[] = [];

    // 1. People's actions (and automation that wrote audit rows).
    for (const a of actions) {
      const isScript = a.source === 'script';
      const who = isScript ? 'Automation' : (name(a) ?? 'Someone');
      const summary: string = `${oneLine(a.summary) || `${a.action} ${a.entity}`}${fromWhere(a.client)}`;
      entries.push({
        at: new Date(a.created_at).toISOString(),
        time: hhmm(a.created_at),
        kind: isScript ? 'automation' : 'action',
        actor: isScript ? null : name(a),
        actorId: a.actioned_by ?? null,
        sentence: `${who} ${lower(summary)}`,
        entity: a.entity,
        entityId: a.entity_id,
      });
    }

    // 2. Sign-ins and sign-outs.
    for (const s of sessions) {
      const who = name(s) ?? 'Someone';
      const created = new Date(s.created_at);
      if (created >= from && created < to) {
        const how = [s.browser, s.device_type].filter(Boolean).join(', ');
        entries.push({ at: created.toISOString(), time: hhmm(created), kind: 'session', actor: name(s), actorId: s.user_id, sentence: `${who} signed in${how ? ` (${how})` : ''}` });
      }
      if (s.revoked_at) {
        const revoked = new Date(s.revoked_at);
        if (revoked >= from && revoked < to) {
          const why = s.revoke_reason === 'User logout' ? 'signed out' : `session ended (${s.revoke_reason ?? 'revoked'})`;
          entries.push({ at: revoked.toISOString(), time: hhmm(revoked), kind: 'session', actor: name(s), actorId: s.user_id, sentence: `${who} ${why}` });
        }
      }
    }

    // 3. Scheduled jobs: list anything that did something, failed or was run by hand; fold the quiet repeats.
    // A counter the registry marks as "standing" (a state, e.g. deals still past their limit) does not
    // make a run newsworthy; the folded line states the latest standing number once.
    const quiet = new Map<string, { n: number; first: Date; last: Date; status: string; reason: string | null; lastCounts: Record<string, number> }>();
    let jobsFailed = 0;
    for (const r of runs) {
      const def = jobDefinition(r.name);
      const title = def?.title ?? r.name;
      const counts = (r.counts ?? {}) as Record<string, number>;
      const standing = new Set(def?.standing ?? []);
      const didSomething = Object.entries(counts).some(([k, v]) => !standing.has(k) && Number(v) > 0);
      if (r.status === 'failed' || r.status === 'lost') jobsFailed += 1;
      if (r.status === 'failed' || r.status === 'lost' || r.trigger === 'manual' || didSomething) {
        const what =
          r.status === 'failed'
            ? `failed${r.error_reference ? ` (reference ${r.error_reference})` : ''}`
            : r.status === 'lost'
              ? 'started and never finished'
              : r.status === 'skipped'
                ? `did not run: ${r.skip_reason ?? 'skipped'}`
                : `ran: ${def ? def.describe(counts) : JSON.stringify(counts)}`;
        entries.push({
          at: new Date(r.started_at).toISOString(),
          time: hhmm(r.started_at),
          kind: 'automation',
          actor: null,
          actorId: null,
          sentence: `${title} ${what}${r.trigger === 'manual' ? ' (run by hand)' : ''}`,
          reference: r.error_reference ?? null,
        });
      } else {
        const key = `${r.name}|${r.status}|${r.skip_reason ?? ''}`;
        const cur = quiet.get(key) ?? { n: 0, first: new Date(r.started_at), last: new Date(r.started_at), status: r.status, reason: r.skip_reason ?? null, lastCounts: {} };
        cur.n += 1;
        cur.last = new Date(r.started_at);
        cur.lastCounts = counts;
        quiet.set(key, cur);
      }
    }
    for (const [key, v] of quiet) {
      const jobName = key.split('|')[0];
      const def = jobDefinition(jobName);
      const title = def?.title ?? jobName;
      const standingNow = (def?.standing ?? []).some((k) => Number(v.lastCounts[k] ?? 0) > 0);
      const standingText = standingNow && def?.describeStanding ? `; ${def.describeStanding(v.lastCounts)}` : '';
      const text =
        v.status === 'skipped'
          ? `${title} did not run (${v.reason ?? 'skipped'}), ${plural(v.n, 'time')} today`
          : `${title} ran ${plural(v.n, 'time')} with nothing new to do${standingText}`;
      // Routine lines sit at the time of their last run so they read as the day's footer, not its opening.
      entries.push({ at: v.last.toISOString(), time: span(v.first, v.last), kind: 'automation', actor: null, actorId: null, sentence: text, count: v.n });
    }

    // 4. Problems (folded in SQL).
    let problemCount = 0;
    let denialCount = 0;
    for (const g of problems) {
      const n = Number(g.n);
      if (g.level !== 'info') problemCount += n;
      if (g.kind === 'http_403' || g.kind === 'refused') denialCount += n;
      const fromJob = g.from_job === true || g.kind === 'job_failure';
      const who =
        name(g) ??
        (fromJob ? 'A scheduled job' : g.kind === 'logged_error' ? 'The system' : g.user_id ? 'A signed-in user' : 'Someone not signed in');
      const message = oneLine(g.message).slice(0, 120);
      const what =
        g.kind === 'http_403'
          ? `was refused on ${friendlyPath(g.path)}`
          : g.kind === 'refused'
            ? `tried to ${writeVerb(g.method)} ${friendlyPath(g.path)} and the system said: "${message}"`
          : g.kind === 'validation'
            ? `sent a form the system rejected on ${friendlyPath(g.path)}`
            : g.kind === 'db_constraint'
              ? `hit a database rule on ${friendlyPath(g.path)}`
              : g.kind === 'logged_error'
                ? `logged an error: ${message}`
                : g.kind === 'job_failure'
                  ? `failed: ${message}`
                  : fromJob
                    ? `reported: ${message}`
                    : `hit an error on ${friendlyPath(g.path)}: ${message}`;
      entries.push({
        at: new Date(g.first).toISOString(),
        time: span(g.first, g.last),
        kind: 'problem',
        actor: name(g),
        actorId: g.user_id ?? null,
        sentence: `${who} ${what}${n > 1 ? `, ${plural(n, 'time')}` : ''} (${g.reference})`,
        count: n,
        reference: g.reference,
      });
    }

    // 5. Messages (folded in SQL).
    let messagesSent = 0;
    let messagesFailed = 0;
    for (const g of deliveries) {
      const n = Number(g.n);
      if (g.success) messagesSent += n;
      else messagesFailed += n;
      const channel = g.channel === 'email' ? 'e-mail' : g.channel === 'whatsapp' ? 'WhatsApp' : g.channel;
      entries.push({
        at: new Date(g.first).toISOString(),
        time: span(g.first, g.last),
        kind: 'message',
        actor: null,
        actorId: null,
        sentence: g.success ? `${plural(n, `${channel} message`)} sent` : `${plural(n, `${channel} message`)} failed${g.error ? ` (${g.error})` : ''}`,
        count: n,
      });
    }

    // 6. Browser errors (folded in SQL).
    let browserCount = 0;
    for (const g of browser) {
      const n = Number(g.n);
      browserCount += n;
      const page = String(g.page ?? '').replace(/^https?:\/\/[^/]+/, '') || 'a page';
      entries.push({
        at: new Date(g.first).toISOString(),
        time: span(g.first, g.last),
        kind: 'browser',
        actor: name(g),
        actorId: g.user_id ?? null,
        sentence: `${name(g) ?? 'Someone'}'s browser hit ${n > 1 ? `${n} errors` : 'an error'} on ${page}: ${oneLine(g.message).slice(0, 100)}`,
        count: n,
      });
    }

    entries.sort((a, b) => a.at.localeCompare(b.at));

    // The summary describes the whole day, before filters.
    const people = new Set<string>();
    for (const a of actions) if (a.source !== 'script' && a.actioned_by) people.add(a.actioned_by);
    for (const s of sessions) if (s.user_id) people.add(s.user_id);
    const byEntity = new Map<string, number>();
    for (const a of actions) {
      if (a.source === 'script') continue;
      const label = String(a.entity).toLowerCase();
      byEntity.set(label, (byEntity.get(label) ?? 0) + 1);
    }
    const topActions = [...byEntity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, n]) => ({ label, n }));
    const humanActions = actions.filter((a) => a.source !== 'script').length;
    const signIns = sessions.filter((s) => new Date(s.created_at) >= from && new Date(s.created_at) < to).length;
    const parts = [
      `${plural(people.size, 'person', 'people')} active, ${plural(humanActions, 'action')}${topActions.length ? ` (${topActions.map((t) => `${t.n} ${t.label}`).join(', ')})` : ''}`,
      plural(signIns, 'sign-in'),
      `${plural(runs.length, 'job run')}${jobsFailed ? `, ${jobsFailed} failed` : ', none failed'}`,
      problemCount ? plural(problemCount, 'problem') : 'no errors',
    ];
    if (denialCount) parts.push(plural(denialCount, 'refused action'));
    if (messagesSent + messagesFailed) parts.push(`${plural(messagesSent, 'message')} sent${messagesFailed ? `, ${messagesFailed} failed` : ''}`);
    if (browserCount) parts.push(plural(browserCount, 'browser error'));

    const summary: DaySummary = {
      day,
      timezone: 'Africa/Harare',
      headline: `${dayLabel(day)}: ${parts.join('; ')}.`,
      peopleActive: people.size,
      actions: humanActions,
      signIns,
      jobsRan: runs.length,
      jobsFailed,
      problems: problemCount,
      messagesSent,
      messagesFailed,
      browserErrors: browserCount,
      topActions,
    };

    let filtered = entries;
    if (opts.kinds?.length) filtered = filtered.filter((e) => opts.kinds!.includes(e.kind));
    if (opts.person) filtered = filtered.filter((e) => e.actorId === opts.person);
    if (opts.q) {
      const needle = opts.q.toLowerCase();
      filtered = filtered.filter((e) => e.sentence.toLowerCase().includes(needle) || (e.reference ?? '').toLowerCase().includes(needle));
    }
    return { summary, entries: filtered.slice(0, 2000), truncated: filtered.length > 2000, total: filtered.length };
  }

  /** The same day as plain text, one line per entry, for printing or pasting. */
  async dayAsText(day: string): Promise<string> {
    const { summary, entries } = await this.day(day);
    const lines = [
      `DigiLearn CRM — day log for ${dayLabel(day)} (times are Africa/Harare)`,
      summary.headline,
      '',
      ...entries.map((e) => `${e.time.padEnd(11)} ${label(e.kind).padEnd(10)} ${e.sentence}`),
      '',
      `Generated ${new Date().toISOString()}`,
    ];
    return lines.join('\n');
  }
}

function label(kind: LogKind): string {
  return { action: 'ACTION', session: 'SIGN-IN', automation: 'AUTOMATION', problem: 'PROBLEM', message: 'MESSAGE', browser: 'BROWSER' }[kind];
}

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
