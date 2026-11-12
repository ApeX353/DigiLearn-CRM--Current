export interface SystemEventSummary {
  id: string;
  reference: string;
  level: "error" | "warn" | "info";
  kind: string;
  message: string;
  error_name: string | null;
  status_code: number | null;
  request_id: string | null;
  user_id: string | null;
  user: { id: string; name: string } | null;
  user_roles: string[] | null;
  method: string | null;
  path: string | null;
  entity: string | null;
  entity_id: string | null;
  app_commit: string | null;
  source: string;
  job_run_id: string | null;
  created_at: string;
  /** admin_support only */
  stack?: string | null;
  params?: unknown;
  query?: unknown;
  body?: unknown;
  details?: Record<string, unknown> | null;
}

export interface JobRunSummary {
  name: string;
  title: string;
  purpose: string;
  cron: string;
  everyMs: number;
  lastRun: {
    id: string;
    status: "running" | "ok" | "failed" | "skipped" | "lost";
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    counts: Record<string, number>;
    skipReason: string | null;
    errorReference: string | null;
    trigger: "cron" | "manual";
  } | null;
  lastOkAt: string | null;
  failuresLast24h: number;
  overdue: boolean;
  sentence: string;
}

export interface PersonSummary {
  id: string;
  name: string;
  roles: string[];
  lastSeenAt: string | null;
  errors: number;
  denials: number;
  browserEvents: number;
  failedRequests: number;
  lastReference: string | null;
  lastProblemAt: string | null;
  topPage: string | null;
  attention: boolean;
  summary: string;
}

export interface DiagnosticsHealth {
  status: "ok" | "degraded";
  db: "ok" | "down";
  dbError: string | null;
  dbLatencyMs: number;
  pool: { total?: number; idle?: number; waiting?: number } | null;
  uptimeSeconds: number;
  memoryMb: number;
  host: string;
  diagnosticsEnabled: boolean;
  queued: number;
  build: { commit: string; shortCommit: string; branch: string; builtAt: string };
  eventsLast24h: Array<{ kind: string; level: string; n: number }>;
  latestJobRuns: Array<{ name: string; status: string; started_at: string }>;
  now: string;
}

export interface InvestigateBundle {
  reference: string;
  summary: string;
  event: SystemEventSummary;
  user: { id: string; name: string; roles: string[]; eventsLast7Days: number } | null;
  sameRequest: SystemEventSummary[];
  activityLogs: Array<{
    id: string;
    at: string;
    entity: string;
    entity_id: string;
    action: string;
    summary: string;
    actor: string | null;
    source: string;
    /** Where in the browser the action came from, when the client said (16 Oct 2026 on). */
    from?: { page?: string | null; screen?: string | null; form?: string | null; action?: string | null } | null;
  }>;
  jobRuns: Array<{ id: string; name: string; status: string; started_at: string; finished_at: string | null; counts: Record<string, number> | null; error_reference: string | null }>;
  deliveries: Array<{ id: string; channel: string; provider: string | null; event_type: string | null; target_masked: string | null; success: boolean; error: string | null; created_at: string }>;
  clientEvents: Array<{ id: string; kind: string; message: string; page_url: string | null; created_at: string }>;
  deployed: { commit: string; shortCommit: string; branch: string; builtAt: string };
  window: { from: string; to: string };
}

export type LogKind = "action" | "session" | "automation" | "problem" | "message" | "browser";

export interface LogEntry {
  at: string;
  time: string;
  kind: LogKind;
  actor: string | null;
  actorId: string | null;
  sentence: string;
  count?: number;
  reference?: string | null;
  entity?: string | null;
  entityId?: string | null;
}

export interface DayLog {
  summary: {
    day: string;
    timezone: "Africa/Harare";
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
  };
  entries: LogEntry[];
  truncated: boolean;
  total: number;
}

export interface Paged<T> {
  success: boolean;
  data: T[];
  meta: { totalItems: number; itemCount: number; itemsPerPage: number; totalPages: number; currentPage: number };
}
