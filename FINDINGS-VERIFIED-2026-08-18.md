# CRM-TEST-FINDINGS — verified still-true set (2026-08-18)

Re-verification of `CRM-TEST-FINDINGS-2026-08-15.md` against the deployed prod
branch `tickets-1114-on-baseline` (api v42 / crm v34). Finding numbers are the
original doc's. Most findings survived; **23 were discarded** (fixed/incorrect —
listed at the bottom). Items marked *(narrowed)* had a sub-claim dropped.

## Governance / approvals
- **C1** `PATCH /leads/:id/status` unvalidated `@Body('status') string`; a rep can revert Converted with no reversal/approval, `converted_at` not cleared (leads.controller.ts:531-559; leads.service.ts:1841-1919).
- **2.2** `@Roles` dead behind CASL + self-approval; reversal/rollback review does no role or self check (roles.guard.ts:92-117; leads.service.ts:1439-1519; deals.service.ts:880+). **Live ship-blocker.**
- **2.3** Reversal approval hard-DELETEs invoices/quotes/deals before status update; Payment→Invoice FK cascades (leads.service.ts:1466,1521-1582). **Live ship-blocker.**
- **2.4** No segregation of duties (no requester-vs-approver, no threshold) unlike cash-requisitions (leads.service.ts:1439-1519; cash-requisitions.service.ts:340-345).
- **5.6** Manager 404 on unowned deal (gate needs `manage`, seed grants CRUD); rollback review ungated (deals.controller.ts:468-483; seed-roles-permissions.ts:104-107).
- **C3** `closeDeal` has no evidence gate, no deal_stage_history row (deals.service.ts:659-702).
- **5.9** Bulk lead ops dead/silent/unscoped; BulkActionBar imported nowhere, hardcodes "Contacted" (leads.controller.ts:591,617; bulk-action-bar.tsx:67).

## Money / finance
- **C5** multiple_invoices strands cash — writes amount_paid:0/Unpaid on a parent that may hold payments (payment-terms.service.ts:347-351).
- **3.2** Allocation columns don't sum to amount for non-installment payments (payments.service.ts:75-88,303-322).
- **3.3** *(narrowed)* Finance report counts child + Draft invoices as outstanding (reports-read.service.ts:208-216).
- **3.4** amountDue double-subtracted (server nets, client subtracts again) (reports-read.service.ts:223-226; view-reports-page.tsx:394).
- **3.5** Discount % on client, absolute on server, PDF prints as money (document-items.tsx:76,149; invoices.service.ts:969-972).
- **3.7** Invoice delete cascades payments, orphans schedule (invoices.service.ts:554-571; payment.entity.ts:52).
- **3.8** recalc writes 'Sent' unconditionally / un-cancels invoice (invoices.service.ts:901-904,932-939).
- **3.9** Schedule not regenerated on item change; re-apply refused (invoices.service.ts:778,823,857).
- **3.10** Nameless Collections rows (aging keys on school_id ?? ''); unrounded float (reports-read.service.ts:223-227,317-358).
- **3.11** Three incompatible 'overdue' defs; none writes status='Overdue' (dashboard.service.ts:335; invoices.service.ts:318,1116).
- **3.12** Stats double-count splits; gross vs net (invoices.service.ts:1089-1099).
- **3.13** Manual invoice-from-quote has no duplicate guard once quote Accepted (invoices.service.ts:207-215).
- **3.14** Unbounded item discount → negative totals; Draft/Cancelled accept payment (create-invoice.dto.ts:40-44; payments.service.ts:53-57).
- **3.15** *(narrowed)* Allocation-reference collision; Invoice/Payment/Quote lack currency (only Deal has it) (payment-terms.service.ts:645-663).
- **3.16** *(narrowed)* Sub-items: interest/schedule invoice-only; zero-balance installments never paid; PATCH moves due_date without grace; payments never validate vs balance.
- **3.19** *(narrowed)* `client_email` not even `@IsEmail` (create-invoice.dto.ts:85-89).
- **3.20** Payment reference unvalidated free text (create-payment.dto.ts:34-38).

