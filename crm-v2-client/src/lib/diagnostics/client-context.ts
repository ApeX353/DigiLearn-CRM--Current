import { recentErrors, recentReferences } from "./recent-errors";
import { uiTrailSnapshot, type UiTrail } from "./ui-trail";

export interface ClientContext {
  page_url: string;
  user_agent: string;
  viewport: string;
  language: string;
  online: boolean;
  app_commit: string | null;
  app_built_at: string | null;
  api_commit: string | null;
  recent_references: string[];
  recent_errors: Array<{ at: string; kind: string; message: string; status?: number; url?: string }>;
  /** The last few screens visited and buttons pressed before this was captured. */
  ui_trail: UiTrail;
  captured_at: string;
}

let apiCommit: string | null = null;
let apiCommitFetchedAt = 0;

function meta(name: string): string | null {
  try {
    return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;
  } catch {
    return null;
  }
}

/**
 * The API's own build id, from the public /version route; cached for ten
 * minutes. Fire-and-forget: the first bug report after a page load may not
 * have it yet, the second will.
 */
export function primeApiCommit(apiBaseUrl: string | undefined): void {
  if (!apiBaseUrl || Date.now() - apiCommitFetchedAt < 10 * 60_000) return;
  apiCommitFetchedAt = Date.now();
  fetch(`${apiBaseUrl.replace(/\/+$/, "")}/version`, { credentials: "omit" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { shortCommit?: string } | null) => {
      if (j?.shortCommit) apiCommit = j.shortCommit;
    })
    .catch(() => undefined);
}

/** Everything the browser knows that helps someone else reproduce a problem. */
export function collectClientContext(): ClientContext {
  return {
    page_url: safe(() => window.location.href, "").slice(0, 500),
    user_agent: safe(() => navigator.userAgent, "").slice(0, 300),
    viewport: safe(() => `${window.innerWidth}x${window.innerHeight}`, ""),
    language: safe(() => navigator.language, ""),
    online: safe(() => navigator.onLine, true),
    app_commit: meta("app-commit"),
    app_built_at: meta("app-built-at"),
    api_commit: apiCommit,
    recent_references: recentReferences(5),
    recent_errors: recentErrors(8).map((e) => ({
      at: e.at,
      kind: e.kind,
      message: e.message.slice(0, 300),
      ...(e.status !== undefined ? { status: e.status } : {}),
      ...(e.url ? { url: e.url.slice(0, 200) } : {}),
    })),
    ui_trail: safe(() => uiTrailSnapshot(), { screens: [], clicks: [] }),
    captured_at: new Date().toISOString(),
  };
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
