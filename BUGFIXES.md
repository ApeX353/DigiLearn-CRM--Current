# Bug Fixes Log

Per Mr Dube's directive (2026-07-22): bugs are fixed on discovery and
documented here. Each entry records the symptom, root cause, the fix, and
the data impact. Newest first.

---

## 2026-07-31 — Sales-interrupting bundle (Kim/Tanya sprint, 11 quick wins)

Shipped alongside DEAL-OPEN (Tanya's #1). Each fix below is minimal and
sales-facing; root causes were confirmed in code before changing anything.

### DEALS1 (55c824b0): `/deals` silently hid won/lost deals
**Symptom.** The deals list showed only ongoing deals; ~2/3 of closed
business (won/lost) never appeared, with nothing on screen saying so.
**Root cause.** `getDeals` (`deals.service.ts`) defaulted `close_status` to
`ONGOING` and applied it as an unconditional WHERE, so any caller that
didn't pass a status got ongoing-only.
**Fix.** Only filter by `close_status` when the caller supplies it; order
the now-mixed list by `COALESCE(actual_close_date, created_at) DESC` so it
stays newest-first. The dedicated closed-only view (`/deals/archived`) is
unchanged.
**Data impact.** None (read path). Files: `crm-v2-server/src/deals/deals.service.ts`.

### NEXT3 (81958979): scheduling a call/WhatsApp as the next step filed it as done
**Symptom.** Picking Call or WhatsApp as an upcoming next step created it
already **completed**, so it never showed as the next step and it bumped
`last_contacted_at`.
**Root cause.** `create-activity-modal.tsx` stamped `status: completed` on
every call/WhatsApp/email unconditionally.
**Fix.** Only auto-complete call/WhatsApp when they are **not** dated for
the future; a future due date creates a `scheduled` next step. Email stays
completed (sent on save). Logging a past/now call is unchanged.
**Data impact.** None. Files: `crm-v2-client/src/components/activities/create-activity-modal.tsx`.

### eea1c4ae: a completed task's recorded outcome/notes were invisible
**Symptom.** A rep records an outcome + note when completing a next-up task,
then the task drops into the completed feed and the outcome appears lost.
**Root cause.** The data **is** saved (`completion_outcome` / `completion_note`
on the activity) and is not wiped by later edits — but no read surface
renders it for a task. The feed only derived an outcome from call/meeting
sub-records, and the details sheet had no completion block.
**Fix.** Display-only: the completed-activity feed item now falls back to
the activity-level `completion_outcome`/`completion_note`, and the activity
details sheet shows an "Outcome" section when they're set. No backfill —
the data was intact all along.
**Data impact.** None (rendering only). Files: `crm-v2-client/src/components/activities/{activity-kit.tsx,activity-details-sheet.tsx}`.

### NEXT4 (ae4f56b0): a lead could only show one next step at a time
**Symptom.** Reps need two concurrent next steps on a record, but only one
showed; a second scheduled step vanished into the Activity log.
**Root cause.** No schema limit exists — the engagement workspace just took
`dated[0]` for the single Planned card and folded every other open dated
step into the feed.
**Fix.** Render **all** open dated next steps (soonest first) as Planned
cards, and exclude the whole set (not just the first) from the Activity log.
Client-only; multiple open activities already coexist in the DB.
**Data impact.** None. Files: `crm-v2-client/src/components/activities/engagement-workspace.tsx`.

### PH1 (0ac3f2f7): phone dedup compared raw digits, so formats never matched
**Symptom.** The same number saved as "+263772123456" then "0772123456"
created a second contact — the duplicate check never matched across formats.
**Root cause.** The write path's `normalizePhone` only stripped non-digits,
leaving "263772123456" vs "0772123456" — two different strings for one
number.
**Fix.** New shared `canonPhone` helper reduces a Zimbabwe number to its
national significant digits (drops 263 country code / leading 0, keeps the
trailing 9), used by the contact-matching in `createWithSchoolAndContacts`
so the existing contact is reused. (The `canonName`/`canonCity` helpers in
the same module are staged for the SCH1/SCH2/DUP1 write-path pass.)
**Data impact.** None going forward; historical duplicate contacts remain a
separate cleanup. Files: `crm-v2-server/src/leads/utils/record-normalization.ts`,
`crm-v2-server/src/leads/leads.service.ts`.

### QUOTE1-b (618ec6f2, part b): Convert-to-Invoice threw on an uninvoiced Accepted quote
**Symptom.** Clicking "Convert to Invoice" on a deal errored for a quote
that was Accepted but had no invoice yet.
**Root cause.** `convertFromQuote` rejected ANY quote with status Accepted,
but a quote can reach Accepted without an invoice (manual status change, or
the manual-invoice path). The deal-page button only checks invoice
existence, so it offered a click the server refused.
**Fix.** Block an Accepted quote only when an invoice actually exists for it
(`quote_id` lookup); otherwise allow the conversion. Preserves the
double-conversion guard.
**Data impact.** None. Files: `crm-v2-server/src/invoices/invoices.service.ts`.
(QUOTE1-a "revert-to-draft still Accepted" did not reproduce in current code;
QUOTE1-c "one accepted quote per deal" is deferred — needs a data check.)

### AUD-M01 (473d220c): bulk activity completion diverged from single
**Symptom.** Completing activities in bulk behaved differently from
completing them one at a time.
**Root cause.** `bulkUpdateStatus` saved the status + audit row but — unlike
`updateStatus` — never called `updateLeadContactStatus` or
`deriveDemoEffectsForLead`. So bulk-completing a call/meeting did NOT bump
the lead's `last_contacted_at`/`last_action_at`, did NOT flip New→Contacted,
and a bulk-completed demo did NOT re-derive commercial intent (leaving the
Create-Deal gate wrongly shut).
**Fix.** Route each freshly-completed row in the bulk loop through the same
idempotent, forward-only helpers: lead-contact propagation inside the
transaction, demo/commercial-intent derivation after it.
**Data impact.** None retroactive. Files: `crm-v2-server/src/activities/activities.service.ts`.
(A third divergence — bulk bypasses the `enforce_next_step_on_completion`
gate — is left as a flagged product decision, not silently changed.)

### LNAME2 (95999841): capture & show what the client wants on a lead
**Symptom.** Ms Mpofu wanted a lead field for the client's interest / what
they want, captured and shown.
**Root cause / state.** `Lead.notes` already exists and is persisted +
carried into the deal on conversion, but the create form never collected it
and the lead view never showed it (the "Notes" tab is *activity* notes).
**Fix.** Reuse the existing column (no migration): add `notes` to the client
`leadInfoSchema`, a "What the client wants / Interest" textarea to the
create-lead form, and an "Interest" row on the lead at-a-glance.
**Data impact.** None. Files: `crm-v2-client/src/api/leads/types.ts`,
`crm-v2-client/src/pages/leads/create-new-lead.tsx`,
`crm-v2-client/src/components/leads/lead-at-a-glance.tsx`.

### SCH1 (3e0666cb) + SCH2 (e494fedc): school records split by punctuation / city spelling
**Symptom.** One school forked into several records — a punctuation/spacing
variant of the name ("St. Mary's" vs "St Marys") or a different city
spelling ("Harare" vs "Harare CBD") created a second school, splitting its
leads across records.
**Root cause.** `createWithSchoolAndContacts` matched schools on exact
`LOWER(TRIM(name))` + province (so punctuation/spacing forked — SCH1) and
added `city` as a **hard AND-filter** to the match (so a city spelling
variance excluded the real school → new one created — SCH2).
**Fix.** Match on a **canonical name** (`REGEXP_REPLACE(LOWER(name),
'[^a-z0-9]','','g')`, mirrored by the shared `canonName`) so punctuation/
spacing variants resolve to the same school. Use **city only as a
tie-breaker** among multiple same-name schools (compared via `canonCity`),
never as an exclusion — a single name+province match is reused regardless of
city spelling. The ambiguity guard (>1 genuine same-name school, no
disambiguating city → ask the caller to choose) is preserved.
**Verified locally:** apostrophe variant reused the school; a different city
spelling still reused; the guard fired on a real duplicate (Chidiya Primary
×2); a city singled out the right one. Test leads cleaned up.
**Data impact.** Prevents new forks; existing already-split schools are a
separate merge/cleanup task (owner: Ms Mpofu per the lead-merge rule).
Files: `crm-v2-server/src/leads/leads.service.ts`,
`crm-v2-server/src/leads/utils/record-normalization.ts`.

---

## 2026-07-31 — BUGUI1: bug-tracker detail dialog overflowed the viewport, clipping text

**Symptom.** Clicking a ticket in the Bug Tracker opened a tall, narrow tile
whose text got cut off — long descriptions/resolution notes pushed the
dialog past the screen with no way to scroll to the rest (reported by Mr
Dube).

**Root cause.** Both ticket dialogs (`TriageDialog`, `BugDetailDialog` in
`bug-reports-page.tsx`) used `DialogContent className="sm:max-w-lg"` with no
height cap or scroll. A long `whitespace-pre-wrap` description grew the
dialog taller than the viewport, so the top/bottom (and the action buttons)
were clipped. Long unbroken tokens could also overflow horizontally.

**Fix.** Added `max-h-[85vh] overflow-y-auto` to both `DialogContent`s so
the dialog scrolls instead of clipping, and `break-words` on the titles and
description/resolution boxes so long tokens wrap.

**Data impact.** None — presentation only.

Files: `crm-v2-client/src/pages/bug-reports/bug-reports-page.tsx`.

---

## 2026-07-31 — DEAL-OPEN: reps got "Deal not found" opening their own pipeline deals (Tanya)

**Symptom.** Tanya (a `sales_rep`) reported "Pipeline deals not opening —
the response is saying this lead doesn't exist" for several of her own
deals (Mutendi Primary, Bikita Fashu, Mutsambwa). Reproduced on staging as
Manake (`sales_rep`): `GET /deals/:id` and `GET /deals/:id/rollback-requests`
returned **404 "Deal not found"** for deals assigned to her; admins and
sales managers were unaffected. The client renders any deal-fetch error as
"Deal not found", which Tanya paraphrased as "lead doesn't exist" (the
lead calls actually returned 200).

**Root cause.** The DEAL-1 hardening added an instance-level ownership
check in `deals.controller.ts` — `ability.can(READ, subject('Deal', data))`
(and the shared `assertDealAccess` helper). But the runtime ability built
by `CaslAbilityFactory.createForUser` sets
`detectSubjectType: (item) => item.constructor`, while the DB permission
rules are registered under the **string** subject `'Deal'`. So for an
instance subject CASL resolved the type to the Deal **class**, which never
matched the string-keyed rep rule — `canRead` was always false and every
rep 404'd on their own deals. The class-level guard `@CheckPermission('read',
'Deal')` uses the string form and passed, which is why the request reached
the handler and failed in its body rather than at the guard.

**Fix.** Replaced the broken instance check in `assertDealAccess` and
`findOne` with a direct ownership comparison that mirrors the existing,
working `dealsService.assertDealInScope`: keep `canManage`
(`can(MANAGE,'all'|'Deal')`, string form — correct) for admins/managers,
and for everyone else require `deal.assigned_to === userId`. A foreign id
still answers 404 (not 403) so ids can't be probed. The rollback-request
GET/POST handlers now pass `userId` instead of a CASL action.

**Data impact.** None — read-path authorization only; no rows changed.

Files: `crm-v2-server/src/deals/deals.controller.ts`.

---

## 2026-07-30 — SEC-RL: API rate limiting added; unused `helmet` dependency removed

**Context.** During the earlier security pass two libraries were added to
`package.json` — `helmet` and `@nestjs/throttler` — but nothing imported
either. `helmet`'s job (protective response headers) was already done by a
hand-written middleware in `main.ts`, so it was pure redundancy. Rate
limiting, however, was a genuine gap: the only brute-force protection was
the per-account login lockout (5 fails → 15-min lock), which guards one
account but does nothing against one IP trying many accounts
(credential-stuffing), inbox-spamming the password-reset endpoint, or a
crude request flood.

**Change.**
- **Removed `helmet`** (`npm uninstall helmet`). Headers unchanged — still
  set by the existing middleware. Verified nothing in `src/` imported it.
- **Wired up `@nestjs/throttler`** as a global guard. A generous baseline
  (`default`: 300 req / 60 s per client IP) sheds floods without touching
  normal dashboard traffic; the sensitive public auth routes tighten it:

  | Route | Limit |
  |---|---|
  | `POST /auth/login` | 10 / 60 s |
  | `POST /auth/register` | 5 / 60 s |
  | `POST /auth/password/request-reset` | 5 / 60 s |
  | `POST /auth/password/reset` | 10 / 60 s |

  `GET /auth/refresh` stays on the baseline — it needs a valid refresh
  cookie and legitimately fires from multiple tabs, so a tight cap would
  risk logging real users out. The limiter is registered as the **first**
  global guard, so floods are rejected before any DB/auth work.

**Why a custom guard.** The API sits behind Cloudflare + CapRover's nginx,
so `req.ip` is the *proxy's* address — identical for every visitor. Keying
the limiter on that would drop all users into one shared bucket, so a
single busy client could 429 everyone at once. `ThrottlerBehindProxyGuard`
(`src/common/guards/throttler-behind-proxy.guard.ts`) overrides
`getTracker` to take the real client IP — `CF-Connecting-IP`, then the
left-most `X-Forwarded-For`, then `req.ip` — matching how the audit
middleware already derives client IP. App-wide `trust proxy` is
deliberately left off (it would change secure-cookie detection), which is
why the headers are read directly in the guard.

**Data impact.** None — no schema or data change; request-handling only.

**Verification.** `tsc --noEmit` clean, `nest build` green, and a unit
spec (`throttler-behind-proxy.guard.spec.ts`, 5 cases) pins the IP
precedence and proves two clients behind one proxy get separate buckets.
**Not yet deployed** — on `dube-upgrades`, pending an explicit push.

**Symptom.** Mr Dube: a demo logged 25 Feb on the Lobengula lead was
gone, "six missing" in total.

**Root cause — ours.** Nothing was lost: all six were `cancelled`, and
cancelled activities drop out of the lead view. They were cancelled on
2026-07-23 by our own bulk close-off of 1,287 open+undated activities
older than three months. Verified against the pristine restore of the
PREVIOUS CRM: it only ever had two statuses, `scheduled` (3,817) and
`completed` (1,739) — **"cancelled" never existed there**, so every
cancelled row in the CRM was made cancelled by us. Its `scheduled` was a
catch-all: 3,663 of 3,817 carry no date at all and none has a completion
timestamp, because reps logged work *after doing it* and the old system
gave them no way to close it. Our close-off mistook records of completed
work for stale open tasks.

**Fix (owner ruling).** Show them as **done**, not cancelled and not open
— restoring to `scheduled` would leave a February demo looking like a
forever-overdue task. All **1,287** restored across **645 leads**
(Tanya 369, busi 128, Manake 68, Kim 34, unassigned 44). Only rows in the
07-23 undo file were touched, so anything a human cancelled deliberately
was left alone. Outcome is deliberately non-committal —
`relationship_touchpoint_complete` (the contact happened; the result was
never recorded) — except confirmed demos, which got `demo_completed`.
Every row carries a completion note stating the basis.

**Self-inflicted follow-on, fixed the same hour.** Completing an activity
propagates to the lead (`activities.service.ts` — `last_contacted_at =
completed_at`), so bulk-completing historical work stamped **606 leads**
as "contacted today" when their real last contact was weeks or months
old. That inflated the hygiene score's "recent touch within SLA" points,
flattered outcome-compliance (the last five completions were ours, all
carrying outcomes), and — worse — hid stale leads from idle detection and
SLA alerts. Repaired by recomputing from each lead's own history:
`last_contacted_at` = newest completed call/meeting/whatsapp/email dated
on or before now; `last_action_at` = newest activity `created_at`. A
first pass over-corrected 5 leads into the future (a completed activity
can carry a future `due_at`) plus 12 future `last_action_at`; a second
pass fixed those. Verified: 0 future dates, "contacted today" back to 7
from 599, spot-check 14/19 exact (the 5 others are activities scheduled
for today but completed earlier, where the stored value is the more
accurate one).

**Lesson.** Check what a status transition propagates BEFORE running it
1,281 times. The propagation was documented in the completion path; a
single-record test would have shown it.

---

## 2026-07-27 — NEXT2: reps could not complete activities (SOS)

**Symptom.** Manake could not mark an activity done on the Rupare High
lead — "request failed with status code 400".

**Cause.** `compliance.policy.enforce_next_step_on_completion` was ON in
production (written 2026-07-24 20:05 UTC — three compliance settings
stamped within 300ms, the signature of somebody saving the Compliance &
Controls page; settings changes are recorded NOWHERE, so the system
cannot say who). With it on, the server refuses a completion unless the
lead already has a future actionable activity or the request carries a
`next_step` payload — **and the client never sends that payload**. The
app marks done first and only then opens the follow-up prompt, so the
two halves demand opposite orders. It only bites on leads with nothing
else scheduled, which is why it looked intermittent; managers and admins
bypass the gate entirely.

**Fix.** Setting switched back OFF (its documented reverse, no deploy).
Discipline is retained — the client's own follow-up prompt still requires
a next step after completion. Filed as **NEXT2** (critical) with the
three possible proper fixes and a warning not to re-enable until one
ships. Note the 30s settings cache: the change takes effect within half
a minute, not instantly.

---

## 2026-07-27 — CITY (Nash-import exception) + TRK3 (owner bug detail)

**Commits:** `9481f29` (CITY), `94bbd6a` (TRK3), `a66c463` (CITY tweak)
on `dube-upgrades`.

**CITY.** City stays mandatory for every user-created school; only the
admin/admin_support bulk-import path (the Nash file has no city column)
may create schools without one. City-less schools show **"Click here to
enter city"** (Schools list + school page) and ANY signed-in role can
fill in the missing city; changing a set city stays a manager/admin
action and every fill-in is activity-logged. Guarded migration `1769…`
drops NOT NULL on `schools.city`; lead-creation resolves schools by
name+province (city refines when given; ambiguity → 400 with a
pick-from-suggestions message) and still requires city when a lead
creates a brand-new school.

**TRK3.** Mr Dube's request: every tracker row is now clickable and
opens a read-only, plain-language detail — status sentence, **Raised**
and **Fixed** dates, "What was wrong" (the report) and "What was done
about it" (the resolution note). Triage stays in the admin_support
dialog.

**DEPLOYED TO PRODUCTION 2026-07-27** — api + client both at `a66c463`
(prod client bundle `index-B8_cHNuG.js`). Verified live on prod: import
path (admin_support) creates a city-less school → 201 and the row stores
`city: null`; the `resolved_at` migration ran and backfilled, so **all 39
resolved/closed prod tickets now carry both a Solved date and a
resolution note** — the detail dialog has real content for every one of
them. Test school deleted.

**Staging verification (2026-07-27):** admin city-less create → 201;
sales_manager city-less create → 400 "City is required"; rep fills
missing city → 200 (stored, activity-logged); rep overwrite attempt →
403; rep lead + new school + city → 201; rep lead + new school, no city
→ 400 "City is required to create a new school". All ZZ test records
deleted. Client bundle `index-DtgutNfV.js` fingerprint-verified (detail
dialog + city prompt strings).

**Also today:** three hardening findings (external review, verified in
code) filed as tickets on BOTH trackers: **R14** GET /activities/:id is
unscoped for any signed-in user; **R15** lead-stats endpoint lets any
rep read any lead's engagement aggregates (consistent with the shared-
timelines decision — needs an owner ruling); **SEED1** permission seed
writes `assignedTo` while the deals board reads `assigned_to` — a fresh
reseed would silently drop rep scoping (works today only because live
DB rows carry the snake_case key).

---

## 2026-07-26 — Sunday sweep: 19 tickets fixed in two batches

**Status:** committed on `dube-upgrades` (`f95dc1b`, `a2253e7`, `79bb2f5`),
deployed to **staging** the same day. **Staging brought to HEAD `e07d417`
later the same day** (the first deploy predated the last two commits; the
api was redeployed and verified live — see "Late additions" below).
**DEPLOYED TO PRODUCTION 2026-07-26 (afternoon, owner sign-off)** — api +
client both at HEAD `e07d417` (client bundle `index-BWTolKGQ.js`, title
CRM-DigiLearn). Verified live with disposable zzverify accounts
(sales_rep + sales_manager, removed after): **16/16 API checks PASS**
(R1 regression, R8, R12×2, N5×3, N1, R5, R6 — fresh rep 0 of 5,653
activities, R7 — rep CSV 0 rows, C4 — overdue 29 yearly, C5 — admin 6
deals vs fresh rep 0, C2, R2 regression) plus client bundle fingerprints
(C3 alert gone, C6 `requested_status`, C7 old marker gone, BRAND).
All 20 tickets (the 19 sweep codes + DUP4) flipped to **resolved** on
both trackers with resolution notes; 10 unassigned open prod tickets
assigned to admin_support; the Schools-page feature already tracked as
[SCHLEAD1].
**2026-07-27 follow-up:** re-verified the sweep (staging 17/17 four-role
checks + DUP4 peek; prod bundle fingerprints + C4 live; all 20 codes
resolved-with-note on both trackers). TRK2 (auto-assign) had been left
in_progress though the fix was live and verified — flipped to resolved on
both trackers; ACT1/ACT2/DL1 flipped on the staging tracker to match prod.
Also this day: verified the 07-24 full push live on prod (R1/R3/R2/STAT1,
15/15 API checks with disposable accounts, all cleaned up), discovered the
push had only updated the API, and deployed the missing prod **client**
(bundle `index-O-9yBQnS.js`) — which made LCK1, C9, BRAND1, CSV1, CSV3 and
CSV5 live; all flipped to resolved on both trackers along with R1/R3.

### Batch 1 — rep-visibility / IDOR sweep (server) + client cleanups

- **R4** `GET /payments/:id` honors the list's owner scope; scoped misses
  read as 404 so payment ids can't be probed by a rep.
- **R5** `/reports/sales-performance` + `/reports/pipeline-analysis`
  scoped to the rep's own book (deals assigned, invoices owned).
- **R6** global `/activities` + `/activities/summary` return only the
  rep's own work; record timelines (lead/deal/contact/school-filtered)
  stay open so collaboration remains visible.
- **R7** `GET /leads/export` passes the caller's CASL ability into
  `findAll` — the CSV now matches the list scope instead of dumping the
  whole org.
- **N1** the collections aging report takes an owner scope and is opened
  to `sales_rep`, scoped to invoices they own.
- **C5** the pipeline summary KPIs reuse the board's CASL ownership
  conditions — a rep's header finally counts the same deals as their board.
- **R12** `GET /rbac/permissions/user/:userId` is self-or-admin.
- **N5** single-key + category settings reads are admin-only, matching
  the bulk `GET /settings`.
- **C3** deleted the debug `alert()` on the New-Invoice payment-term flow.
- **R10** Staff page opens read-only for `read:User` (sales_manager);
  add/change-role/deactivate stay behind `manage:User`.
- **R11** Settings gear + settings page gated to admin/admin_support.
- **R13** sidebar no longer returns `null` when RBAC perms are missing —
  Profile and Sign Out survive a failed permissions fetch.

### Batch 2 — correctness family

- **C2** the lead+deal activity OR is bracketed; a bare top-level
  `.orWhere()` had been detaching every later filter (status/open_only/
  dates), corrupting Done/Planned feeds on lead-originated deals.
- **R8** `leads/:leadId/stats` admits `sales_rep` — the owning rep's
  "Manager Glance" was all zeros from a swallowed 403.
- **C4** invoice "Overdue" KPI computed from
  `COALESCE(grace_due_date, due_date) < NOW()` (unpaid balance, subset of
  outstanding) instead of a status value nothing ever writes.
- **C6** reversal-request dialog + pending card read the API's real
  fields (`requested_status`, `created_at`, `lead_summary.status`);
  the client had invented `from_status`/`target_status`/`requested_at`
  and rendered blanks to the approving manager.
- **C7** list/kanban lead markers: completeness now distinguishes
  "qualification record not loaded" (skip those fields) from "loaded and
  absent" (count as missing), so past-New leads aren't all branded
  critical; the "Qualify" chip is status-derived (the old
  `decision_maker_confirmed` test was against a field the server never
  populates — always true).
- **C10** "Discard changes" in Compliance & Controls also reverts the
  Auto-assign toggle.
- **N4** an invoice created against a quote (Manual Invoice path) marks
  the source quote Accepted, matching the Convert button.
- **Bug tracker auto-assign** (owner request, same day): new bug reports
  are assigned to the active `admin_support` user at creation instead of
  arriving "Unassigned" on the very page that user triages.

### Late additions (committed after the sweep log, deployed to staging same day)

- **DUP4** (`8f40484`) schools carry no phone/email signal, so under the
  shared scoring weights an EXACT name+city+province match scored 43 of
  the 50 needed and the school duplicate peek always returned empty.
  School name weights are now exact=50 (flags alone) and near-exact=45
  (needs one supporting signal, city or district).
- **BRAND** (`e07d417`) owner request: capital L — tab title
  `CRM-DigiLearn`, login/forgot/reset fallback names and the Powered By
  line all use the DigiLearn casing.

**Verification (2026-07-26, after redeploying the staging api to HEAD):**
14 live API checks across four roles (admin / sales_manager / sales_rep /
admin_support), all PASS — DUP4 (exact school name → 1 candidate), R8
(rep lead stats 200), R12 (other-user perms 403, own 200), N5 (manager
settings reads 403, admin 200), N1 (rep aging-report 200), R5 (rep
report scoped ≠ admin), R6 (rep sees 1,192 of 5,565 activities), R7
(rep CSV export = 440 rows = rep's own lead count), C4 (overdue KPI:
29 yearly, date-based), C5 (rep pipeline summary 2 deals/$19.5k vs
admin 10/$89.7k on the same pipeline), C2 (deal+lead feed: completed
filter leaks 0, open_only leaks 0), R2 (prince payments 200). The
client-side fixes (C3, C6, C7, C10, R10, R11, R13) are in the deployed
bundle (built at HEAD) — spot-check in the UI at next login.

---

## 2026-07-24 — R1 / R2 / R3: three roles locked out by access control

**Severity:** Critical (R1, R2) · Medium (R3) · **Area:** RBAC
**Status:** Fixed and verified on **staging**. **Not on production.**
**Commit:** `09c0d2e` on `dube-upgrades` — server only, no migration.

Three separate tickets, one family: people who were entitled to a screen
could not reach it. Found by counting the role gates — there are **238
`@Roles()` declarations across 39 controllers**, and the tokens used are
`admin` 215, `sales_manager` 178, `sales_rep` 112, `super_admin` 3,
`viewer` 2, `manager` 2, `finance` 2.

### R1 — every sales rep got HTTP 500 on Quotes and Invoices

**Symptom.** A `sales_rep` opening Quotes or Invoices got a 500. Confirmed
live on staging before the fix: `GET /quotes` and `GET /invoices` both 500,
while `/quotes/stats` and `/invoices/stats` returned 200 — which is why it
looked intermittent.

**Root cause.** The seeded rule is `{"createdBy":"${id}"}`
(seed-roles-permissions.ts:162). `AbilityScopeService` resolves a condition
key with `conditionKeyMap[rawKey] ?? rawKey`, so an unmapped key passes
through **unchanged**. Neither `QUOTE_CONDITION_KEY_MAP`
(quotes.service.ts:36) nor `INVOICE_CONDITION_KEY_MAP`
(invoices.service.ts:49) carried a `createdBy` entry, so the name reached
Postgres as `quote.createdBy` / `invoice.createdBy`. No such column — the
query threw. The owner column on both entities is `owner_id`.

**Fix.** Added `createdBy: 'owner_id'` and `created_by: 'owner_id'` to both
maps. Reverts by deleting the two lines.

### R2 — admin_support (prince) locked out app-wide

**Symptom.** 403 across most of the app. Reproduced on staging before the
fix: `/payments`, `/collections/aging-report` and `/reports/finance` all
403. Still reproducible on **production** right now — it is why the read
status of Mr Dube's notification cannot be checked from this account.

**Root cause.** `admin_support` is seeded with `manage` over the same
subjects as `admin` (seed-roles-permissions.ts:52+), but the name appears in
**zero** of the 238 role gates. Wherever a route falls back to the coarse
role check instead of the finer CASL check, the role was refused. The bug
tracker works only because it declares its own operator list that happens to
include it; campaigns declares the same constant and omits it.

**Fix.** Declared the equivalence once, in `RolesGuard`, via a `ROLE_ALIASES`
map — `admin_support` satisfies a requirement for `admin`. Chosen over
editing 238 decorators, which would also miss every decorator added later.
Reverts by deleting one entry.

**Deliberate widening.** This gives `admin_support` the same reach as
`admin`, including admin-only endpoints. Consistent with what the seed
already grants the role, but it is a real widening and was flagged as such
before the change.

### R3 — the manager role could not open Payments or Collections

**Symptom.** `solomon@clearhue.co.zw` holds only the `manager` role and 403'd
on the whole Payments module and the Collections aging report.

**Root cause.** `manager` is seeded with read access to Payment and Report
but appears in 2 of the 238 gates. Narrower than it first looked — most list
endpoints declare no `@Roles()` at all and so were never blocked.

**Fix.** Added `manager` to the **read** endpoints only: `GET /payments`,
`/payments/stats`, `/payments/statistics`, `/payments/:id`,
`/collections/aging-report`, and the `sales-performance`,
`pipeline-analysis` and `finance` reports. Create, update, delete and the
CSV exports stay closed — the seed grants read, not write, and the exports
are contested under R5/R7.

**Verification.** Before/after probes on staging, per role. R1: four
endpoints 500 → 200. R2: three endpoints 403 → 200. R3: verified with a
staging test account temporarily given the manager role — five reads
returned 200, and `POST`/`DELETE` on Payments still returned 403. The
account was restored to `sales_rep` in the same run and the restore was
confirmed by re-reading it.

**Data impact.** None. No schema change, no data written.

---

## 2026-07-22 — "Last touch / Engagement" showed "No activity yet" incorrectly

**Severity:** Medium · **Area:** Lead & deal detail — "At a glance" panel
**Reported by:** doobsie (owner) — engagement/last-touch bug

**Symptom.** The Engagement section of a lead (and deal) showed "No activity
yet" for Last touch even when the record had many logged calls/WhatsApps.
Deals showed "No activity yet" **always**.

**Root cause (same family as the timeline bug).**
- Lead: `pickPivotalActivities` in `lead-at-a-glance.tsx` derived Last touch
  from `completed[0]` — completed activities **only**. Logged calls/WhatsApps
  (status "scheduled", no due date) were excluded, so leads worked purely by
  logged calls read as "No activity yet". `lastTouchDate` also only honoured
  `completed_at`.
- Deal: `view-deal-details.tsx` rendered `<DealAtAGlance deal={deal} />`
  without ever passing `nextActivity` / `lastActivityAt`, so the panel had no
  data and always showed "No activity yet".
- Server side was already correct: `getLeadActivityStats` computes
  `lastActivityAt` / `isStale` over ALL activities by `created_at`. Purely a
  client defect.

**Fix.**
- Extracted a shared `pickPivotalActivities()` + `activityTouchDate()` into
  `activity-kit.tsx`. Last touch = most recent activity that has actually
  happened: any completed activity, or any open activity that is undated or
  past-dated (a future-dated open item is a plan, not a touch). Effective
  date = `completed_at → scheduled_at → created_at`.
- `lead-at-a-glance.tsx` now uses the shared helper (local duplicate removed).
- `view-deal-details.tsx` now fetches the deal's activities and passes
  `nextActivity` + `lastActivityAt` into `DealAtAGlance`.

**Verification.** Client typecheck clean. Leads/deals with logged (scheduled)
calls now show a real Last-touch time and type instead of "No activity yet".

---

## 2026-07-22 — Activity timeline hid ~63% of all logged activity

**Severity:** High · **Area:** Activities / lead-deal-school-contact detail pages
**Reported by:** doobsie (owner) — "manakedube has nothing on her activity timeline"

**Symptom.** On a lead's Activity tab (and every record detail page), the
activity timeline appeared almost empty for real users, even though they had
hundreds of logged calls, WhatsApps and tasks.

**Root cause.** The redesigned `EngagementWorkspace` (client) split activity
into two sections:
- **Planned** — surfaced only ONE open activity, and when none had a due
  date it fell back to "newest open", promoting a random logged interaction.
- **Activity log (Done) feed** — queried only `status = "completed"` plus
  open *notes*.

Logged calls and WhatsApps are saved with `status = "scheduled"` and **no
due date** (`due_at`/`scheduled_at` null). Such activities are open,
non-note, and undated, so they matched **neither** section and never
rendered. Only completed activities and notes showed.

**Data impact (staging DB snapshot, from the live dump).** Confirmed
systemic across every rep, not a single account:

| Rep | Total | Hidden | % hidden |
|---|---|---|---|
| tanyag | 2,240 | 1,575 | 70% |
| manakedube | 1,189 | 904 | 76% |
| mpofunk | 861 | 618 | 72% |
| busid | 783 | 415 | 53% |

System-wide: **3,525 of 5,557 activities (63%) were invisible.** Dominant
logging patterns: 1,852 calls and 1,465 WhatsApps stored as
`scheduled` / undated. No data was ever lost — purely a display defect.

**Fix.** `crm-v2-client/src/components/activities/engagement-workspace.tsx`:
- **Planned** is now strictly the next *upcoming, dated* step; the
  "newest open regardless of date" fallback was removed. With no dated
  next step, Planned shows its empty state (prompt to schedule).
- **Activity log** now lists every logged interaction — completed
  activities plus all open items (calls/WhatsApps/emails/notes) — de-duped
  by id, excluding only the single Planned card. Ordered by
  `completed_at → scheduled_at → created_at` (desc).
- Raised the two source-query limits from 25/50 to 100/100 so busy records
  aren't truncated.

**Verification.** Busiest lead went from ~3 visible items to **24**
(its full logged history). Client typecheck + build clean.

---

## 2026-07-22 — Real-time pipeline updates never reached any client

**Severity:** Medium · **Area:** Notifications / pipeline board

**Symptom.** Moving a deal to a new stage did not live-update other users'
pipeline boards; they had to refresh manually.

**Root cause.** `deals.service` emitted `pipeline:deal-updated` to a
socket.io room `pipeline:<pipeline_id>`, but the gateway only ever joins a
client to its `user:<id>` room and has no `@SubscribeMessage` handler to
join a pipeline room — so the room had zero members and the event reached
nobody.

**Fix.** Added `NotificationsGateway.emitBroadcast()` (server-wide emit) and
switched the deal-stage emit to it. The payload carries no privileged data;
clients just refetch pipeline/deal data they can already see.
Files: `notifications.gateway.ts`, `deals.service.ts`.

---

## 2026-07-22 — Notification bell badge not refreshed on live push

**Severity:** Low · **Area:** Notifications (client)

**Symptom.** The unread-count badge could lag behind newly pushed
notifications until a manual refresh.

**Root cause.** The socket handler invalidated the query key
`["notifications-unread-count"]`, but the actual unread-count query key is
`["notifications", "unread-count"]` — so that invalidation was a no-op (it
only worked incidentally via a broader prefix invalidation).

**Fix.** Invalidate the correct key.
File: `crm-v2-client/src/hooks/use-notification-socket.ts`.

---

## 2026-07-23 — LCK1/C9: next-step lock trapped reps on their own activities

**Severity:** High · **Area:** Activities / follow-up discipline
**Tickets:** LCK1 (Next-step lock traps reps), C9 (Next-step compliance
gate makes completion impossible for reps)

**Symptom.** A rep completes an activity on a lead that already has a
commitment booked — say a meeting two weeks out. The "Next step required"
modal opens and cannot be dismissed: Esc, outside-click and the close
button are all intercepted, and `beforeunload` blocks refresh. The only
exit is scheduling a *second* future activity. Reported in the meeting:
a rep who phoned a client ahead of a booked meeting could not log that
call, because the modal stood between them and the Log Activity button.

**Root cause.** The client policy `shouldRequireFollowUp()` was strictly
harsher than the server gate it was supposed to mirror. The server's
`ActivitiesService.assertNextStepCompliance()` honours four escape
hatches — non-actionable types, an admin/sales_manager bypass, the
`enforce_next_step_on_completion` policy switch, and (the important one)
**an already-open actionable activity on the same lead/deal**. The client
checked only "is it a note" and "is the record terminal", so it demanded a
next step in cases the server considered already satisfied.

Two aggravating facts:
  - `compliance.policy.enforce_next_step_on_completion` is **false** in
    production, so the server never rejected these completions. The
    undismissable client modal was the *only* thing enforcing anything.
  - The dialog only opens `onSuccess` of the completion — so whenever it
    appeared, the server had already accepted the very completion the
    modal was refusing to let go of.

**Fix.**
  - `shouldRequireFollowUp(activity, context)` now takes a context bag and
    mirrors the server: exempts every non-actionable type (was: notes
    only), and returns `false` for `isManagerOrAdmin` or `hasOpenNextStep`.
  - `FollowUpPromptDialog` resolves that context — it reads the caller's
    roles and queries the parent lead/deal for other open actionable
    activities — then downgrades the prompt from a trap to a nudge when
    either hatch applies. While the lookup is in flight it stays
    permissive rather than flashing a lock it may be about to lift.
  - When a commitment already exists the dialog names it ("Meeting: Demo
    walkthrough — due 6 Aug") and offers **Keep existing next step**
    alongside **Add another step**.

The hard lock still applies where the rule genuinely bites: a sales rep
completing the *last* open actionable activity on an active lead/deal.

Files: `crm-v2-client/src/lib/follow-up-policy.ts`,
`crm-v2-client/src/components/activities/follow-up-prompt-dialog.tsx`.
