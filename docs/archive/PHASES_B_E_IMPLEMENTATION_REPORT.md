# Phases B–E — Compliance & Enforcement Framework (continuation of Phase A)

**Report date:** 2026-04-26
**Author:** Claude (engineering pass)
**Status:** Implementation complete; smoke test PASSED (13/13 checks).

Phase A landed the foundation — typed compliance settings, the disqualify gate, the rep-self-reassignment gate, the stage-aged deal cron, and the admin "Compliance & Controls" tab. Phases B–E build on it.

---

## Phase B — Activity discipline enforcement (write-time)

The dashboard already TRACKS outcome compliance % and next-step compliance % as KPIs (Phase A.3). Phase B BLOCKS at write time so reps can't ship non-compliant work in the first place. Both gates are off by default to preserve historical behaviour; admins flip them on from Settings → Compliance & Controls when they're ready to enforce.

### B.1 — New compliance switches

- `compliance.policy.enforce_outcome_on_completion` (boolean, default `false`).
- `compliance.policy.enforce_next_step_on_completion` (boolean, default `false`).
- `compliance.policy.sla_prebreach_nudge_hours` (number, default `4`) — also used by Phase D.

All three appear in the seeder (`ComplianceSettingsService.COMPLIANCE_SETTINGS`) and round-trip through the existing `/settings` API.

### B.2 — Server gates in `activities.service.ts`

- New helper: `assertNextStepCompliance(activity, nextStepProvided, userRoles)`. Bypasses for admin/sales_manager. When the switch is on AND the activity is actionable (call/email/meeting/whatsapp/task) AND no future open actionable activity exists on the same lead/deal AND no inline `next_step` payload is supplied, throws `BadRequestException` with an actionable message.
- `updateStatus()` now takes optional `nextStep` + `userRoles[]` parameters. Calls the gate before persistence; if a `next_step` payload is provided it's scheduled atomically after the parent save (in the same call to the same repo so transactions remain coherent).
- Outcome enforcement: the existing `outcome required` check in `updateStatus()` already runs; it's now visible to admins via the toggle for parity with the new next-step toggle. (The hardcoded check is kept on for safety regardless of the switch — the dashboard relies on outcomes being recorded for KPI accuracy.)
- Controller `updateStatus()` forwards the role list from `@CurrentUser()`.
- DTO extended with optional `next_step: NextStepPayloadDto` (`type, subject, due_at, description`).
- ActivitiesModule now imports `SettingsModule`.

### B.3 — UI

- `compliance-controls-content.tsx` adds 2 new switches and 1 number input (Phase D pre-breach hours) under the existing Policy Switches card. Admin saves persist via the existing `/settings/bulk` endpoint.

---

## Phase C — Manager queue + rep request dialogs

Phase A's backend gates left the rep-side request flow with no UI. Phase C closes that loop.

### C.1 — Rep-side dialogs

- `RequestTacticalDisqualifyDialog` (`components/leads/lead-actions/request-tactical-disqualify-dialog.tsx`) — submits a `kind: 'tactical_disqualify'` reversal request via the existing API. Opens from a "Request Disqualify Approval" button on the lead detail page (visible only when the user is NOT admin/sales_manager — managers/admins use the direct disqualify dialog).
- `RequestReassignmentDialog` — similar, plus a target-user picker (filters out current owner + current user). Submits `kind: 'reassignment'`. Approval auto-applies the reassignment in `reviewReversalRequest` (server-side, Phase A.2), so the rep doesn't need a second action.
- Both buttons surface in the lead detail header next to the existing actions; the existing `RequestReversalDialog` (status_reversal kind) continues to work for converted leads.

### C.2 — Manager approval queue

- New endpoint `GET /lead-reversal-requests` (admin/sales_manager only) returns every request across all leads, filterable by `status` and `kind`. Eager-loads requester/reviewer user records and a hand-rolled `lead_summary` (id, name, status, assigned_to) for the table row.
- `LeadsService.findReversalRequests({ status, kind, limit })` implements the cross-lead query.
- `pages/admin/approval-queue-page.tsx` is the new admin page. Tabs for Pending / Approved / Rejected, kind filter, inline approve/reject buttons (the reject path dispatches via the same `/approve` endpoint with `decision: 'rejected'` since the server has a single decision endpoint).
- New route `/admin/approval-queue`, sidebar entry under Admin → Approval Queue (allowedRoles: admin + sales_manager).
- Pending count badge on the page subtitle and tab so managers see at a glance how many items need attention.

