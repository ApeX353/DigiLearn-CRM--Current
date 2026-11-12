/**
 * The browser's own account of where the user is and what they just did:
 * the screen (route), the open dialog or sheet (the form), and the last
 * button pressed. Sent as headers on every API call, so an audit row or an
 * error on the server can say "from the Activities page, New Task form,
 * after 'Save'"; kept as a short trail for bug reports and browser-error
 * reports, so a support reader sees the last few screens before a problem.
 *
 * Everything here is best effort and never throws. A page with no dialog
 * open sends no form header; a request with no click in the last fifteen
 * seconds (a background refresh) sends no action header. No field values
 * are ever read — only labels: route, dialog title, button text.
 */

export interface TrailScreen {
  at: string;
  path: string;
  label: string;
}

export interface TrailClick {
  at: string;
  text: string;
  form: string | null;
  path: string;
}

export interface UiContext {
  page: string;
  screen: string;
  form: string | null;
  action: string | null;
}

export interface UiTrail {
  screens: TrailScreen[];
  clicks: TrailClick[];
}

const MAX_SCREENS = 10;
const MAX_CLICKS = 8;
const ACTION_WINDOW_MS = 15_000;
const LABEL_MAX = 80;

const SCREEN_LABELS: Array<[RegExp, string]> = [
  [/^\/$/, "Dashboard"],
  [/^\/dashboard/, "Dashboard"],
  [/^\/leads\/duplicates/, "Duplicate leads"],
  [/^\/leads\/escalations/, "Escalations"],
  [/^\/leads\/new/, "New lead"],
  [/^\/leads\/[^/]+/, "Lead detail"],
  [/^\/leads/, "Leads"],
  [/^\/deals\/[^/]+/, "Deal detail"],
  [/^\/deals/, "Deals"],
  [/^\/pipeline/, "Pipeline"],
  [/^\/schools\/[^/]+/, "School detail"],
  [/^\/schools/, "Schools"],
  [/^\/activities/, "Activities"],
  [/^\/tasks/, "Tasks"],
  [/^\/quotes\/[^/]+/, "Quote detail"],
  [/^\/quotes/, "Quotes"],
  [/^\/invoice\/[^/]+\/schedule/, "Invoice schedule"],
  [/^\/invoices\/[^/]+/, "Invoice detail"],
  [/^\/invoices/, "Invoices"],
  [/^\/payments/, "Payments"],
  [/^\/collections/, "Collections"],
  [/^\/requisitions/, "Cash requisitions"],
  [/^\/campaigns/, "Campaigns"],
  [/^\/reports/, "Reports"],
  [/^\/management/, "Management"],
  [/^\/notifications/, "Notifications"],
  [/^\/profile/, "Profile"],
  [/^\/bug-reports/, "Bug reports"],
  [/^\/scheduling-links/, "Scheduling links"],
  [/^\/whats-new/, "What's New"],
  [/^\/admin\/system-health/, "System Health"],
  [/^\/admin\/audit-log/, "Audit Trail"],
  [/^\/admin\/users/, "Staff"],
  [/^\/admin\/settings/, "Settings"],
  [/^\/admin\/approval-queue/, "Approval queue"],
  [/^\/admin\/roles-permissions/, "Roles and permissions"],
  [/^\/admin\/products/, "Products"],
  [/^\/admin\/finance-plans/, "Finance plans"],
  [/^\/admin\/email-templates/, "E-mail templates"],
  [/^\/admin\/email-sequences/, "E-mail sequences"],
  [/^\/admin\/compliance-report/, "Compliance report"],
  [/^\/login/, "Sign in"],
  [/^\/change-password/, "Change password"],
  [/^\/book\//, "Public booking page"],
];

const screens: TrailScreen[] = [];
const clicks: TrailClick[] = [];
let installed = false;

/** A readable name for a route, e.g. "/leads/3f2…" → "Lead detail". */
export function screenLabel(path: string): string {
  const clean = (path || "/").split("?")[0];
  for (const [re, label] of SCREEN_LABELS) if (re.test(clean)) return label;
  const first = clean.split("/").filter(Boolean)[0];
  return first ? first.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Dashboard";
}

function tidy(text: string | null | undefined, max = LABEL_MAX): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function currentPath(): string {
  return safe(() => window.location.pathname, "/");
}

/**
 * The title of the topmost open dialog, sheet or alert, which is what a
 * person would call "the form I was in". Radix marks open overlays with
 * data-state="open"; the shadcn wrappers tag their titles with data-slot.
 */
export function activeFormLabel(): string | null {
  return safe(() => {
    const open = document.querySelectorAll<HTMLElement>(
      '[data-slot$="-content"][data-state="open"], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    );
    const top = open[open.length - 1];
    if (!top) return null;
    const title = top.querySelector<HTMLElement>('[data-slot$="-title"], h1, h2, h3');
    return tidy(title?.textContent) ?? tidy(top.getAttribute("aria-label")) ?? "a dialog";
  }, null);
}

function recordScreen(path: string): void {
  const last = screens[screens.length - 1];
  if (last && last.path === path) return;
  screens.push({ at: new Date().toISOString(), path: path.slice(0, 200), label: screenLabel(path) });
  if (screens.length > MAX_SCREENS) screens.shift();
}

function recordClick(text: string): void {
  clicks.push({ at: new Date().toISOString(), text, form: activeFormLabel(), path: currentPath() });
  if (clicks.length > MAX_CLICKS) clicks.shift();
}

/** Start following route changes and button presses. Safe to call once per page load. */
export function installUiTrail(): void {
  if (installed) return;
  installed = true;
  safe(() => {
    recordScreen(currentPath());
    const wrap = (name: "pushState" | "replaceState") => {
      const original = history[name];
      history[name] = function (this: History, ...args: Parameters<History["pushState"]>) {
        const result = original.apply(this, args);
        recordScreen(currentPath());
        return result;
      } as History["pushState"];
    };
    wrap("pushState");
    wrap("replaceState");
    window.addEventListener("popstate", () => recordScreen(currentPath()));

    document.addEventListener(
      "click",
      (e) => {
        safe(() => {
          const target = (e.target as Element | null)?.closest?.(
            'button, [role="button"], [role="menuitem"], [role="tab"], a[href], input[type="submit"]',
          );
          if (!target) return;
          const text =
            tidy(target.getAttribute("aria-label"), 60) ??
            tidy((target as HTMLElement).textContent, 60) ??
            tidy(target.getAttribute("title"), 60);
          if (text) recordClick(text);
        }, undefined);
      },
      true,
    );
    document.addEventListener(
      "submit",
      () => safe(() => recordClick(`submitted ${activeFormLabel() ?? "a form"}`), undefined),
      true,
    );
  }, undefined);
}

/** Where the user is right now and what they last did, for the API headers. */
export function currentUiContext(): UiContext {
  const page = currentPath();
  const lastClick = clicks[clicks.length - 1];
  const recent = lastClick && Date.now() - new Date(lastClick.at).getTime() < ACTION_WINDOW_MS ? lastClick.text : null;
  return { page, screen: screenLabel(page), form: activeFormLabel(), action: recent };
}

/**
 * Header values for one API request. Values are URI-encoded because HTTP
 * headers must stay ASCII and dialog titles need not be; the server decodes.
 */
export function uiHeaders(): Record<string, string> {
  return safe(() => {
    const c = currentUiContext();
    const out: Record<string, string> = {
      "x-client-page": encodeURIComponent(c.page.slice(0, 200)),
      "x-client-screen": encodeURIComponent(c.screen),
    };
    if (c.form) out["x-client-form"] = encodeURIComponent(c.form);
    if (c.action) out["x-client-action"] = encodeURIComponent(c.action);
    return out;
  }, {});
}

/** The last few screens and clicks, for bug reports and browser-error reports. */
export function uiTrailSnapshot(): UiTrail {
  return { screens: screens.slice(-6), clicks: clicks.slice(-6) };
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
