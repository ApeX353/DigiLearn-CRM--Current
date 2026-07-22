# End-to-End Test — Bug Inventory (2026-07-22)

Discovered during the pre-rollout E2E audit (live API testing across all four
roles + full-codebase review). **Nothing here is fixed yet** — this is a triage
list for the owner to decide on. Each item: severity, where, what the user sees,
root cause (file:line), affected roles, and a proposed fix.

Roles in play: **admin** (nkululeko), **sales_manager** (busid), **sales_rep**
(manakedube), **admin_support** = "me"/prince, plus a plain **manager** role
(solomon) that exists in the data.

Already fixed & committed separately (NOT in this list): activity timeline,
last-touch/engagement, notification real-time + unread badge, Report-a-Bug
feature. See `BUGFIXES.md`.

Legend: 🔴 High · 🟠 Medium · 🟡 Low

---

## RBAC / access control

### R1 🔴 sales_rep gets HTTP 500 on Quotes and Invoices
- **Where:** `quotes/quotes.service.ts` (QUOTE_CONDITION_KEY_MAP ~L36) + `invoices/invoices.service.ts` (INVOICE_CONDITION_KEY_MAP ~L49); CASL scope applied in each `findAll`.
- **Symptom:** Any sales_rep opening Quotes or Invoices gets a blank page — API returns 500. admin/sales_manager work. **Live on staging now.**
- **Root cause:** The sales_rep ownership permission carries a `created_by` condition, but these tables have no `created_by` column (ownership = `owner_id`). The condition-key map doesn't translate `created_by`, so it emits a literal `quote.created_by` / `invoice.created_by` → Postgres 42703 → 500.
- **Roles:** sales_rep (every one).
- **Proposed fix:** Add `created_by: 'owner_id'` (and `createdBy`) to both condition-key maps. Query-time only; no re-seed.

