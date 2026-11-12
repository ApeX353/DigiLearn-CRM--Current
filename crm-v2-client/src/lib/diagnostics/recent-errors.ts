/**
 * What the browser remembers about recent trouble, so a bug report or an
 * error reporter can attach it. No imports on purpose: axios.ts feeds this
 * module and the reporter reads from it, which keeps the module graph acyclic.
 */

export type RecentErrorKind =
  | "js_error"
  | "unhandled_rejection"
  | "render_error"
  | "failed_request"
  | "console_error";

export interface RecentError {
  at: string;
  kind: RecentErrorKind;
  message: string;
  stack?: string;
  /** Request facts when kind === "failed_request". */
  method?: string;
  url?: string;
  status?: number;
  /** The ERR- code the API answered with, when it did. */
  reference?: string;
  requestId?: string;
  pageUrl?: string;
}

const MAX = 50;
const buffer: RecentError[] = [];
const listeners = new Set<(e: RecentError) => void>();
let installed = false;

export function recordRecentError(e: Omit<RecentError, "at" | "pageUrl"> & { at?: string; pageUrl?: string }): RecentError {
  const entry: RecentError = {
    ...e,
    at: e.at ?? new Date().toISOString(),
    pageUrl: e.pageUrl ?? safeHref(),
    message: String(e.message ?? "").slice(0, 2000),
    stack: e.stack ? String(e.stack).slice(0, 4096) : undefined,
  };
  buffer.push(entry);
  if (buffer.length > MAX) buffer.shift();
  for (const l of listeners) {
    try {
      l(entry);
    } catch {
      // a listener must never break the page
    }
  }
  return entry;
}

export function recentErrors(limit = 10): RecentError[] {
  return buffer.slice(-limit);
}

export function recentReferences(limit = 5): string[] {
  const refs: string[] = [];
  for (let i = buffer.length - 1; i >= 0 && refs.length < limit; i--) {
    const r = buffer[i].reference;
    if (r && !refs.includes(r)) refs.push(r);
  }
  return refs;
}

export function onRecentError(listener: (e: RecentError) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A short code shown to the user when the failure never reached the API. */
export function newClientReference(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let out = "WEB-";
  const bytes = new Uint8Array(6);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < 6; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % 32];
  return out;
}

/**
 * Hooks window-level errors and (in production builds) console.error so
 * the last few land in the buffer. Installed once from main.tsx.
 */
export function installRecentErrorCapture(options: { tapConsole: boolean }): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const err = event.error as unknown;
    recordRecentError({
      kind: "js_error",
      message: event.message || (err instanceof Error ? err.message : "Script error"),
      stack: err instanceof Error ? err.stack : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as unknown;
    recordRecentError({
      kind: "unhandled_rejection",
      message: reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Unhandled promise rejection",
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  if (options.tapConsole) {
    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      try {
        const text = args
          .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : safeJson(a)))
          .join(" ")
          .slice(0, 2000);
        // Breadcrumbs from the API layer already went through recordRecentError.
        if (!text.startsWith("[api]")) {
          recordRecentError({ kind: "console_error", message: text });
        }
      } catch {
        // never let the tap break logging
      }
      original(...args);
    };
  }
}

function safeHref(): string | undefined {
  try {
    return window.location.href.slice(0, 500);
  } catch {
    return undefined;
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}
