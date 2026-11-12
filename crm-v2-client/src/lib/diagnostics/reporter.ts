import { getAccessToken } from "~/api/axios";
import { onRecentError, type RecentError } from "./recent-errors";
import { currentUiContext, uiTrailSnapshot } from "./ui-trail";

/**
 * Ships browser-side errors to POST /diagnostics/client-events in small
 * batches, so the people who never file a bug report still leave a trace.
 *
 * Rules: at most 20 events per call and one call every ten seconds; the
 * same message is sent once per minute; nothing is sent while offline or
 * before a token exists (events wait in the queue); the queue is flushed
 * with sendBeacon when the tab is closed. Failures of the reporter itself
 * are swallowed: it must never add an error to the page it is reporting on.
 */

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_URL as string | undefined;
const MAX_BATCH = 20;
const FLUSH_EVERY_MS = 10_000;
const DEDUPE_MS = 60_000;
const QUEUE_MAX = 100;

interface Outgoing {
  kind: RecentError["kind"];
  message: string;
  stack?: string;
  pageUrl?: string;
  userAgent?: string;
  appCommit?: string;
  apiReference?: string;
  requestId?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
  occurredAt?: string;
}

const queue: Outgoing[] = [];
const lastSent = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function safeUi(): Record<string, unknown> {
  try {
    return { ui: currentUiContext(), trail: uiTrailSnapshot() };
  } catch {
    return {};
  }
}

function appCommit(): string | undefined {
  try {
    return document.querySelector<HTMLMetaElement>('meta[name="app-commit"]')?.content?.slice(0, 40);
  } catch {
    return undefined;
  }
}

export function enqueueClientEvent(e: RecentError, details?: Record<string, unknown>): void {
  const key = `${e.kind}|${e.message.slice(0, 120)}`;
  const now = Date.now();
  const prev = lastSent.get(key) ?? 0;
  if (now - prev < DEDUPE_MS) return;
  lastSent.set(key, now);
  if (lastSent.size > 500) lastSent.clear();

  queue.push({
    kind: e.kind,
    message: e.message,
    stack: e.stack,
    pageUrl: e.pageUrl,
    userAgent: safeUa(),
    appCommit: appCommit(),
    apiReference: e.reference,
    requestId: e.requestId,
    statusCode: e.status,
    details: {
      ...(details ?? {}),
      ...(e.method ? { method: e.method } : {}),
      ...(e.url ? { url: e.url.slice(0, 300) } : {}),
      // Which screen and form the person was in, and the last few steps
      // before the error, so support can retrace them.
      ...safeUi(),
    },
    occurredAt: e.at,
  });
  if (queue.length > QUEUE_MAX) queue.shift();
  schedule();
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_EVERY_MS);
}

async function flush(useBeacon = false): Promise<void> {
  if (!queue.length || !API_BASE_URL) return;
  const token = getAccessToken();
  if (!token) {
    schedule(); // wait for a login; the events keep
    return;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    schedule();
    return;
  }
  const batch = queue.splice(0, MAX_BATCH);
  const body = JSON.stringify({ events: batch });
  const url = `${API_BASE_URL.replace(/\/+$/, "")}/diagnostics/client-events`;
  try {
    if (useBeacon && typeof navigator.sendBeacon === "function") {
      // sendBeacon cannot set Authorization; the server requires it, so this
      // only works where the refresh cookie alone is accepted. Fall through
      // to fetch with keepalive, which can carry the header.
    }
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body,
      keepalive: useBeacon,
      credentials: "include",
    });
  } catch {
    // dropped on purpose; the reporter never retries into a failing API
  }
  if (queue.length) schedule();
}

/** Subscribe to the buffer and start shipping. Called once from main.tsx. */
export function startClientEventReporter(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  onRecentError((e) => {
    // Console breadcrumbs stay local unless they came with a request failure;
    // 4xx the user caused (validation) are not errors worth a row either.
    if (e.kind === "console_error") return;
    if (e.kind === "failed_request" && e.status !== undefined && e.status < 500 && e.status !== 0) return;
    enqueueClientEvent(e);
  });
  window.addEventListener("pagehide", () => {
    void flush(true);
  });
}

function safeUa(): string | undefined {
  try {
    return navigator.userAgent.slice(0, 300);
  } catch {
    return undefined;
  }
}