## Sales-rep workflow
- **C4** POST /activities completed bypasses gates (assertOpenActivityHasDate early-returns; next-step never called from create) (activities.service.ts:387-392,510-520).
- **4.5** Reopening a completed activity hides work (completed_at/outcome not cleared) (activities.service.ts:1478-1484).
- **4.6** Ticking a task Done writes child row only; Activity status/contact-status untouched (tasks-tab.tsx:64-68).
- **4.8** Request Reassignment unfillable by a rep (users list is admin/manager-only) (request-reassignment-dialog.tsx:40; users.controller.ts:39).
- **4.10** Stakeholders append-only (edit/remove are toast stubs, no server routes) (people-tab.tsx:221-231).
- **4.11** Deleting your own task 403s (DELETE admin/manager-only) (activities.controller.ts:337).
- **4.12** Breached lead can't be un-breached by working (sla-breach.service.ts:66).
- **4.13** *(narrowed)* Bulk/PUT complete bypass next-step gate, never stamp completed_at (activities.service.ts:1379,1644).
- **4.14** Global search dead on Leads page; bug-report form wipes on dismiss; qualification money forced to int; payment_term_id dropped on save; AddPaymentModal wipes mid-typing.

## Manager / reporting / duplicates
- **5.1** Compliance zero-denominator reps sort to top as "worst" (compliance-report.service.ts:206-211).
- **5.2** Dashboard headline ≠ its own table (unfiltered team KPI vs per-rep double-count) (activity-discipline.service.ts:471-483).
- **5.4** Duplicates queue renders bare IDs; attachRecordNames excludes soft-deleted; rows orphan (duplicate-detection.service.ts:527).
- **5.5** "Keep both" undone by Rebuild; mergeLeads omits LeadQualificationCriteria (duplicate-detection.service.ts:394-401).
- **5.7** Deal reassign is a no-op (client PUT {assigned_to} never read; PATCH /assignee has no caller) (deals.service.ts:582-617).
- **5.8** Resolving an escalation never touches the lead (no Lead repo injected) (lead-escalation.service.ts:25-29).
- **5.10** Product / Specific-Date dashboard filters 400 every widget (dashboard-filters.dto.ts:14-39; main.ts:70).
- **5.11** Discipline ignores Province, hardcodes Settings-owned thresholds (activity-discipline.service.ts:881).
- **5.12** *(narrowed)* Report export ≠ screen (PDF slices deals/items under full totals) (report-export.service.ts:317).
- **5.13** *(narrowed)* Auto-assign SLA/flow gaps (sendProposalToNewLeads omits SLA clear; "Approve all" no confirm) (lead-auto-router.service.ts:679).
- **5.13a** Auto-assign only reaches reps with a territory (lead-auto-router.service.ts:1282,1296).
- **5.14** Approval decisions notify nobody (no NotificationService in leads.service) (leads.service.ts:1391+).
- **5.15** Requisition rejection dead-end; own requests clog approvals inbox (cash-requisitions.service.ts:226,520-537).
- **5.16** *(narrowed)* Triage cannot clear component/resolution (client sends undefined, server guards !==undefined) (bug-reports-page.tsx:586-588).

## Settings
- **C6** Settings envelope not unwrapped (map nested at .data.data) (use-settings.ts:35-36; axios.ts:81-82).
- **6.3** `enforce_outcome_on_completion` dead (rejects without outcome unconditionally) (activities.service.ts:1360-1367).
- **6.4** Saved currency non-public (bulk save omits is_public; useCurrency falls back USD) (settings-page.tsx:215; settings.service.ts:71).
- **6.5** No server-side settings validation (SetSettingDto is an interface) (settings.service.ts:10).
- **6.6** `auto_assign_enabled` doesn't gate the manual run (lead-auto-router.service.ts:149-159).
- **6.7** No settings audit trail; Compliance POSTs all 21 keys → concurrent overwrite (settings.service.ts:104-134).
- **6.8** Soft-deleted setting key invisible forever (settings.service.ts:109-119).
- **6.9** General/Targets tabs largely decorative (payments.service.ts:357-378).
- **6.10** *(narrowed)* Client role mismatch hides auto-assign switch from admin_support; sales_manager can't reach tab (compliance-controls-content.tsx:1135).