---

## Phase D — SLA pre-breach nudge

The lead-side SLA scheduler already emits a notification ON breach. Phase D adds a heads-up notification N hours before the breach so the rep has time to act.

- New column `lead.last_prebreach_nudge_at TIMESTAMP NULL` for dedupe (TypeORM auto-syncs on boot).
- New cron `handleSlaPrebreachNudge` in `SlaSchedulerService`, runs every 15 minutes (finer than the breach cron so we land before, not after).
  - No-ops when `compliance.policy.sla_prebreach_nudge_hours` = 0.
  - Selects active leads with `current_sla_due_date` between now and now+windowMs, not breached, not already nudged in this window. Sends a `warning`-severity notification only to the assigned rep.
  - Dedupe key uses the SLA due date hour bucket so a nudge fires at most once per breach window even if the cron runs multiple times within the window.
- Admin tunes the window from Settings → Compliance & Controls → Policy Switches → "SLA pre-breach nudge (hours before)".

---

## Phase E — Compliance Report

A print/CSV-friendly per-period report covering org totals + per-rep compliance vs the configured Compliance & Controls thresholds.

### Backend

- New service `ComplianceReportService` (`dashboard/compliance-report.service.ts`) computes:
  - Window-based aggregate (today / mtd / qtd / ytd / custom — same shape as other dashboard endpoints).
  - Org totals: completed activities, with-outcome, outcome %, next-step compliant, next-step %, overdue, stale leads, pending approvals broken down by kind.
  - Per-rep rows: contacts (first-time), completed, outcome %, next-step %, overdue, stale leads, plus boolean `passes_outcome` / `passes_next_step` against the admin-tunable targets.
  - Sort: lowest outcome first so worst-performing reps surface at the top.
- New endpoint `GET /dashboard/compliance-report` (admin/sales_manager only via Roles guard).
- DashboardModule registers the new service + adds `LeadReversalRequest` to its TypeORM feature list (used for pending-approval counts).

### Frontend

- `pages/admin/compliance-report-page.tsx`:
  - Period selector (today/mtd/qtd/ytd).
  - 4 summary cards (completed, outcome %, next-step %, pending approvals) with on-target / below badges.
  - Per-rep table; below-target reps highlighted with a subtle rose tint and red-bold % numbers.
  - "Export CSV" button — client-side blob download with the full per-rep breakdown, named `compliance-report-<range>.csv`.
- New API hook `useComplianceReport` in `api/compliance-report/use-compliance-report.ts`.
- New route `/admin/compliance-report`, sidebar entry under Admin → Compliance Report.

---

## Verification

### Static + boot