### R2 🔴 admin_support ("me"/prince) is 403-locked out of nearly the whole app
- **Where:** `admin_support` is whitelisted in exactly ONE server module (bug-reports). It's omitted from the `@Roles`/`ALL_OPERATORS` on: payments (`payments.controller.ts` L30,49,73,92,110,121,137), collections (`reports/collections.controller.ts:20`), cash-requisitions (L34-40), campaigns (L16-22), deals, **settings** (all routes), **users** (`users.controller.ts:39,74,89,109,133,158,179`), **rbac** (every route), **email-sequences**, **email-templates**, **audit**, **payment-terms**, **dashboard/compliance-report**.
- **Symptom:** The sidebar shows prince every admin item (nav maps admin_support→admin at `main-dashboard-sidebar.tsx:36-41`) and the seed grants admin_support CASL `manage`, but almost every endpoint enforces by hard-coded role **name** `@Roles('admin')`, so he clicks in and gets 403 → empty/broken Users, Settings, Approval Queue, Compliance, Email, Payments, Deals, etc. The "admin_support mirrors admin" fix from last session was only half-wired (CASL perms + nav, but not the role-name guards).
- **Root cause:** enforcement is by role name, and `admin_support` was never added to those lists.
- **Roles:** admin_support (prince — the owner's own account).
- **Proposed fix:** Add `'admin_support'` alongside `'admin'` in the `@Roles`/`ALL_OPERATORS` across these controllers (or, bigger: make the guard treat admin_support as admin centrally).

### R3 🔴 plain `manager` role is 403-locked out of Payments and Collections
- **Where:** `payments/payments.controller.ts` @Roles (no `'manager'`), `reports/collections.controller.ts:20`.
- **Symptom:** A user with the `manager` role (e.g. solomon) sees Payments/Collections in the nav but gets 403 → empty. `manager` IS allowed on Requisitions/Campaigns, so the omission is inconsistent, and the seed grants `manager` read-Payment.
- **Roles:** manager.
- **Proposed fix:** Add `'manager'` to the payments + collections `@Roles`. (Decide whether `manager` should really see these first.)

### R4 🟠 GET /payments/:id is not owner-scoped (sales_rep IDOR)
- **Where:** `payments/payments.controller.ts:109-118` findOne → `payments.service.ts:127-136` (bare `findOne` by id, no `invoice.owner_id` check).
- **Symptom:** A sales_rep can fetch ANY payment by id (amount, method, notes, client name/email) even for invoices they don't own. The list is scoped; the detail route is the gap.
- **Roles:** sales_rep (read-only leak). update/delete are admin/sales_manager only.
- **Proposed fix:** Pass the scopeUserId into `findOne` and enforce `invoice.owner_id` for sales_rep (as findAll/stats do).

### R5 🟠 Reports leak org-wide financials to sales_rep
- **Where:** `reports/reports.controller.ts:32-47` (@Roles includes sales_rep) → `reports/reports-read.service.ts:70-171` (no userId, no `assigned_to` scoping).
- **Symptom:** A sales_rep opening Reports sees company-wide Principal Sold, Cash Collected, Outstanding, and full pipeline counts/values — not just their own. Inconsistent with the rep-scoped dashboard.
- **Roles:** sales_rep.
- **Proposed fix:** Scope `getSalesPerformance`/`getPipelineAnalysis` to `assigned_to = userId` for sales_rep, or drop sales_rep from the route.

### R6 🟠 /activities global list has no owner scoping (sales_rep sees everyone's activity)
- **Where:** `activities/activities.controller.ts:75-88` (no @Roles/scoping) → `activities/activities.service.ts:697-705` (self-scope commented out). Activities page defaults the rep filter to "Everyone" (`activities-page.tsx:109`).
- **Symptom:** A sales_rep on the Activities page sees all 5,557 activities across every rep by default (confirmed live).
- **Roles:** sales_rep.
- **Proposed fix:** Decide policy. If reps should see only their own: scope the global list to `created_by`/`assigned_to = userId` for sales_rep (keep lead_id/deal_id-scoped record timelines intact). If collaborative visibility is intended, leave as-is (but then it's not a bug).

### R7 🟠 CSV lead export ignores owner-scoping (sales_rep can export all leads)
- **Where:** `leads/leads.controller.ts:130-160` (`exportCsv`, @Roles includes sales_rep) calls `leadsService.findAll({limit:'1000'})` with **no ability** → `leads.service.ts:507-514` only scopes when an ability is passed.
- **Symptom:** `GET /leads/export` returns a CSV of every lead in the org (names, schools, contacts, phones, assignees) to any sales_rep. No UI button wired today, but the API is reachable.
- **Roles:** sales_rep (data leak).
- **Proposed fix:** Pass the caller's ability/scope into the export query (or restrict the route to admin/sales_manager).

### R8 🟠 Manager Glance lead stats 403 for the rep who owns the lead
- **Where:** `activities/activities.controller.ts:117-118` `@Roles('admin','manager','sales_manager')` on `GET leads/:leadId/stats`; client `components/leads/tabs/activities-tab.tsx:29` calls it for every viewer.
- **Symptom:** A sales_rep (or admin_support) opening a lead they own gets 403 on the stats call (swallowed) → every "Manager Glance" KPI shows 0/— and the Stale badge never appears, making real engagement look empty.
- **Roles:** sales_rep, admin_support.
- **Proposed fix:** Add `sales_rep` (and `admin_support`) to the endpoint's @Roles.

### R9 🟠 RBAC permission toggles on the admin panel don't actually enforce (answers your earlier question)
- **Where:** admin panel toggles `roles/manage-roles-and-permissions.tsx:144-167` write DB `rolePermission` rows; but only 4 controllers enforce via CASL `@CheckPermission` (deals, leads, invoices, quotes). Everything else (settings, users, rbac, email, audit, payment-terms, products, dashboard, reports + all nav visibility) enforces by role **name** (`roles.guard.ts:92-109`, `allowedRoles`, `useAnyRole`).
- **Symptom:** An admin toggles a permission (e.g. `manage:User`, `read:Report`) expecting to grant/revoke a screen — nothing changes for those role-name-gated pages. The switches are effectively cosmetic outside deals/leads/invoices/quotes. **This is the "are the toggles wired?" concern from last session: mostly, they are not.**
- **Roles:** admin (toggles have no effect); all roles (permissions not honored).
- **Proposed fix:** Big decision — either (a) migrate route enforcement to CASL `@CheckPermission` app-wide so toggles are authoritative, or (b) accept role-name enforcement and make the toggle UI read-only/informational for unsupported subjects. Needs your call.

### R10 🟠 sales_manager sees the "Users" nav item but the Staff page hard-denies them
- **Where:** nav shows Users to sales_manager (`navigation-config.ts:240-245`) and server `GET /users` allows sales_manager (`users.controller.ts:38-39`), but the page gates on `usePermission("User","manage")` (`staff-page.tsx:38`) and sales_manager only has `read:User` (`seed:89`).
- **Symptom:** sales_manager clicks Users → full-page "Access Denied", even though the server would return the list.
- **Roles:** sales_manager.
- **Proposed fix:** Align the three layers — gate the page on `read:User` (or grant sales_manager `manage:User`, or hide the nav item).

### R11 🟠 Settings gear shown to every role; page + endpoints are admin-only
- **Where:** footer Settings link has no role check (`main-dashboard-sidebar.tsx:109-120`), `settings-page.tsx` has no gate, but `GET /settings` is `@Roles('admin')`.
- **Symptom:** sales_rep / sales_manager / admin_support all see a Settings gear; opening it 403s → blank Company Info, "Save" errors, Compliance/Targets tabs fail to load.
- **Roles:** sales_rep, sales_manager, admin_support.
- **Proposed fix:** Add a role gate to the Settings nav link + page (admin, and admin_support if R2 is fixed).

### R12 🟠 IDOR — any logged-in user can read anyone's roles & permissions
- **Where:** `rbac/rbac.controller.ts:102-114` `GET /rbac/permissions/user/:userId` has NO `@Roles`; with the default-allow guard (no decorator ⇒ allow), any user can pass an arbitrary userId.
- **Symptom:** A sales_rep can read an admin's full role/permission set by UUID. Information disclosure.
- **Roles:** all (any authenticated user).
- **Proposed fix:** Add `@Roles('admin')` (+ admin_support) or restrict to self.

### R13 🟡 Whole sidebar vanishes if the RBAC fetch fails on login
- **Where:** `main-dashboard-sidebar.tsx:77` (`if (!isLoaded) return null`), `rbac-provider.tsx:26-41` (renders app once loading ends even if not loaded), `use-rbac.ts:132-144` (`retry:1`).
- **Symptom:** On a fresh login, if `GET /rbac/permissions/user/:id` fails after one retry, the app renders with NO nav at all — including Profile/Settings/Sign Out — until a manual reload.
- **Roles:** all (transient).
- **Proposed fix:** Render a minimal fallback nav (at least Sign Out) when perms fail; add better retry/backoff.

---

## Correctness / data

### C1 🔴 Manager/admin "Assigned To" is dropped when creating a lead
- **Where:** `leads/leads.service.ts:316` (`createWithSchoolAndContacts` hard-codes `assigned_to: userId`); DTO carries `leadInfo.assigned_to` (`create-lead-with-school-contacts.dto.ts:293`); client sends it (`create-new-lead.tsx:630-656`).
- **Symptom:** An admin/sales_manager creates a lead and picks a rep as owner → the lead is assigned to the creator instead. The chosen rep never gets it.
- **Roles:** admin, sales_manager (assignment lost); sales_rep deprived.
- **Proposed fix:** Honor `leadInfo.assigned_to` when the caller is admin/sales_manager (fall back to creator otherwise).

### C2 🔴 Deal Activities feed is corrupted for any deal that came from a lead
- **Where:** `activities/activities.service.ts:677-683` — a top-level `.orWhere('(deal_id OR lead_id)')` breaks the AND-chain (SQL AND binds tighter than OR), dropping the status/open_only filters. Reached because `view-deal-details.tsx:1167-1211` passes both `dealId` and `leadId`.
- **Symptom:** On a lead-originated deal (the common case), the Done/history tab shows non-completed items and the Planned/open query returns completed ones — counts and feeds on Activities/Notes/Emails/Calls tabs show the wrong set.
- **Roles:** all.
- **Proposed fix:** Wrap the lead/deal OR in a `Brackets` and drop the duplicated conditions.

### C3 🔴 Debug `alert()` shipped in the New-Invoice form
- **Where:** `crm-v2-client/src/pages/invoices/create-invoice-page.tsx:355-361`.
- **Symptom:** Applying any payment term on the New Invoice form pops a raw JSON `alert()` that blocks the page. (The Quote form has no such alert.)
- **Roles:** anyone creating an invoice with a payment plan.
- **Proposed fix:** Delete the `alert(JSON.stringify(...))`.

### C4 🟠 Invoice "Overdue" KPI is always 0
- **Where:** `invoices/invoices.service.ts:958-978` (`getInvoiceStats` groups on `status === 'Overdue'`), surfaced `invoices-page.tsx:91,208`.
- **Symptom:** The Invoices "overdue" stat always reads 0 even with past-due invoices. No code path ever sets `status='Overdue'`; every other overdue calc is date-based (`COALESCE(grace_due_date,due_date) < NOW()`).
- **Roles:** all viewing invoice stats.
- **Proposed fix:** Compute overdue by date, not by the never-set status.

### C5 🟠 Pipeline summary KPIs are not owner-scoped while the board is
- **Where:** `deals/deals.service.ts:393-451` (`getPipelineSummary`, unscoped) vs `findPipelineDeals` (scoped). Controller `deals.controller.ts:128-147`.
- **Symptom:** A sales_rep's pipeline header ("Total deals / Pipeline value / Avg health / Overdue") is computed across ALL reps' deals while the board below shows only their own → header can say "50 deals / $2M" over a 3-card board.
- **Roles:** sales_rep (and viewer).
- **Proposed fix:** Apply the same CASL ownership scope to `getPipelineSummary`.

### C6 🟠 Reversal-request review dialog shows blank fields
- **Where:** client `components/leads/lead-actions/review-reversal-request-dialog.tsx:155,159,163` and `view-lead-page.tsx:620,624` read `requested_at`/`from_status`/`target_status`; server entity exposes `requested_status`/`created_at`/`reviewed_at` (`lead-reversal-request.entity.ts`). Client type invented the names (`api/lead-reversal-requests/types.ts:45-54`).
- **Symptom:** In "Review Reversal Request" and the pending side-card, "Requested at" shows `--` and From/Target status are blank — a manager approves a status rollback without seeing the target status.
- **Roles:** admin, sales_manager (reviewers); assignee sees blank card.
- **Proposed fix:** Map client fields to the real API names (`requested_status`, `created_at`).

### C7 🟠 Lead list/kanban show false "Incomplete data" + "Not yet qualified" markers
- **Where:** `crm-v2-client/src/components/leads/lead-row-markers.tsx:47` (calls completeness without the `qualification` arg → `qualification_authority` critical always unmet) and `:119-131` (gates on `lead.decision_maker_confirmed`, a field the server never populates).
- **Symptom:** Fully-qualified leads still show red "Incomplete data" and amber "Not yet qualified" markers in the table/kanban, defeating the signal.
- **Roles:** all viewing the list.
- **Proposed fix:** Pass the lead's qualification into the completeness call; derive the qualified marker from the real qualification record, not `decision_maker_confirmed`.

### C8 🟡 deal.value overwritten by the last quote/invoice total
- **Where:** `quotes.service.ts:117-126,290-299`; `invoices.service.ts:147-157,333-343,538-547`.
- **Symptom:** A deal's value is set to the total of whichever quote/invoice was last created/edited (incl. payment-term child invoices), so multi-document deals show a wrong headline value that also feeds the pipeline value rollup.
- **Roles:** all (data correctness). NOTE: the code comments call this deliberate — confirm intended behavior before changing.
- **Proposed fix:** Aggregate across the deal's documents, or stop auto-overwriting deal.value.

### C9 🟠 Next-step compliance gate makes completion impossible for reps (when enabled)
- **Where:** server `activities.service.ts:123-178` + `updateStatus` accepts `next_step`; client `api/activities/use-activities.ts:136-148` never sends it; `activity-completion-dialog.tsx:78-98` has no next-step field; follow-up prompt fires only on success.
- **Symptom:** With policy `enforce_next_step_on_completion` ON, a rep marking a call/meeting done (with no pre-existing future activity) gets a hard 400 and cannot complete it from any UI path. Config-gated (off by default?).
- **Roles:** sales_rep.
- **Proposed fix:** Send `next_step` from the completion dialog, or run the follow-up prompt BEFORE completion when the gate would trip.

### C10 🟡 "Discard changes" doesn't revert the Auto-assign toggle
- **Where:** `components/admin/compliance-controls-content.tsx:492-601` — `handleReset` re-applies every field except `setAutoAssignEnabled`.
- **Symptom:** An admin flips "Auto-assign new leads", clicks "Discard changes" — every other field reverts but the auto-assign switch keeps the edited value (and dirty flag clears), misrepresenting saved state.
- **Roles:** admin.
- **Proposed fix:** Include `setAutoAssignEnabled` in `handleReset`.

---

## Lower-priority notes (verify intent; may not need a fix)

- **N1 🟡 Collections aging report has no owner scoping at all** (`reports/reports-read.service.ts:250-265`). Not a leak today (admin/sales_manager only) but can't be safely opened to reps as-is.
- **N2 🟡 Requisition self-approval** (`cash-requisitions.service.ts:321-343`): a manager can raise and then manager-approve their own requisition (no `requested_by_id !== actor` guard). May be intended.
- **N3 🟡 discipline-metrics.service.ts:120-179** uses brittle `subject ILIKE '%demo%'` counting (~10× over-count), but the endpoint appears unused by the client.
- **N4 🟡 Quote→Invoice via "Manual Invoice" link** doesn't mark the source quote `Accepted` (only the deal Products-tab "Convert" button does), so a quote can stay `Sent` after an invoice was made from it.
- **N5 🟡 sales_manager can read arbitrary single settings** via `GET /settings/:key` and `/settings/category/:category` (`settings.controller.ts:84-114`) even though the bulk `GET /settings` is admin-only. Read-only, non-secret — inconsistent gate.

---

## Verified OK (checked, no bug)
- **Public registration IS locked** — verified live: `POST /auth/register` with a valid body returns `403 "Public registration is disabled"` (gated by `ALLOW_PUBLIC_REGISTRATION`, unset on staging). The 5th auditor flagged this as open, but that was a false positive (it read the service without the controller gate). Note: it opens if someone sets `ALLOW_PUBLIC_REGISTRATION=true`.
- Kanban drag/optimistic update + query invalidation; installment math (distribution/rounding); JWT representative-role scope bypass for admin/sales_manager; requisition approval state machine + per-currency rollups + divide-by-zero guards; SLA breach service; scheduling hold/confirm; notification socket hook; lead status-tab enum matching; qualification score math; global guard order (ApiKey→JWT→Roles).

---

## Summary counts
- 🔴 High: R1 (quotes/invoices 500), R2 (admin_support locked out app-wide), R3 (manager locked out of payments/collections), C1 (lead assign dropped), C2 (deal activity feed corrupted), C3 (debug alert in invoice form).
- 🟠 Medium: R4 (payment IDOR), R5 (reports leak to rep), R6 (activities visible to all reps), R7 (lead CSV export leak), R8 (Manager Glance 403 for owner), R9 (RBAC toggles don't enforce), R10 (sales_manager Users denied), R11 (Settings gear for all), R12 (rbac IDOR), C4 (invoice overdue KPI = 0), C5 (pipeline KPIs unscoped), C6 (reversal dialog blank), C7 (false lead markers), C9 (next-step gate blocks completion).
- 🟡 Low: R13 (sidebar vanishes on RBAC fail), C8 (deal.value clobber — maybe intended), C10 (auto-assign discard), N1–N5.

Total: **6 High, 14 Medium, ~8 Low/notes.**