## Delivery / integrations
- **7.1** PDFs render with no items/totals (items.forEach(async…) + unawaited drawTotals before doc.end()) (document-generator.service.ts:77,254-275). **Live ship-blocker.**
- **7.2** "Send" reports success while delivering nothing (status Sent before swallowed send) (invoices.service.ts:455-489).
- **7.3** Logging a completed email rolls back the whole activity (uncaught ForbiddenException in txn) (activities.service.ts:659-673).
- **7.4** Password-reset dead end reports success (notifications.service.ts:79-82; auth.service.ts:405-423).
- **7.5** Email-sequence one-strike dead letter, no retry (email-sequence.service.ts:158-162).
- **7.6** SLA escalation stamped even when no manager reached (sla-scheduler.service.ts:281-315).
- **7.7** Calendar integration unimplemented and hidden (google-calendar.adapter.ts:38-96).
- **7.8** Public bookings send the prospect nothing (scheduling.service.ts:462-640).
- **7.9** Failed WhatsApp send still advances the engagement clock (whatsapp-send.service.ts:93-96).
- **7.10** File upload has no authorization; guessable PDF overwrite; delete leaves blob (file-manager.controller.ts:58-71).
- **7.11** Ingest array uncapped; notification dedupe returns before fan-out starving new recipients (user-notifications.service.ts:102-121).

## RBAC / auth / session
- **8.1** Dual-role user loses owner scoping (jwt.strategy collapses roles[] to one) (jwt.strategy.ts:84-89).
- **8.2** Contacts/activities/schools reads ungated; PUT /contacts/:id no ownership check (contacts.controller.ts:46-72; roles.guard.ts:139-140).
- **8.3** Quote/invoice ownership guards fail open (return true on non-Forbidden) (can-access-invoice.guard.ts:39-44).
- **8.5** Seeded LeadActivity CASL conditions wrong and inert (seed-roles-permissions.ts:149-151).
- **9.1** Access tokens live 7 days (mitigated by per-request re-read). **9.2** Refresh never rotated; logout() dead. **9.3** Forced password change client-side only. **9.4** Provisioned passwords from Math.random(). **9.5** Rate limits keyed on attacker headers, trust-proxy off. **9.6** Wrong 2FA codes don't count to lockout; 32-bit backup codes unmetered. **9.7** TOTP secret plaintext (entity says "Encrypted"). **9.8** localhost:5173 CORS w/ credentials in prod. **9.9** *(narrowed)* email cipher key from JWT secret (warn not throw); dev-fallback-pepper; static API key = permanent admin. **9.10** resetPassword leaves stale state.

## Performance / resource / env
- **10.1** leads has ~no indexes; activities none on completed_at. **10.2** every authed request = 2 SELECT + 1 WRITE. **10.3** /dashboard/sla-compliance materialises all breached leads. **10.4** connection-pool fan-out (discipline 50×9q, compliance 200×6q, pool 10). **10.5** /schools primary-sorts on double-EXISTS subquery. **10.6** SLA crons unbounded/N+1/serial-SMTP, no overlap guard. **10.7** temperature ~6q/lead per activity; JS SUM; 47 static imports; CSV cap 1000.
- **11.1** user_notifications unindexed on isRead, no retention. **11.2** assignment-proposals unpaginated; where() discards soft-delete andWhere(). **11.3** 5s polls fetch 500 rows for an integer. **11.4** write-scan modelled as mount useQuery. **11.5** long-held txn across serial per-item loop + 15-relation findOne.
- **12.1** Pipeline summary all-or-nothing fallback. **12.2** Date windows in container UTC not Africa/Harare. **12.3** No 404 route (blank page). **12.4** Qualification counts from soft-deleted/orphan criteria. **12.5** *(narrowed)* stale sla_breached on terminal leads; mergeLeads bypasses transitionStatus. **§13** WS gateway authenticates only at connect; ComplianceSettingsService.invalidateCache() has no caller (30s TTL lag).

---

## Discarded (23 — do not action)
Ship-blockers **2.1** (assignLead clean) and **3.1** (allocation credits instalments);
**C2, 3.6, 3.17, 3.18**; rep bugs **4.1, 4.2, 4.3, 4.4** (date-presence not pastness;
nurture supplies next step); **4.7, 4.9** (FU3/FU4 shipped); 4.14 rep-dashboard /
PersonPicker-autocommit / rich-text-cap / cross-school-contact; **5.3**; **6.2**;
**8.4, 8.6** (roles present / admin_support permitted); §12.5 at-risk-bucket; 12.6.
