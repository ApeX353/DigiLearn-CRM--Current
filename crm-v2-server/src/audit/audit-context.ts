import { AsyncLocalStorage } from 'async_hooks';

/**
 * How a request reached us. The audit trail records WHO acted, but a bulk
 * script authenticating as a person is indistinguishable from that person
 * working by hand — and on 27 Jul 2026 one repair run wrote 1,281 activity
 * completions under a real user's name in fourteen minutes. He could
 * reasonably read his own audit trail and conclude he had done that work.
 *
 * `user`   — an interactive request.
 * `script` — automation: an API-key caller, or anything declaring itself
 *            with the `x-automation` header.
 */
export type AuditSource = 'user' | 'script';

/**
 * One store per request (or per scheduled-job run), created by
 * AuditContextMiddleware (HTTP) or JobRunnerService (jobs) and read by the
 * audit trail and the diagnostics layer.
 *
 * The object is shared for the life of the request, so a later stage may
 * fill in what an earlier one could not know: the middleware runs before
 * the guards, so `userId` is set by RequestContextInterceptor once the JWT
 * guard has attached `req.user`. Before that fix every row stamped from this
 * store carried `userId: null`.
 */
export interface AuditContext {
  userId: string | null;
  /** Role names of the acting user, once known. */
  userRoles: string[];
  ipAddress: string | null;
  source: AuditSource;
  /** Free text from `x-automation` saying what the run was for. */
  automationReason: string | null;
  /**
   * Correlation id for this request: accepted from a well-formed inbound
   * `x-request-id`, otherwise generated. Echoed on the response, written
   * on every diagnostics row and audit row, and quoted back to users
   * inside error responses so one id ties a complaint to its trace.
   */
  requestId: string | null;
  userAgent: string | null;
  method: string | null;
  path: string | null;
  startedAt: Date | null;
  /** Set when the work runs inside a tracked scheduled job. */
  jobRunId: string | null;
  jobName: string | null;
  /**
   * Where in the browser the request came from, as the client reports it in
   * the x-client-* headers (since 16 Oct 2026): the route, a readable screen
   * name, the open dialog's title and the last button pressed. Labels only,
   * never field values; recorded on audit rows and error rows so a line can
   * read "from the Activities page, New Task form, after 'Save'".
   */
  client: ClientOrigin | null;
}

export interface ClientOrigin {
  page: string | null;
  screen: string | null;
  form: string | null;
  action: string | null;
}

export const auditStorage = new AsyncLocalStorage<AuditContext>();

/** The default when nothing created a store (boot tasks, untracked timers). */
export function emptyAuditContext(): AuditContext {
  return {
    userId: null,
    userRoles: [],
    ipAddress: null,
    // Work with no request behind it (boot tasks, schedulers) is not a
    // person acting, so it must never be recorded as one.
    source: 'script',
    automationReason: 'no request context',
    requestId: null,
    userAgent: null,
    method: null,
    path: null,
    startedAt: null,
    jobRunId: null,
    jobName: null,
    client: null,
  };
}

export function getAuditContext(): AuditContext {
  return auditStorage.getStore() || emptyAuditContext();
}