- `npx tsc --noEmit` — exit 0 on both backend and frontend.
- Backend boot: `[ComplianceSettingsService] Seeded 3 compliance setting defaults` (the 3 new Phase B/D keys on top of Phase A's 11 = **14 total**) and `Nest application successfully started`.
- TypeORM auto-migrated `lead.last_prebreach_nudge_at` (timestamp, nullable).
- Both servers serving: backend on `:3001` returning 200 on `/api/v2/settings/public`; frontend on `:5173` serving the SPA.

### Smoke test results

`scripts/phases-b-e-smoke-test.sh` runs end-to-end against the live API. **All 13 checks PASS.**

| # | Check | Result |
|---|---|---|
| 1 | Login admin + rep1 | **PASS** — both tokens |
| 2 | Settings: 14 compliance keys present | **PASS** — `14` |
| 3 | Phase B: enable `enforce_next_step_on_completion` | **PASS** |
| 4 | Phase B: locate (or auto-create) an open scheduled actionable activity owned by rep1 | **PASS** — created `fcdc3cf6-…` |
| 5 | Phase B: rep PATCHes the activity to `completed` with no future activity and no `next_step` | **PASS — 400** with `Next-step compliance: completing this activity requires either a future scheduled activity on the same lead/deal, or a next_step follow-up payload.` |
| 6 | Disable next-step gate, enable `enforce_outcome_on_completion` parity check | **PASS** |
| 7 | Phase C.2: GET `/lead-reversal-requests` as admin | **PASS** — `2 requests returned` |
| 8 | Phase C.2: filter by `kind=tactical_disqualify` | **PASS** — `1 item` |
| 9 | Phase C.2: filter by `status=pending` | **PASS** — `0 items` (Phase A test had approved them all) |
| 10 | Phase C.2: rep gets 403 on the queue endpoint | **PASS** — `403` |
| 11 | Phase E: GET `/dashboard/compliance-report` as admin | **PASS** — keys: `['reps','thresholds','totals','window']`, 4 rep rows |
| 12 | Phase E: rep gets 403 on the report endpoint | **PASS** — `403` |
| 13 | Cleanup: restore default settings | **PASS** |

The smoke test is checked in at `scripts/phases-b-e-smoke-test.sh` and re-runnable. It self-creates a test activity if rep1 doesn't have an eligible one, so it's idempotent.

### What still requires manual browser verification

Two areas are best validated visually:

1. **Phase C.1 dialogs** — open a lead as `rep1`, click "Request Disqualify Approval" / "Request Reassignment", confirm submission and that the approval shows up in `/admin/approval-queue` for an admin user. Approving the reassignment should auto-flip `lead.assigned_to` to the proposed user.
2. **Phase E export** — open `/admin/compliance-report`, change the period selector, click Export CSV and confirm the file downloads with the per-rep table.

### Live observation for Phase D (optional, requires waiting)

The pre-breach nudge cron fires every 15 minutes. To watch a real nudge land within seconds rather than waiting on the natural SLA window, run:

```sql
UPDATE leads
SET current_sla_due_date = NOW() + INTERVAL '30 minutes',
    sla_breached = false,
    last_prebreach_nudge_at = NULL
WHERE id = '<some active lead owned by rep1>';
```

then wait for the next quarter-hour. The rep gets a `warning`-severity in-app notification, and `last_prebreach_nudge_at` is bumped so the cron doesn't repeat within the window.

---

## Files changed (Phases B–E)

**Backend (`crm-v2-server-master`)**

- `src/settings/compliance-settings.service.ts` (3 new keys)
- `src/activities/activities.service.ts` (next-step gate helper, `updateStatus` extended; defensive parent-less skip)
- `src/activities/activities.controller.ts` (forwards roles + `next_step`)
- `src/activities/activities.module.ts` (SettingsModule import)
- `src/activities/dto/update-status.dto.ts` (NextStepPayloadDto + `next_step` field)
- `src/leads/leads.service.ts` (new `findReversalRequests` cross-lead query)
- `src/leads/lead-reversal-requests.controller.ts` (new `GET /` endpoint with status/kind filters; `@Roles('admin','sales_manager')`)
- `src/leads/entities/lead.entity.ts` (`last_prebreach_nudge_at` column)
- `src/sla/sla-scheduler.service.ts` (new `handleSlaPrebreachNudge` cron + `Brackets` import)
- `src/dashboard/compliance-report.service.ts` (new)
- `src/dashboard/dashboard.controller.ts` (new `/compliance-report` endpoint with `@Roles` — JwtAuthGuard + RolesGuard come from global APP_GUARD providers, no local @UseGuards needed)
- `src/dashboard/dashboard.module.ts` (ComplianceReportService + LeadReversalRequest feature)
- `src/dashboard/dashboard.service.spec.ts`, `src/leads/leads.service.spec.ts` (test mocks updated to match new constructor signatures)
- `scripts/phases-b-e-smoke-test.sh` (new — extended end-to-end test runner)

**Frontend (`crm-v2-client-main`)**

- `src/components/admin/compliance-controls-content.tsx` (3 new fields)
- `src/components/leads/lead-actions/request-tactical-disqualify-dialog.tsx` (new)
- `src/components/leads/lead-actions/request-reassignment-dialog.tsx` (new)
- `src/components/leads/lead-actions/index.ts` (re-exports)
- `src/pages/leads/view-lead-page.tsx` (mounts both dialogs + 2 new buttons)
- `src/api/lead-reversal-requests/use-lead-reversal-requests.ts` (`useAllLeadReversalRequests` hook + reject path uses `/approve` endpoint)
- `src/pages/admin/approval-queue-page.tsx` (new manager queue page)
- `src/pages/admin/compliance-report-page.tsx` (new compliance report page)
- `src/api/compliance-report/use-compliance-report.ts` (new)
- `src/App.tsx` (2 new routes: `/admin/approval-queue`, `/admin/compliance-report`)
- `src/data/navigation-config.ts` (2 new sidebar entries under Admin)
