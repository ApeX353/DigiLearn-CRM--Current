import { Injectable, LoggerService, LogLevel, Optional } from '@nestjs/common';
import { getAuditContext } from '../audit/audit-context';
import { DiagnosticsService } from './diagnostics.service';

const LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

/**
 * Contexts whose `error()` calls must not become system_events rows, because
 * they already wrote one (or are the writer).
 */
const NO_MIRROR = new Set(['DiagnosticsExceptionFilter', 'DiagnosticsService', 'Diagnostics', 'JobRunnerService']);

/**
 * The process logger. Installed with `app.useLogger(...)`, so the 42
 * `new Logger(X.name)` instances across the codebase route through it with
 * no call-site change.
 *
 *  - every line carries the request id, the user and the job it belongs to,
 *    read from the per-request context store;
 *  - `LOG_LEVEL` (error|warn|log|debug|verbose, default `log`) decides what
 *    is written; `LOG_FORMAT=json|pretty` decides how (json in production);
 *  - every `error()` is mirrored into `system_events` as `logged_error`, so
 *    the "catch, log and continue" sites that used to vanish into stdout now
 *    leave a row. Repeats of the same message are collapsed per minute.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private enabled: Set<LogLevel>;
  private readonly json: boolean;

  constructor(@Optional() private readonly diagnostics?: DiagnosticsService) {
    const wanted = (process.env.LOG_LEVEL ?? 'log').toLowerCase() as LogLevel;
    const cut = LEVELS.indexOf(wanted) === -1 ? LEVELS.indexOf('log') : LEVELS.indexOf(wanted);
    this.enabled = new Set(LEVELS.slice(0, cut + 1));
    const format = process.env.LOG_FORMAT ?? (process.env.NODE_ENV === 'production' ? 'json' : 'pretty');
    this.json = format === 'json';
  }

  log(message: unknown, ...params: unknown[]): void {
    this.write('log', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    const { context, stack } = this.write('error', message, params);
    if (this.diagnostics && !NO_MIRROR.has(context ?? '')) {
      const text = toText(message);
      // Swagger's "Duplicate DTO detected" is a boot-time schema warning
      // (two classes share the name CreateContactDto), printed once per
      // start. Known and harmless; it would otherwise open every day's log
      // with a "problem" nobody can act on. Stays on stdout.
      if (text.startsWith('Duplicate DTO detected')) return;
      // The dedupe key ignores record ids and numbers, so a loop that logs
      // the same failure for a thousand leads leaves one row per minute
      // (with the first id in the message), not a thousand.
      const shape = text.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '<id>').replace(/\d+/g, '#').slice(0, 200);
      this.diagnostics.recordEvent({
        kind: 'logged_error',
        level: 'error',
        message: context ? `[${context}] ${text}` : text,
        source: 'log',
        details: stack ? { stack: stack.slice(0, 4000), context } : { context },
        dedupeKey: `logged_error|${context ?? ''}|${shape}`,
      });
    }
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('verbose', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  setLogLevels(levels: LogLevel[]): void {
    this.enabled = new Set(levels);
  }

  private write(level: LogLevel, message: unknown, params: unknown[]): { context: string | null; stack: string | null } {
    const { context, stack, rest } = splitParams(params);
    if (!this.enabled.has(level)) return { context, stack };
    try {
      const ctx = getAuditContext();
      const line: Record<string, unknown> = {
        t: new Date().toISOString(),
        level,
        ctx: context,
        msg: toText(message),
      };
      if (rest.length) line.extra = rest.map(toText);
      if (ctx.requestId) line.requestId = ctx.requestId;
      if (ctx.userId) line.userId = ctx.userId;
      if (ctx.jobName) line.job = ctx.jobName;
      if (stack) line.stack = stack;
      const out = this.json ? JSON.stringify(line) : pretty(line);
      (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(out + '\n');
    } catch {
      // a logger must never throw
    }
    return { context, stack };
  }
}

/**
 * Nest calls `log(message, context)` and `error(message, stack, context)`;
 * application code sometimes passes objects. The last string that does not
 * look like a stack trace is the context; a string with "    at " lines is
 * a stack; anything else is extra data.
 */
function splitParams(params: unknown[]): { context: string | null; stack: string | null; rest: unknown[] } {
  let context: string | null = null;
  let stack: string | null = null;
  const rest: unknown[] = [];
  const items = [...params];
  if (items.length && typeof items[items.length - 1] === 'string' && !looksLikeStack(items[items.length - 1] as string)) {
    context = items.pop() as string;
  }
  for (const p of items) {
    if (typeof p === 'string' && looksLikeStack(p) && !stack) stack = p;
    else if (p !== undefined) rest.push(p);
  }
  return { context, stack, rest };
}

function looksLikeStack(s: string): boolean {
  return /\n\s+at\s/.test(s) || /^\w*Error: .*\n/.test(s);
}

function toText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function pretty(line: Record<string, unknown>): string {
  const t = String(line.t).slice(11, 19);
  const lvl = String(line.level).toUpperCase().padEnd(7);
  const ctx = line.ctx ? `[${line.ctx}] ` : '';
  const tail = [
    line.requestId ? `req=${String(line.requestId).slice(0, 8)}` : '',
    line.userId ? `user=${String(line.userId).slice(0, 8)}` : '',
    line.job ? `job=${line.job}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const extra = line.extra ? ` ${(line.extra as string[]).join(' ')}` : '';
  const stack = line.stack ? `\n${line.stack}` : '';
  return `${t} ${lvl} ${ctx}${line.msg}${extra}${tail ? `  (${tail})` : ''}${stack}`;
}
