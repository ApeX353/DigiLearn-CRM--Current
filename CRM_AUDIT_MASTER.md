# CRM Audit Master Report

Generated: 2026-08-28 12:55:18 +02:00

This is the single reference document for the DigiLearn CRM audit. It consolidates the bug ledger, endpoint coverage, metric audit, improvement plan, and post-audit scan notes into one file so the product owner does not need to open multiple Markdown documents.

Source documents consolidated here:

- SYSTEM_AUDIT.md
- AUDIT_COVERAGE_V2.md
- METRIC_AUDIT.md
- WHAT_CAN_BE_IMPROVED.md
- POST_AUDIT_SCAN_RESULTS.md

## Fast Summary

Current audit counts:

| Severity | Count |
| --- | ---: |
| Critical | 4 |
| High | 20 |
| Medium | 18 |
| Low | 3 |
| Potential Risks | 14 |

Current verdict: NOT READY FOR PRODUCTION until the critical/high finance, authorization, and data-integrity issues in the ledger are repaired and regression-tested.

Most recent added lifecycle findings:

- BUG-042: duplicate payment retries create duplicate payment rows.
- BUG-043: paid or partially paid invoices can be cancelled, then payment edits/deletes resurrect them.
- BUG-044: deleting an invoice with payments succeeds and cascades away payment records.
- BUG-045: duplicate payment-entry approval requests become duplicate real payments.

## Plain-English Bug Summary

This section is written for non-technical review. It explains what each bug means operationally and what fixing it will achieve.

| Bug | Severity | Plain-language problem | What fixing it will do |
| --- | --- | --- | --- |
| BUG-001 | Medium | The local client startup script points to the wrong API port, so the app can appear broken even when the server is running. | Makes local testing and demos connect to the correct backend reliably. |
| BUG-002 | Critical | Bad lead status requests can damage SLA tracking before the server returns an error. | Protects lead timelines and SLA reports from being corrupted by invalid requests. |
| BUG-003 | High | The lead assignment endpoint crashes on valid assignment requests. | Lets managers assign/reassign leads without internal server errors. |
| BUG-004 | High | API-key users are represented as "system" instead of a real user ID, which breaks database writes. | Allows approved integrations/service calls to write records with valid audit ownership. |
| BUG-005 | High | Admin-created users can be given hidden temporary passwords that nobody receives. | Makes staff onboarding usable through proper invite/reset delivery. |
| BUG-006 | High | Deleting a file removes the CRM record but may leave the actual uploaded file behind in storage. | Prevents sensitive documents from remaining accessible or billable after deletion. |
| BUG-007 | Medium | The documented local admin credentials do not work against an existing local database. | Makes setup instructions trustworthy for QA and developers. |
| BUG-008 | Medium | The client lint check fails with many errors. | Restores a quality gate that catches frontend mistakes before release. |
| BUG-009 | Medium | The client ships a large main JavaScript bundle. | Improves load time and reduces performance risk for users on slower machines/connections. |
| BUG-010 | Medium | API documentation generation warns about duplicate DTO names and may break on future framework upgrades. | Keeps API docs/startup stable and easier to maintain. |
| BUG-011 | Medium | File upload failures can show raw provider/internal error messages. | Gives users safer, clearer errors without leaking system details. |
| BUG-012 | Low | User statistics count a role called staff that does not exist. | Makes admin user metrics accurate. |
| BUG-013 | Low | Server startup logs an unsupported wildcard-route warning. | Removes routing uncertainty and future framework breakage risk. |
| BUG-014 | Critical | The restored data already contains many broken SLA-history records. | Makes SLA dashboards, escalations, and aging reports trustworthy again. |
| BUG-015 | Medium | Quote and invoice status endpoints return server errors for invalid statuses instead of clean validation errors. | Prevents noisy 500s and gives users/API clients clear feedback. |
| BUG-016 | Medium | Updating a user with no roles silently leaves their old roles in place. | Prevents admins from thinking they removed access when they did not. |
| BUG-017 | Critical | Existing payments can be edited above the invoice total, creating overpaid invoices. | Protects accounting totals and stops finance data from being inflated. |
| BUG-018 | High | Payments can be recorded against Draft invoices and change their lifecycle unexpectedly. | Ensures only proper issued/payable invoices can receive payments. |
| BUG-019 | High | Scheduled jobs run automatically in local/dev and process restored production-like data. | Prevents accidental notifications/SLA mutations during local audits or demos. |
| BUG-020 | High | A public calendar webhook can trigger sync work without implemented signature validation. | Prevents unauthenticated public requests from triggering expensive or risky sync operations. |
| BUG-021 | High | Calendar/video integrations are shown as usable, but backend adapters are still stubs. | Stops users from relying on integrations that cannot actually complete the workflow. |
| BUG-022 | High | Email template preview renders stored HTML without sanitizing it. | Reduces stored-XSS risk from malicious or unsafe template content. |
| BUG-023 | High | Some payment summary fields do not match their allocation rows in restored data. | Makes payment allocation, installment, and reporting totals reconcile correctly. |
| BUG-024 | Medium | Scheduling availability ignores the configured timezone. | Prevents bookings from appearing at the wrong local times. |
| BUG-025 | Medium | Notification filtering uses the wrong field name. | Makes notification lists/filtering return the records users expect. |
| BUG-026 | Medium | Duplicate contact emails and phone numbers exist in restored data. | Reduces duplicate outreach, confusion, and dirty CRM records. |
| BUG-027 | Low | Some invoices show updated timestamps earlier than their created timestamps. | Improves audit/history accuracy and prevents confusing record timelines. |
| BUG-028 | High | Applying payment terms concurrently can create duplicate schedules/child invoices. | Prevents duplicate installment plans and duplicate finance documents. |
| BUG-029 | High | Dashboard aggregate endpoints are available to roles that should not see all-company metrics. | Protects management/finance visibility and aligns dashboard access with report permissions. |
| BUG-030 | Medium | Notification preferences accept invalid event/channel/severity values. | Keeps notification settings clean and prevents unsupported preference states. |
| BUG-031 | Medium | Discipline dashboard metrics still depend on fragile text matching for demos/proposals. | Makes activity metrics consistent and less sensitive to wording differences. |
| BUG-032 | High | Public export contains helper scripts with fixed credentials and direct database mutation paths. | Reduces security and operational risk before sharing code externally. |
| BUG-033 | High | Dependency audits report critical/high vulnerabilities in both apps. | Reduces known supply-chain/security exposure. |
| BUG-034 | High | Sales reps can attach file metadata to arbitrary CRM records without checking access to the parent record. | Prevents users from linking files to records they should not control. |
| BUG-035 | High | Operators can create cash requisitions against arbitrary leads/deals without ownership checks. | Prevents spend requests from being attached to the wrong customer/opportunity. |
| BUG-036 | Medium | Reports UI shows finance/export actions to roles that the API rejects. | Prevents confusing dead-end buttons and failed report actions. |
| BUG-037 | Medium | Dashboard Specific Date filter sends fields the backend ignores, so it shows month-to-date instead of one-day numbers. | Makes date-filtered dashboard numbers match the selected day. |
| BUG-038 | Medium | Dashboard Product filter is visible but not applied by backend metrics. | Stops the UI from pretending metrics are product-filtered when they are not. |
| BUG-039 | Medium | Demo dashboard metrics miss historical demo activity after moving to structured activity types. | Makes demo counts match real historical work or clearly labels the limitation. |
| BUG-040 | High | Sales Performance undercounts cash collected because it reads invoice paid summaries instead of the payment ledger. | Makes cash-collected reports agree with actual payments received. |
| BUG-041 | Medium | Multi-role sales manager/rep users see inconsistent self/team dashboard numbers. | Gives multi-role users one consistent dashboard/report view. |
| BUG-042 | High | Submitting the same direct payment twice creates duplicate payment rows. | Prevents double-clicks/retries from inflating collections. |
| BUG-043 | High | Paid or partially paid invoices can be cancelled, then payment edits can bring them back as paid/partial. | Makes cancellation a controlled state and stops cancelled invoices from re-entering revenue. |
| BUG-044 | Critical | Deleting an invoice with payments deletes the payment records too. | Preserves financial history and prevents accounting evidence from being erased. |
| BUG-045 | High | Duplicate payment-entry requests can both be approved into real payments. | Prevents approval-queue retries from becoming duplicate collections. |

## Reading Order

1. Start with SYSTEM_AUDIT.md content for the bug ledger and production-readiness position.
2. Use AUDIT_COVERAGE_V2.md content for endpoint, route, entity, scheduler, integration, and coverage inventory.
3. Use METRIC_AUDIT.md content for Mr Dube's visual/dashboard metric concerns.
4. Use WHAT_CAN_BE_IMPROVED.md content for repair order and efficiency recommendations.
5. Use POST_AUDIT_SCAN_RESULTS.md content for backup/public-export/dependency follow-up checks.

---

---

# Consolidated Source: SYSTEM_AUDIT.md

# System Audit

Audit date: 2026-08-26

Scope: DigiLearn CRM repository at `C:\Users\8Y14\Desktop\crm code`.

## System Map

- `crm-v2-server`: NestJS API mounted at `/api/v2`, TypeORM/PostgreSQL, global API-key/JWT/RBAC guards.
- `crm-v2-client`: React 19/Vite CRM frontend.
- `db-ops`: operational SQL repair scripts; not migrations.
- Local launchers: `start-local-postgres.ps1`, `start-local-server.ps1`, `start-local-client.ps1`.

## Applications / Modules

- Server modules identified: auth, users, RBAC, activity logs, leads, schools, contacts, settings, deals, products, quotes, invoices, payments, payment terms, activities, dashboard, file manager, SLA, reports, email sequences, audit, user email, calendar sync, scheduling, video integrations, automation, cash requisitions, campaigns, bug reports, notifications.
- Client route groups identified: public auth/reset/booking, dashboard, leads, schools, quotes, invoices, deals, payments, collections, pipeline, activities, reports, admin, profile integrations, scheduling links, requisitions, campaigns, management queues, bug reports.

## Roles / User Types Observed

- `admin`
- `admin_support`
- `sales_manager`
- `sales_rep`
- `manager`
- `finance`

The implementation is multi-role at the data/JWT layer (`user.roles[]`), but several controller/service paths still derive or check one representative role.

## Major Workflows Identified

- Authentication: login, logout, refresh, password reset, password change, 2FA setup/verify/disable.
- CRM records: leads, schools, contacts, activities, deals, quotes, invoices, payments.
- Management/control: lead assignment proposals, reversals, escalations, duplicate queues, payment entry approvals, requisitions.
- Admin: users, roles/permissions, settings, products, finance plans, email templates/sequences, compliance reports.
- Integrations: file uploads, user email, calendar sync, video integrations, public scheduling links.

## Trust Boundaries

- Browser-to-API boundary via JWT bearer tokens and refresh cookie.
- Optional `x-api-key` service account boundary.
- Server-side role checks through `@Roles`, `@Permissions`, CASL abilities, and several resource-specific guards.
- Database constraints and transactions for enforcing uniqueness, ownership, workflow state, and referential integrity.
- Third-party boundaries: Vercel Blob, SMTP/email, WhatsApp, Google/Microsoft calendar, Zoom/video integrations.

## Coverage Matrix

| Area | Tested | Result | Notes |
| ---- | ------ | ------ | ----- |
| Repository/docs map | Partial | Issues found | Two-app CRM mapped; launcher inconsistency confirmed. |
| Authentication | Partial | Issues found | Login/invalid login/logout statically reviewed; bearer token rejected after logout; disabled user login rejected; API-key service principal bug confirmed. Browser back-button/cookie refresh testing blocked by unavailable browser. |
| Authorization | Partial | Issues found | Lead owner restrictions confirmed for reps; assignment/status endpoints have serious server-side failures. |
| Roles | Partial | Issues found | Multi-role model identified; user role update edge cases flagged. |
| Multi-role behaviour | Partial | Issues found | Multi-role account could call rep/manager APIs; route/context UI testing blocked by unavailable browser. |
| Tenant isolation | Partial | In progress | Product appears global CRM rather than explicit multi-school tenancy; record ownership still high-risk. Rep-to-rep lead read blocked as expected. |
| Database integrity | Partial | Critical issue found | Lead status endpoint can leave SLA history inconsistent after malformed input. Backup schema inspected. |
| APIs | Partial | Issues found | Runtime probes covered auth, users, leads, dashboard, schools, pipelines, payments, collections, bug reports. |
| Navigation | Partial | In progress | Route map inspected. |
| Forms | Partial | Issues found | API-level malformed form payloads tested on lead create/status/assign. Browser form testing blocked. |
| Business logic | Partial | Issues found | Lead assignment/status workflow defects reproduced; payment overpayment and Draft-invoice payment lifecycle bugs reproduced; requisition approval code reviewed. |
| Error handling | Partial | Issues found | Several malformed requests return 500 and/or partially mutate data; scheduler notification failures generated repeated log noise. |
| UI | Partial | Issues found | Static route/navigation/build/lint review completed; visual browser testing blocked. |
| Responsive design | Not tested | Blocked | In-app browser unavailable in this session. |
| Theme handling | Not tested | Blocked | In-app browser unavailable in this session. |
| Security | Partial | Issues found | API-key boundary bug, raw blob upload errors, local secret/data hygiene risks identified. |
| Performance | Partial | Issues found | Client build emits large single-bundle warning. |
| Local setup/build/test | Partial | Issues found | Server tests/build passed; client build passed with bundle warning; client lint failed; local launchers inconsistent. |

## Summary

| Severity | Count |
| -------- | ----: |
| Critical | 4 |
| High | 20 |
| Medium | 18 |
| Low | 3 |
| Potential Risks | 14 |

## Critical

### BUG-002 - Invalid lead status requests corrupt SLA history before returning 500

Severity: Critical

Status: Confirmed

Area: API / Database Integrity / Business Logic / Error Handling

Description:
`PATCH /api/v2/leads/:id/status` accepts a primitive `status` body value with no DTO enum validation. Missing, numeric, or unknown status values reach `LeadsService.transitionStatus`. The service closes the current open `lead_sla_history` row before attempting to create the replacement row, and the operation is not wrapped in one transaction. When the replacement insert fails, the lead status remains unchanged but its SLA history has already been mutated.

Reproduction Steps:
1. Log in as a sales manager.
2. Create a lead successfully.
3. Send `PATCH /api/v2/leads/{leadId}/status` with `{}`.
4. Observe the API returns HTTP 500.
5. Query the database for the lead and `lead_sla_history` rows.

Expected Behaviour:
The API should reject malformed status payloads with HTTP 400 before any database mutation. Invalid status changes should leave the lead and SLA history untouched.

Actual Behaviour:
The API returns HTTP 500 and leaves the lead in `New` while the previously active SLA history row is marked exited, leaving no open SLA history row for the current status.

Evidence:
- Runtime API probes with `{ "status": "DefinitelyInvalid" }`, `{}`, and `{ "status": 123 }` all returned HTTP 500.
- Server logs showed enum/not-null database failures while processing the status update.
- Database verification for lead `00dfee6a-9fbd-44bd-851c-fdc054b78a9a` showed `leads.status = New`, while the only `lead_sla_history` row for that lead had `status = New` and `exited_status_at` populated.
- Code path: `crm-v2-server/src/leads/leads.controller.ts:542` receives `@Body('status') status: string`; `crm-v2-server/src/leads/leads.service.ts:2119` calls `transitionStatus`; `crm-v2-server/src/leads/leads.service.ts:2157` mutates SLA history and lead state without enclosing the whole transition in one transaction.

Impact:
Malformed client requests, stale browser tabs, bad integrations, or malicious authorized users can corrupt SLA tracking. This can break escalation, aging, reporting, and operational follow-up without changing the visible lead status.

Suspected Root Cause:
Validation is missing at the controller boundary, and lead/SLA status transition writes are split across multiple saves without transactional rollback.

Relevant Files:
- `crm-v2-server/src/leads/leads.controller.ts`
- `crm-v2-server/src/leads/leads.service.ts`

Recommended Fix:
Add a `UpdateLeadStatusDto` with `@IsEnum`/`@IsNotEmpty`; reject invalid status before service calls. Wrap the full status transition, SLA history close, SLA history create, and lead save in a single database transaction. Ensure failed transitions do not change history rows.

Regression Test:
Add e2e/API tests for missing, numeric, and unknown status payloads asserting HTTP 400 and asserting no changes to `leads` or `lead_sla_history`.

### BUG-014 - Restored production-like data already contains widespread SLA-history inconsistencies

Severity: Critical

Status: Confirmed

Area: Database Integrity / Leads / SLA / Reporting

Description:
The local/restored CRM database has active leads whose SLA history does not contain exactly one open row. A healthy lead lifecycle should have one current SLA-history record with `exited_status_at IS NULL`.

Reproduction Steps:
1. Start the local PostgreSQL database.
2. Run a read-only integrity query comparing active leads to open `lead_sla_history` rows.
3. Sample affected rows.

Expected Behaviour:
Every active lead should have exactly one open SLA-history row for its current status, or the schema/application should define another explicit invariant.

Actual Behaviour:
1,109 active leads have no open SLA row, and 97 leads have multiple open SLA rows.

Evidence:
- Read-only query result: `active_leads_without_open_sla = 1109`.
- Read-only query result: `leads_with_multiple_open_sla = 97`.
- Sample affected leads include multiple current `Contacted`/`Nurture` leads with two open SLA rows.
- `lead_sla_history` has indexes on `lead_id`, `status`, and `escalated`, but no partial unique constraint enforcing one open row per lead.

Impact:
SLA dashboards, breach alerts, escalation jobs, reports, and operational prioritization can be wrong at production-like scale. The confirmed status endpoint bug can create more of this corruption.

Suspected Root Cause:
SLA status transitions have historically not been fully transactional or constraint-backed, and repair/backfill operations may have left mixed states.

Relevant Files:
- `crm-v2-server/src/leads/entities/lead-sla-history.entity.ts`
- `crm-v2-server/src/leads/leads.service.ts`
- `db-backup/digilearn_crm-prod-20260820.sql`

Recommended Fix:
First write a read-only reconciliation report, then a reviewed repair script that reconstructs exactly one current SLA row per active lead. Add a partial unique index such as one open SLA row per lead after cleanup. Deploy service-level transaction fixes before running new SLA automation.

Regression Test:
Add a database integrity test/query to CI or release checks that fails when any active lead has zero or more than one open SLA-history row.

### BUG-017 - Existing payments can be edited above invoice total and overpay invoices

Severity: Critical

Status: Confirmed

Area: Payments / Finance / Data Integrity / Business Logic

Description:
Payment creation validates the amount against invoice outstanding balance, but payment update does not re-apply that invariant. An admin or sales manager can create a small valid payment, then update it above the invoice total. The invoice recalculation accepts the overpayment and stores `amount_paid` greater than `total`.

Reproduction Steps:
1. Log in as a sales manager.
2. Create a payment of `1.00` against invoice `INV-2026-0075` whose total is `15600.00`.
3. Update that payment to `20000.00` with `PUT /api/v2/payments/{paymentId}`.
4. Query the invoice totals.
5. Delete the audit payment and restore the local invoice status.

Expected Behaviour:
Payment update should reject amounts that would make invoice payments exceed the invoice's outstanding balance, accounting for the payment's previous amount.

Actual Behaviour:
The update succeeds. The invoice becomes `Paid` with `amount_paid = 20000.00` while `total = 15600.00`.

Evidence:
- Runtime probe created payment `9f84477e-9bf0-499f-8486-169c22a8c411` for `1.00`.
- `PUT /payments/9f84477e-9bf0-499f-8486-169c22a8c411` with `amount = 20000.00` returned 200.
- Database verification during the probe: `INV-2026-0075 | total 15600.00 | amount_paid 20000.00 | status Paid`.
- Cleanup deleted the audit payment and restored `INV-2026-0075` to `Draft` with `amount_paid = 0.00`.
- Code path: `crm-v2-server/src/payments/payments.service.ts:411` saves updated payment before recalculating invoice payment state and does not call `assertPaymentAmount` for the adjusted available amount.

Impact:
Finance users can accidentally or intentionally corrupt collections data, invoice payment status, revenue reporting, and downstream installment allocation. This is a serious production accounting risk.

Suspected Root Cause:
The create path and update path implement different business rules. The update path validates DTO shape but not payment/invoice invariants.

Relevant Files:
- `crm-v2-server/src/payments/payments.service.ts`
- `crm-v2-server/src/payments/dto/update-payment.dto.ts`
- `crm-v2-server/src/invoices/invoices.service.ts`

Recommended Fix:
When updating amount, lock the invoice and calculate available amount as current outstanding plus the payment's old amount. Reject updates above that adjusted balance in the same transaction that updates allocations and invoice state.

Regression Test:
Add payment update tests for increasing within balance, increasing beyond balance, reducing amount, and concurrent edits against the same invoice.

### BUG-044 - Deleting an invoice with payments deletes the payment records

Severity: Critical

Status: Confirmed

Area: Invoices / Payments / Finance / Data Integrity

Description:
`DELETE /api/v2/invoices/:id` allows an admin or sales manager to delete an invoice even when payments are recorded against it. Because `Payment.invoice` is configured with `onDelete: 'CASCADE'`, the payment rows are deleted with the invoice. This erases financial evidence instead of requiring reversal, credit note, cancellation workflow, or protected archival.

Reproduction Steps:
1. Start the local API against the restored backup DB.
2. Create an audit invoice for `50.00`.
3. Record a `20.00` payment against that invoice.
4. Call `DELETE /api/v2/invoices/{invoiceId}`.
5. Query the invoice and payments tables for that invoice id.

Expected Behaviour:
An invoice with payments should not be hard-deleted. The API should reject deletion or require a controlled void/reversal workflow that preserves the original invoice, payments, audit trail, and accounting history.

Actual Behaviour:
The delete request returns HTTP 200. The invoice disappears, and the related payment row also disappears.

Evidence:
- Finance lifecycle probe tag: `FIN-LIFE-20260827142715`.
- Created invoice `bafa1e7c-3467-4315-925b-41be25dd40fa` / `INV-2026-0079`, total `50.00`.
- Recorded payment `7a59eae3-12a2-4fa9-84d9-3ef522a18363`, amount `20.00`.
- `DELETE /api/v2/invoices/bafa1e7c-3467-4315-925b-41be25dd40fa` returned HTTP 200 with `Invoice deleted successfully`.
- Direct DB snapshot after deletion: `invoice: null`, `payments: []`, `allocations: []`.
- Code path: `crm-v2-server/src/invoices/invoices.controller.ts:174`; `crm-v2-server/src/invoices/invoices.service.ts:590`, `:593`, `:598`; cascade relation at `crm-v2-server/src/payments/entities/payment.entity.ts:64`.

Impact:
Finance history can be erased by deleting an invoice. Reports, collections, audit trails, reconciliation, and customer payment evidence can become wrong or incomplete. This is a serious accounting and compliance risk.

Suspected Root Cause:
Invoice deletion is implemented as hard delete plus cascading payment relation, with no business guard for existing payments or accounting immutability.

Relevant Files:
- `crm-v2-server/src/invoices/invoices.controller.ts`
- `crm-v2-server/src/invoices/invoices.service.ts`
- `crm-v2-server/src/payments/entities/payment.entity.ts`

Recommended Fix:
Block deletion for invoices with any payment, payment allocation, child invoice, or audit-relevant finance record. Replace hard delete with explicit void/cancel/reversal workflows and preserve immutable financial events.

Regression Test:
Add an API test that creates an invoice, records a payment, attempts invoice deletion, expects 409/400, and verifies the invoice and payment rows still exist.

## High

### BUG-003 - Lead assignment endpoint always crashes on valid requests

Severity: High

Status: Confirmed

Area: API / Leads / Business Logic

Description:
`PATCH /api/v2/leads/:id/assign` references a `status` variable that is not in scope. Valid assignment requests throw `ReferenceError` before reaching the assignment service.

Reproduction Steps:
1. Log in as a sales manager.
2. Create or choose a lead.
3. Send `PATCH /api/v2/leads/{leadId}/assign` with an `assigned_to` user id.
4. Observe HTTP 500.

Expected Behaviour:
The endpoint should assign the lead, return the updated lead, or return a clear validation/authorization error.

Actual Behaviour:
The endpoint returns HTTP 500.

Evidence:
- Runtime probe against lead `00dfee6a-9fbd-44bd-851c-fdc054b78a9a` returned 500.
- Server log: `ReferenceError: status is not defined` at `crm-v2-server/src/leads/leads.controller.ts:577`.

Impact:
Managers cannot use the direct lead assignment workflow. This blocks queue balancing and reassignment operations, and clients receive an internal-server error rather than an actionable response.

Suspected Root Cause:
A disqualification guard was copied into the assignment controller method but references a status variable that only exists in the status endpoint.

Relevant Files:
- `crm-v2-server/src/leads/leads.controller.ts`
- `crm-v2-server/src/leads/leads-assignment.spec.ts`

Recommended Fix:
Remove the out-of-scope status check from `assignLead`, or replace it with an explicit state check loaded from the target lead if assignment should be blocked for disqualified leads.

Regression Test:
Add a controller/e2e test that calls `PATCH /leads/:id/assign` as a sales manager and asserts a successful assignment for valid input.

### BUG-004 - API-key service account cannot create records that store actor UUIDs

Severity: High

Status: Confirmed

Area: API Key Auth / Integrations / Database

Description:
`ApiKeyGuard` authenticates valid API-key requests as a synthetic user with `id = "system"`. Endpoints that persist `@CurrentUser('id')` into UUID columns fail at the database layer because `"system"` is not a UUID.

Reproduction Steps:
1. Start the local API with a valid local API key.
2. Send `POST /api/v2/bug-reports` with `x-api-key` and a valid bug report body.
3. Observe HTTP 500.

Expected Behaviour:
API-key requests should either be limited to endpoints designed for service accounts or should use a real persisted service principal id compatible with database foreign keys.

Actual Behaviour:
The server accepts the API key, then crashes when a service tries to save `"system"` into a UUID actor column.

Evidence:
- Runtime `POST /api/v2/bug-reports` with a valid API key returned HTTP 500.
- Server log: `QueryFailedError: invalid input syntax for type uuid: "system"` while inserting `reported_by_id`.
- `crm-v2-server/src/auth/guards/api-key.guard.ts` sets `request.user.id = 'system'`.

Impact:
Service integrations can fail for write endpoints after passing authentication. Depending on which endpoints accept API-key auth, this can break automation, MCP-style integrations, audit attribution, and background service actions.

Suspected Root Cause:
The API-key principal is modeled as an ad hoc string rather than a first-class user/service-principal record.

Relevant Files:
- `crm-v2-server/src/auth/guards/api-key.guard.ts`
- `crm-v2-server/src/bug-reports/bug-reports.service.ts`

Recommended Fix:
Use a real UUID-backed service user, add a service-principal table, or restrict API-key auth to endpoints that never persist a user id. Add explicit actor type handling in audit/activity tables where service actions are valid.

Regression Test:
Add integration tests that exercise representative API-key write endpoints and assert successful persistence with valid actor attribution.

### BUG-005 - Admin-created users without passwords are given undisclosed temporary passwords

Severity: High

Status: Confirmed

Area: User Management / Onboarding / Authentication

Description:
`UsersService.create` generates a random temporary password when `password` is omitted, then registers the user with `requirePasswordChange`. The temporary password is not returned to the admin and no invite/reset email is sent. A code comment explicitly notes that a password email still needs to be implemented.

Reproduction Steps:
1. As an admin, create a user without specifying `password`.
2. Attempt to onboard the user.
3. There is no visible code path that communicates the generated temporary password or a one-time invite link.

Expected Behaviour:
Admin-created users should receive a secure invite/password-reset flow, or the API should require an explicit password and communicate how it will be delivered.

Actual Behaviour:
The server generates a password internally and discards the only plaintext copy.

Evidence:
- `crm-v2-server/src/users/users.service.ts:112` passes `createUserDto.password || this.generateTemporaryPassword()` to registration.
- `crm-v2-server/src/users/users.service.ts:142` generates the temporary password.
- `crm-v2-server/src/users/users.service.ts` contains the note: `i want another email with password and email to be sent here if no password is provided`.

Impact:
New staff accounts can be created in a state where the user cannot log in, creating onboarding failures and admin support burden. Workarounds may encourage insecure password sharing.

Suspected Root Cause:
User creation and invitation/password-reset delivery were not implemented as one atomic onboarding workflow.

Relevant Files:
- `crm-v2-server/src/users/users.service.ts`
- `crm-v2-server/src/users/users.controller.ts`

Recommended Fix:
Replace temporary plaintext passwords with one-time invite/reset tokens sent through the configured email channel. Store only the hash and token metadata. Surface delivery status to the admin.

Regression Test:
Add a user-management test that creates a user without a password and asserts an invite/reset token is generated and queued/sent.

### BUG-006 - File deletion removes metadata but leaves uploaded blobs behind

Severity: High

Status: High Confidence

Area: File Manager / Data Retention / Privacy / Storage

Description:
The file delete flow removes only the `ManagedFile` database row. It does not delete the underlying object from Vercel Blob or any other provider storage. The controller comment also notes this missing behavior.

Reproduction Steps:
1. Upload a file through the file manager.
2. Delete it through `DELETE /api/v2/files/:id`.
3. Inspect blob storage for the object URL.

Expected Behaviour:
Deleting a file should delete or quarantine the underlying blob according to the retention policy, then remove or mark the metadata row.

Actual Behaviour:
Only the CRM metadata row is deleted.

Evidence:
- `crm-v2-server/src/file-manager/file-manager.service.ts:236` calls `fileRepo.remove(file)` and logs deletion.
- No provider delete call is made.
- `crm-v2-server/src/file-manager/file-manager.controller.ts` contains a TODO to delete the file on Vercel Blob storage.

Impact:
Sensitive customer documents can remain accessible or billable after users believe they were deleted. This is a privacy, compliance, and storage-cost risk.

Suspected Root Cause:
The metadata CRUD service was implemented before provider lifecycle management.

Relevant Files:
- `crm-v2-server/src/file-manager/file-manager.service.ts`
- `crm-v2-server/src/file-manager/file-manager.controller.ts`

Recommended Fix:
Add provider-specific deletion using the stored blob pathname/url, handle provider failure explicitly, and decide whether metadata deletion should be transactional, soft-deleted, or retried via a job.

Regression Test:
Mock the blob provider and assert `DELETE /files/:id` calls provider delete before finalizing metadata removal. Add a failure-path test that does not falsely report success when provider deletion fails.

### BUG-018 - Payments can be recorded against Draft invoices and change their lifecycle state

Severity: High

Status: Confirmed

Area: Payments / Invoices / Business Logic

Description:
The payment service allows payments against invoices in `Draft` status. During the audit probe, a payment against a Draft invoice was accepted. When the audit payment was later deleted, invoice recalculation changed the invoice from `Draft` to `Sent`.

Reproduction Steps:
1. Select a Draft invoice with no payments.
2. Log in as a sales manager.
3. Create a payment against that invoice.
4. Delete that payment.
5. Query the invoice status.

Expected Behaviour:
Draft invoices should not accept payments until issued/sent/accepted according to the invoice lifecycle. If the business intentionally allows prepayments, status changes should be explicit and consistent.

Actual Behaviour:
The payment is accepted against a Draft invoice. Deleting the payment recalculates the invoice to `Sent`, not back to its original `Draft` state.

Evidence:
- `INV-2026-0075` was `Draft`, total `15600.00`, amount paid `0.00`.
- `POST /api/v2/payments` accepted a payment against the Draft invoice.
- After deleting the audit payment, database verification showed `status = Sent` until explicitly restored to `Draft`.
- `crm-v2-server/src/payments/payments.service.ts:270` only rejects summary and cancelled invoices in `lockPayableInvoice`.
- `crm-v2-server/src/payments/payments.service.ts:362` changes zero-paid invoices with derived statuses to `Sent`.

Impact:
Users can collect against invoices that were never issued, and cleanup/reversal can silently advance invoice lifecycle state. This can create customer-facing and accounting confusion.

Suspected Root Cause:
Payment eligibility checks only exclude cancelled/summary invoices and do not encode the invoice lifecycle.

Relevant Files:
- `crm-v2-server/src/payments/payments.service.ts`
- `crm-v2-server/src/invoices/invoices.service.ts`

Recommended Fix:
Define payable invoice statuses explicitly and reject payments for Draft/Cancelled/voided states. Preserve pre-payment status if deletion/recalculation removes all payments, or store lifecycle status separately from derived payment status.

Regression Test:
Add tests proving Draft invoices reject direct payments and payment-entry requests, and that deleting the last payment restores or preserves the correct lifecycle state.

### BUG-019 - Scheduled jobs run automatically in local/dev startup and process restored production data

Severity: High

Status: Confirmed

Area: Background Jobs / Operations / Data Safety / Notifications

Description:
While the local audit server was running against the restored CRM data, scheduled SLA/email jobs fired automatically. The SLA scheduler attempted notification work with no email provider configured and reported a large escalation sweep.

Reproduction Steps:
1. Start the local API against the restored database.
2. Leave it running until the hourly scheduler fires.
3. Inspect server logs.

Expected Behaviour:
Local/dev startup against restored production data should not silently run mutating operational jobs or attempt outbound notifications unless explicitly enabled for that environment.

Actual Behaviour:
The scheduler ran automatically, logged repeated `No email provider available` errors, and reported `Escalation check complete: 1264 leads escalated`.

Evidence:
- Runtime logs at 13:00 on 2026-08-26 showed SLA breach, escalation, deal stage SLA, and email sequence schedulers running.
- Logs repeatedly emitted `[NotificationsService] No email provider available`.
- Final scheduler log reported `Escalation check complete: 1264 leads escalated`.

Impact:
Developers or QA restoring production-like data can unintentionally mutate records, trigger notifications if providers are configured, and flood logs. This raises the risk of accidental data changes or customer contact from non-production environments.

Suspected Root Cause:
Cron jobs are registered unconditionally and are not gated by an explicit environment flag such as `ENABLE_SCHEDULERS=true`.

Relevant Files:
- `crm-v2-server/src/sla/sla-scheduler.service.ts`
- `crm-v2-server/src/email-sequences/email-sequence-scheduler.service.ts`
- `crm-v2-server/src/app.module.ts`

Recommended Fix:
Gate all mutating/outbound schedulers behind explicit environment flags. Default them off in local/dev and for restored database audits. Add a dry-run mode for SLA/report sweeps.

Regression Test:
Add a bootstrap/config test asserting schedulers are disabled unless explicitly enabled, and an integration test proving scheduler services do not run in local/test configuration.

## Medium

### BUG-001 - Local client launcher points at the wrong API port

Severity: Medium

Status: Confirmed

Area: Local Setup / Configuration / Runtime Connectivity

Description:
The documented and server-launcher API port is `3001`, but `start-local-client.ps1` sets `VITE_PUBLIC_API_URL=http://localhost:3000/api/v2`. A developer using the provided launchers starts a client that sends all API traffic to the wrong port.

Reproduction Steps:
1. Inspect `start-local-server.ps1`; it sets `PORT=3001`.
2. Inspect `README.md`; it instructs `VITE_PUBLIC_API_URL=http://localhost:3001/api/v2`.
3. Inspect `start-local-client.ps1`; it sets `VITE_PUBLIC_API_URL=http://localhost:3000/api/v2`.
4. Start the app with the provided launchers; the client will target port `3000` while the API listens on `3001`.

Expected Behaviour:
The local client launcher should use the same API base URL as the local server launcher and README.

Actual Behaviour:
The launcher configures the wrong API URL.

Evidence:
`start-local-server.ps1` sets `$env:PORT = "3001"`.
`README.md` documents `VITE_PUBLIC_API_URL=http://localhost:3001/api/v2`.
`start-local-client.ps1` sets `$env:VITE_PUBLIC_API_URL = "http://localhost:3000/api/v2"`.

Impact:
Local QA and developer testing can fail at login/API calls, creating false negatives or encouraging ad hoc environment changes that drift from documentation.

Suspected Root Cause:
The launcher retained an older API port after the server default was changed to `3001`.

Relevant Files:
- `start-local-client.ps1`
- `start-local-server.ps1`
- `README.md`

Recommended Fix:
Change `start-local-client.ps1` to `http://localhost:3001/api/v2`, or derive it from one shared local env file used by both launchers.

Regression Test:
Add a lightweight script or test that asserts documented local API URL, server launcher `PORT`, and client launcher `VITE_PUBLIC_API_URL` remain consistent.

### BUG-007 - Local bootstrap credentials documented by launcher fail against an existing local database

Severity: Medium

Status: Confirmed

Area: Local Setup / Authentication / QA Reliability

Description:
The local server launcher prints bootstrap credentials for `admin@digilearn.local`, but the server skips bootstrap creation if any admin already exists. In the restored/current local database, an existing admin is present, so the printed bootstrap credentials do not work.

Reproduction Steps:
1. Start local Postgres with the supplied local scripts/database.
2. Start `start-local-server.ps1`.
3. Attempt to log in with the launcher-provided local admin credentials.

Expected Behaviour:
Printed local credentials should work, or the launcher should clearly report the actual seeded admin account and not present unusable credentials.

Actual Behaviour:
The server logs that an existing admin was found and skips bootstrap creation. Login with the advertised local admin account returns HTTP 401.

Evidence:
- Server startup log: bootstrap admin skipped because an existing admin user exists.
- Runtime login with the advertised bootstrap account returned 401.

Impact:
Developers and QA can be blocked before reaching the application, especially after restoring a database backup.

Suspected Root Cause:
Bootstrap logic and launcher messaging assume an empty database.

Relevant Files:
- `start-local-server.ps1`
- `crm-v2-server/src/app.module.ts`
- `crm-v2-server/src/users/users.service.ts`

Recommended Fix:
Have the launcher query/report valid local demo accounts, or make bootstrap idempotent for the documented local account in development only.

Regression Test:
Add a local bootstrap smoke test that starts from both empty and pre-seeded databases and verifies advertised credentials.

### BUG-008 - Client lint currently fails with 167 errors

Severity: Medium

Status: Confirmed

Area: Frontend / Code Quality / Release Gate

Description:
`npm run lint` in `crm-v2-client` fails with 225 total problems, including React hooks compiler rules, state-in-effect violations, mutation warnings, and many explicit `any` usages.

Reproduction Steps:
1. Run `npm run lint` in `crm-v2-client`.
2. Observe non-zero exit.

Expected Behaviour:
Lint should pass in a production-ready branch, or failures should be explicitly waived with narrow suppressions.

Actual Behaviour:
Lint exits with 167 errors and 58 warnings.

Evidence:
- Command output: `✖ 225 problems (167 errors, 58 warnings)`.
- Examples include `react-hooks/static-components`, `react-hooks/purity`, `react-hooks/set-state-in-effect`, and `@typescript-eslint/no-explicit-any`.

Impact:
Real React state and rendering bugs may be hidden in noise, and CI cannot rely on lint as a release gate.

Suspected Root Cause:
React 19/compiler lint rules were enabled before the codebase was remediated, or lint has not been enforced in CI.

Relevant Files:
- `crm-v2-client`
- `crm-v2-client/src/components/activities/activities-week-view.tsx`
- `crm-v2-client/src/components/activities/activity-composer.tsx`
- `crm-v2-client/src/pages/leads/leads-management-page.tsx`

Recommended Fix:
Triage compiler-rule violations first, then reduce `any` usage or apply targeted suppressions. Restore lint to a required release gate.

Regression Test:
Run client lint in CI and block merges on new errors.

### BUG-009 - Client ships an oversized main bundle

Severity: Medium

Status: Confirmed

Area: Frontend / Performance

Description:
The production client build emits a single large JavaScript asset. Rollup warns that chunks exceed the recommended size after minification.

Reproduction Steps:
1. Run `npm run build` in `crm-v2-client`.
2. Inspect the Vite/Rollup build output.

Expected Behaviour:
Production build should split route/module-heavy code into smaller chunks, especially for CRM areas not needed on initial load.

Actual Behaviour:
Build output includes `dist/assets/index-zpW9cV0G.js` at 2,830.37 kB minified and 766.28 kB gzip.

Evidence:
- Vite warning: `Some chunks are larger than 500 kB after minification`.
- Largest JS asset reported: `2,830.37 kB`.

Impact:
Slow first load, poor mobile/network performance, more expensive cache invalidation, and slower recovery after auth redirects.

Suspected Root Cause:
Routes and heavy dependencies are bundled into the main app entry without dynamic imports/manual chunks.

Relevant Files:
- `crm-v2-client/src/App.tsx`
- `crm-v2-client/vite.config.ts`

Recommended Fix:
Lazy-load protected route pages, split charts/editors/integration-heavy modules, and configure `manualChunks` where appropriate.

Regression Test:
Add bundle-size reporting or a size budget check in CI.

### BUG-010 - Duplicate Swagger DTO names produce runtime startup warnings and future breakage risk

Severity: Medium

Status: Confirmed

Area: API Docs / Startup Health / Maintainability

Description:
The server logs an OpenAPI schema warning/error because two different DTO classes are both named `CreateContactDto`.

Reproduction Steps:
1. Start `crm-v2-server`.
2. Watch startup logs.

Expected Behaviour:
Server startup should not emit API-schema collisions, and generated docs should represent each DTO unambiguously.

Actual Behaviour:
Startup logs report duplicate DTO schemas and warn this will throw in the next major version.

Evidence:
- Startup log: `Duplicate DTO detected: "CreateContactDto" is defined multiple times with different schemas`.
- Duplicate class locations: `crm-v2-server/src/leads/dto/create-lead-with-school-contacts.dto.ts` and `crm-v2-server/src/contacts/dto/create-contact.dto.ts`.

Impact:
OpenAPI docs may be wrong, client generation can be incorrect, and a framework/library upgrade can turn this into a hard startup failure.

Suspected Root Cause:
Nested lead-contact DTO reused the same class name as the standalone contacts DTO.

Relevant Files:
- `crm-v2-server/src/leads/dto/create-lead-with-school-contacts.dto.ts`
- `crm-v2-server/src/contacts/dto/create-contact.dto.ts`

Recommended Fix:
Rename the nested DTO to a unique class name or explicitly register models with unique schema names.

Regression Test:
Add an API-doc generation smoke test that fails on duplicate schema warnings.

### BUG-011 - File upload errors can expose raw provider/internal error messages

Severity: Medium

Status: High Confidence

Area: File Manager / Security / Error Handling

Description:
The upload endpoint catches provider/token-generation errors and returns `error.message` directly to clients.

Reproduction Steps:
1. Cause Vercel Blob upload token generation to fail, for example with missing/invalid blob configuration in a development environment.
2. Call the upload-token endpoint.
3. Observe the response body.

Expected Behaviour:
Clients should receive a generic, safe error message with a correlation id; detailed provider errors should stay in server logs.

Actual Behaviour:
The endpoint returns the raw exception message.

Evidence:
- `crm-v2-server/src/file-manager/file-manager.controller.ts` catches upload errors and responds with `{ error: error.message }`.

Impact:
Provider details, configuration names, internal paths, or unexpected exception text can leak to authenticated users.

Suspected Root Cause:
The endpoint bypasses Nest exception filters and manually serializes the thrown error.

Relevant Files:
- `crm-v2-server/src/file-manager/file-manager.controller.ts`

Recommended Fix:
Log full details server-side and return a fixed client-safe error object. Include a request/correlation id if available.

Regression Test:
Mock provider failure and assert the response does not include the underlying thrown message.

### BUG-015 - Quote and invoice status endpoints return 500 for invalid enum payloads

Severity: Medium

Status: Confirmed

Area: API / Validation / Error Handling

Description:
`PATCH /api/v2/quotes/:id/status` and `PATCH /api/v2/invoices/:id/status` accept raw `@Body('status')` values without DTO enum validation. Invalid status strings reach the persistence layer and return HTTP 500.

Reproduction Steps:
1. Log in as a sales manager.
2. Send `PATCH /api/v2/quotes/{quoteId}/status` with `{ "status": "DefinitelyInvalid" }`.
3. Send `PATCH /api/v2/invoices/{invoiceId}/status` with `{ "status": "DefinitelyInvalid" }`.

Expected Behaviour:
Both endpoints should return HTTP 400 with a clear validation message and no mutation.

Actual Behaviour:
Both endpoints return HTTP 500 `Internal server error`.

Evidence:
- Runtime probe against quote `74af5db0-ecbe-4bfe-a763-6e572a7c29f0` returned 500.
- Runtime probe against invoice `2e195ed5-79b5-47f4-8a7a-568400313c63` returned 500.
- Database verification showed both records remained `Draft`, so this is currently a validation/error-handling defect rather than confirmed data corruption.
- Code paths: `crm-v2-server/src/quotes/quotes.controller.ts:219` and `crm-v2-server/src/invoices/invoices.controller.ts:185`.

Impact:
Malformed clients and integrations see internal-server errors instead of actionable validation errors. Error rates and alerting can be polluted by user-correctable bad input.

Suspected Root Cause:
Primitive `@Body('status')` parameters bypass class-validator DTO validation.

Relevant Files:
- `crm-v2-server/src/quotes/quotes.controller.ts`
- `crm-v2-server/src/invoices/invoices.controller.ts`
- `crm-v2-server/src/quotes/quotes.service.ts`
- `crm-v2-server/src/invoices/invoices.service.ts`

Recommended Fix:
Create `UpdateQuoteStatusDto` and `UpdateInvoiceStatusDto` with strict enum validation. Reject missing/invalid status values before calling services.

Regression Test:
Add e2e tests for invalid, missing, and numeric statuses asserting HTTP 400 and unchanged database rows.

### BUG-016 - Updating a user with `role_ids: []` silently keeps old roles

Severity: Medium

Status: Confirmed

Area: Role Management / Admin / UX

Description:
The admin user update endpoint accepts `role_ids: []`, returns a successful response, but does not clear the user's roles. The service only updates roles when `role_ids.length > 0`.

Reproduction Steps:
1. Log in as an admin.
2. Select an audit user with roles `sales_rep,sales_manager`.
3. Send `PUT /api/v2/users/{id}` with `role_ids: []`.
4. Inspect the response or reload the user.

Expected Behaviour:
The API should either clear all roles or return HTTP 400 explaining that at least one role is required.

Actual Behaviour:
The API returns success and leaves the previous roles unchanged.

Evidence:
- Runtime probe for `audit.multi@example.test`: roles before `sales_rep,sales_manager`; roles after `role_ids: []` remained `sales_rep,sales_manager`.
- `crm-v2-server/src/users/users.service.ts:176` checks `if (updateUserDto.role_ids && updateUserDto.role_ids.length > 0)`.
- `crm-v2-server/src/users/dto/update-users.dto.ts` allows an optional array but does not require a non-empty array when supplied.

Impact:
Admins can believe privileges were removed when they were not. This is a role-management and access-revocation risk.

Suspected Root Cause:
Empty arrays were treated as “no update” rather than an explicit requested update.

Relevant Files:
- `crm-v2-server/src/users/users.service.ts`
- `crm-v2-server/src/users/dto/update-users.dto.ts`

Recommended Fix:
Define the policy explicitly. If zero-role users are allowed, update roles whenever `role_ids !== undefined`. If not, reject empty arrays with `ArrayMinSize(1)`.

Regression Test:
Add user update tests for omitted `role_ids`, empty `role_ids`, one role, and multiple roles.

## Low

### BUG-012 - User statistics count a non-existent `staff` role

Severity: Low

Status: High Confidence

Area: Admin / Reporting / Roles

Description:
`UsersService.getStats` reports `staff` by checking for a role named `staff`, but the seeded roles are `admin`, `admin_support`, `sales_manager`, `sales_rep`, `manager`, and `finance`.

Reproduction Steps:
1. Inspect seeded roles in the database.
2. Inspect `UsersService.getStats`.
3. Request user stats in an environment without a `staff` role.

Expected Behaviour:
Statistics should use roles that exist or should report a clearly defined staff total.

Actual Behaviour:
The `staff` stat is always zero unless an unseeded role named `staff` is manually added.

Evidence:
- Local database role list contains no `staff` role.
- `crm-v2-server/src/users/users.service.ts:236` checks `u.roles.some((r) => r.name === 'staff')`.

Impact:
Admin dashboards or reports can show misleading staffing counts.

Suspected Root Cause:
Role taxonomy changed from generic staff to concrete CRM roles without updating statistics.

Relevant Files:
- `crm-v2-server/src/users/users.service.ts`

Recommended Fix:
Define staff as all active non-admin CRM users, or rename/remove the stat.

Regression Test:
Add a stats test using the seeded role set and assert expected counts.

### BUG-013 - Server startup emits unsupported wildcard route warning

Severity: Low

Status: Confirmed

Area: Startup Health / Routing / Maintainability

Description:
Server startup logs a `LegacyRouteConverter` warning for unsupported route path `/api/v2/*`.

Reproduction Steps:
1. Start `crm-v2-server`.
2. Inspect startup logs.

Expected Behaviour:
Routing configuration should use syntax supported by the installed Nest/path-to-regexp version.

Actual Behaviour:
Startup logs a compatibility warning.

Evidence:
- Startup log: `Unsupported route path: "/api/v2/*"... latest path-to-regexp requires named parameters`.

Impact:
Currently this is a warning, but routing behavior may change or fail under dependency upgrades.

Suspected Root Cause:
Legacy wildcard syntax is still configured in middleware or documentation route setup.

Relevant Files:
- `crm-v2-server/src/main.ts`
- `crm-v2-server/src/app.module.ts`

Recommended Fix:
Replace wildcard path syntax with a named wildcard form supported by the current router.

Regression Test:
Add a server bootstrap smoke test that fails on route compatibility warnings.

## Potential Risks

### RISK-001 - Browser UI, responsive, and theme testing are blocked in this session

Status: Potential Risk

Area: UI / Responsive Design / Theme Handling

Description:
The in-app browser connector was unavailable. `agent.browsers.list()` returned an empty list, so protected UI flows, visual layout, modal behavior, browser back/forward, responsive breakpoints, and theme readability could not be genuinely exercised.

Recommended Follow-up:
Run a browser-backed QA pass with Playwright or the in-app browser once available. Prioritize auth redirects, admin deep links, lead workflows, forms, modals, tables, mobile navigation, and dark/light/system themes.

### RISK-002 - Production backup and local credential files contain sensitive operational data

Status: Potential Risk

Area: Security / Data Handling / Operations

Description:
The workspace contains a production database backup and a git-ignored local credentials document. I did not expose or commit secrets, but their presence on a developer desktop/workspace increases accidental disclosure risk.

Recommended Follow-up:
Store production backups and secrets outside application worktrees, encrypt backups at rest, document retention/deletion rules, and keep only redacted fixtures in repo-adjacent paths.

### RISK-003 - Production backup includes operational scratch/undo tables in the public schema

Status: Potential Risk

Area: Database Hygiene / Operations / Data Integrity

Description:
The supplied production dump includes public tables such as `act5_date_undo`, `activity_assignee_backfill_undo`, `db_ops_*`, `nash_sla_backup_20260812`, and `queue_supersede_backup_20260812`.

Recommended Follow-up:
Review whether these tables are intentionally retained. Move operational repair artifacts to a restricted schema, remove obsolete tables after verified backups, and ensure application roles cannot read/write them unless required.

### RISK-004 - Frontend route protection is login-only and relies on server errors for role boundaries

Status: Potential Risk

Area: Authorization / Navigation / UX

Description:
`ProtectedRoute` checks authentication but not route roles. Navigation hides unauthorized items, but manually-entered protected routes such as admin pages can still render enough of the page to call APIs and then depend on 403 handling.

Recommended Follow-up:
Add route-level role metadata and an unauthorized page for denied routes. Keep server-side authorization as the source of truth.

### RISK-005 - `CanAccessLeadGuard` reads `leadId`, but most lead routes use `:id`

Status: Potential Risk

Area: Authorization / Leads

Description:
The lead access guard extracts `request.params.leadId || request.body?.lead_id`. Many routes in `LeadsController` use `:id`. If this guard is reused on those routes, it may not scope the target lead as intended.

Recommended Follow-up:
Normalize route param names or make the guard accept both `id` and `leadId`. Add guard tests for every route shape.

### RISK-006 - Empty role update payloads may not clear user roles

Status: Potential Risk

Area: Role Management / Admin

Description:
`UsersService.update` only updates roles when `role_ids.length > 0`, so an admin sending `role_ids: []` appears unable to remove all roles. This may be intentional, but it is not explicit and can cause role-management surprises.

Recommended Follow-up:
Decide whether users may have zero roles. If yes, support clearing roles explicitly. If no, validate `role_ids` with `ArrayMinSize(1)` and return a clear 400.

### RISK-007 - Public/shared school and contact files are visible to all reps by design

Status: Potential Risk

Area: Authorization / Data Visibility

Description:
`FileManagerService.canSeeParent` returns true for `school` and `contact` files for every scoped sales rep. If those files can include sensitive school/contact documents, this may over-share data.

Recommended Follow-up:
Confirm product policy for school/contact attachments. If school/contact files can contain private documents, add ownership/team scoping.

### RISK-008 - Auth login throttle is global enough to interfere with QA/shared-office login bursts

Status: Potential Risk

Area: Authentication / Availability / UX

Description:
Repeated legitimate login attempts across audit test accounts hit HTTP 429 after approximately 10 login requests per minute. This is useful brute-force protection, but can also block QA, demos, or shared network offices if keyed too broadly.

Recommended Follow-up:
Confirm throttle keying and limits in production. Consider per-IP plus per-account policies, lockout telemetry, and clearer client messaging.

### RISK-009 - Quote and invoice ownership guards fail open on lookup errors

Status: Potential Risk

Area: Authorization / Error Handling

Description:
`CanAccessQuoteGuard` and `CanAccessInvoiceGuard` catch non-Forbidden exceptions from ownership lookup and return `true`. Current read paths apply ability checks downstream, and I have not reproduced unauthorized access from this alone, but fail-open authorization code is fragile.

Recommended Follow-up:
Change guard lookup failures to fail closed except for deliberate 404 handling. Add tests proving database lookup errors do not permit protected mutations.

### RISK-010 - Public calendar webhook can trigger full calendar pull without visible signature validation

Status: Potential Risk

Area: Public API / Integrations / Availability

Description:
`POST /api/v2/calendar-sync/webhook/:provider` is public and calls `sync.pullAll()` after only validating the provider path. The controller comments mention provider auth, but no signature/header validation is visible at this boundary.

Recommended Follow-up:
Confirm whether provider signature validation happens inside `CalendarSyncService.pullAll()` or infrastructure. If not, require provider-specific webhook validation and rate limiting before triggering sync work.

## Second-Pass Addendum

### BUG-020 - Public calendar webhook triggers full calendar sync with no implemented signature validation

Severity: High

Status: High Confidence

Area: Public API / Integrations / Availability / Security

Description:
The first pass recorded RISK-010. The second pass inspected the controller and service boundary and found no provider signature/header validation before the public webhook runs `sync.pullAll()`. The controller comment says signed-body validation exists, but the handler only validates the provider string and discards the body.

Reproduction Steps:
1. Inspect `CalendarSyncController.webhook`.
2. Observe `@Public()` on `POST /api/v2/calendar-sync/webhook/:provider`.
3. Observe the handler calls `this.parseProvider(providerParam)`, ignores `body`, then awaits `this.sync.pullAll()`.
4. Inspect `CalendarSyncService.pullAll()` and observe it pulls every active connection without webhook-origin validation.

Expected Behaviour:
Public webhooks should verify provider-specific signatures, channel IDs, subscription secrets, replay windows, and rate limits before any expensive sync work.

Actual Behaviour:
Any unauthenticated caller that knows `/api/v2/calendar-sync/webhook/google` or `/api/v2/calendar-sync/webhook/microsoft` can trigger a full sync attempt for all active calendar connections.

Evidence:
`crm-v2-server/src/calendar-sync/calendar-sync.controller.ts` defines `@Post('webhook/:provider')`, `@Public()`, ignores the body, and calls `await this.sync.pullAll()`. `crm-v2-server/src/calendar-sync/services/calendar-sync.service.ts` loads all active connections in `pullAll()`.

Impact:
This can be abused for resource exhaustion, noisy provider calls, quota burn, and repeated mutation of sync tokens once adapters are wired.

Suspected Root Cause:
Webhook controller was built before provider verification was implemented; comments describe intended validation that is not present.

Relevant Files:
`crm-v2-server/src/calendar-sync/calendar-sync.controller.ts`, `crm-v2-server/src/calendar-sync/services/calendar-sync.service.ts`

Recommended Fix:
Add Google/Microsoft-specific webhook validation, reject missing/invalid headers, validate the target connection/channel, and never fan out to every connection from one webhook.

Regression Test:
Add e2e tests proving unsigned webhook requests return 401/403 and signed webhook requests sync only the addressed connection.

### BUG-021 - Calendar and video integrations are exposed as usable but backend adapters are stubs

Severity: High

Status: High Confidence

Area: Integrations / Scheduling / UX

Description:
Calendar and video integration workflows appear available in the UI and API, but their adapters throw `NotImplementedException` for token exchange and provider operations. Users can start connection flows that lead to placeholder OAuth URLs or callback errors, and scheduling can choose video locations whose provider cannot create meeting links.

Reproduction Steps:
1. Inspect the calendar connections page; Google Calendar and Microsoft Outlook are rendered as connectable providers.
2. Inspect `GoogleCalendarAdapter` and `MicrosoftCalendarAdapter`; `exchangeCode`, `pushEvent`, `patchEvent`, `cancelEvent`, and `pullDelta` all throw `NotImplementedException`.
3. Inspect the video connections page; Zoom is marked `available: true`.
4. Inspect `ZoomAdapter`; `exchangeCode`, `createMeeting`, and `cancelMeeting` throw `NotImplementedException`.
5. Inspect scheduling link creation; Zoom, Google Meet, and Teams are valid location choices.

Expected Behaviour:
Unavailable integrations should be hidden/disabled or fully implemented behind sandbox credentials before production.

Actual Behaviour:
The UI advertises connectable calendar/video providers while the backend cannot complete connection, sync, or meeting creation.

Evidence:
`crm-v2-server/src/calendar-sync/adapters/google-calendar.adapter.ts`, `crm-v2-server/src/calendar-sync/adapters/microsoft-calendar.adapter.ts`, and `crm-v2-server/src/video-integrations/adapters/zoom.adapter.ts` throw `NotImplementedException`. `crm-v2-client/src/pages/profile/calendar-connections-page.tsx`, `crm-v2-client/src/pages/profile/video-connections-page.tsx`, and `crm-v2-client/src/pages/scheduling/scheduling-links-page.tsx` expose the workflows.

Impact:
Pilot users will hit dead ends when connecting calendars/video, bookings will not create promised meeting links, and support will receive integration failures that are not configuration-only.

Suspected Root Cause:
Integration contracts and UI were shipped before provider HTTP implementations were completed.

Recommended Fix:
Feature-flag these providers off until implemented, or complete OAuth/token/CRUD calls with sandbox tests and production credential validation.

Regression Test:
Add integration-contract tests that fail if a UI-visible provider adapter throws `NotImplementedException`.

### BUG-022 - Email template preview renders stored template HTML without sanitization

Severity: High

Status: High Confidence

Area: Security / XSS / User Email

Description:
Email templates accept arbitrary `body_html`, render it server-side with Mustache, and the admin preview injects `data.body_html` via `dangerouslySetInnerHTML` without sanitization. The CRM already has a sanitizer for rich text, but this preview path does not use it.

Reproduction Steps:
1. Create or edit an email template with HTML containing event-handler markup such as an image `onerror` payload.
2. Open the preview dialog on `/admin/email-templates`.
3. Observe the preview uses raw `data.body_html`.

Expected Behaviour:
Template previews should sanitize HTML before insertion into the CRM DOM, and shared templates should not allow one user to inject active content into another user's admin page.

Actual Behaviour:
The preview injects rendered template HTML directly.

Evidence:
`crm-v2-client/src/pages/admin/email-templates-page.tsx` uses `dangerouslySetInnerHTML={{ __html: data.body_html }}`. `crm-v2-server/src/user-email/services/email-templates.service.ts` returns `body_html` from `Mustache.render(tpl.body_html, scope)` without sanitizing the template body.

Impact:
A template author can create stored XSS in the CRM preview surface. If an admin creates a shared malicious template, any user previewing it is exposed; if non-admin template sharing logic regresses, this becomes cross-user immediately.

Suspected Root Cause:
Email HTML was treated as email content, but the same HTML is also rendered inside the web app.

Recommended Fix:
Sanitize preview HTML with the existing rich-text sanitizer or a server-approved HTML sanitizer, and enforce an allowed email-template tag/attribute policy before save.

Regression Test:
Add a component/security test where a malicious template preview renders inert sanitized markup and no event-handler attributes survive.

### BUG-023 - Payment allocation summary columns are inconsistent with allocation rows in restored data

Severity: High

Status: Confirmed

Area: Finance / Database Integrity / Reporting

Description:
Read-only forensic SQL found 28 payments where `payments.allocated_amount` does not equal the sum of `payment_allocations.allocated_amount`. Examples include payments whose `allocated_amount` equals the full payment amount while no allocation rows exist.

Reproduction Steps:
1. Start local PostgreSQL against the restored backup.
2. Run:
   `SELECT count(*) FROM payments p WHERE round((p.allocated_amount - coalesce((SELECT sum(a.allocated_amount) FROM payment_allocations a WHERE a.payment_id=p.id),0))::numeric,2) <> 0;`
3. Query examples from the same predicate.

Expected Behaviour:
Denormalized payment allocation columns should match allocation rows, or reporting should derive allocation state exclusively from allocation rows.

Actual Behaviour:
28 payments have mismatched allocation state. Example: `PAY-2026-0035` has amount `7800.00`, `allocated_amount=7800.00`, `unallocated_amount=0.00`, but actual allocation rows sum to `0`.

Evidence:
Read-only database query on 2026-08-26 returned `payment_alloc_sum_mismatch|28`. `PaymentsService.getPaymentStatistics()` reports `SUM(payment.allocated_amount)` and `SUM(payment.unallocated_amount)`, so this drift can surface in finance statistics.

Impact:
Finance dashboards can report allocated money that is not actually allocated to installments. Collections and installment status audits can disagree.

Suspected Root Cause:
Historical payments were marked allocated before allocation rows were created, or older allocation code drifted from the current source of truth.

Relevant Files:
`crm-v2-server/src/payments/payments.service.ts`, `crm-v2-server/src/payment-terms/entities/payment-allocation.entity.ts`

Recommended Fix:
Backfill/repair historical allocation rows or reset denormalized columns from actual rows. Prefer deriving statistics from allocation rows or enforce consistency transactionally.

Regression Test:
Add a DB integrity test asserting every payment's allocation summary equals allocation rows after create, update, delete, and allocation retry.

### BUG-024 - Scheduling availability ignores the configured timezone

Severity: Medium

Status: High Confidence

Area: Scheduling / Date-Time / UX

Description:
Scheduling links store a `timezone`, and the UI describes default availability as being in the owner timezone. Slot generation, however, uses UTC day and hour math (`getUTCDay`, `setUTCHours`) and does not convert availability windows through `link.timezone`.

Reproduction Steps:
1. Create a scheduling link with `timezone: "Africa/Harare"` and availability 09:00-17:00.
2. Request `/api/v2/book/:slug`.
3. Inspect generated `start_at` values.

Expected Behaviour:
Availability windows should be interpreted in the owner-configured timezone.

Actual Behaviour:
Availability windows are interpreted as UTC clock time, shifting local availability by the timezone offset.

Evidence:
`crm-v2-server/src/scheduling/services/scheduling.service.ts` uses `day.getUTCDay()` and `d.setUTCHours(...)`. `crm-v2-client/src/pages/scheduling/scheduling-links-page.tsx` says availability defaults to Mon-Fri 9-17 in the user's timezone.

Impact:
Customers can book outside intended working hours, especially in non-UTC regions and around date boundaries.

Suspected Root Cause:
Timezone field was persisted before timezone-aware slot generation was implemented.

Recommended Fix:
Use a timezone-aware date library or Temporal-compatible conversion for owner availability, and add tests for UTC+2, UTC-5, and DST regions.

Regression Test:
Add slot-generation tests proving a 09:00 local availability window emits the correct UTC instants for the configured timezone.

### BUG-025 - Notification entity filtering uses `entityId` instead of the mapped `entity_id` property

Severity: Medium

Status: High Confidence

Area: Notifications / API / Frontend-Backend Contract

Description:
Notification query DTOs expose `entityId`, but the TypeORM entity property is `entity_id`. The query builder filters on `notification.entityId`, which is not a mapped property/column in the entity.

Reproduction Steps:
1. Call a notification listing endpoint with an `entityId` query parameter.
2. Inspect SQL generated by `UserNotificationsService.getUserNotifications()` or `findAll()`.

Expected Behaviour:
Filtering by entity ID should use the mapped `notification.entity_id` property and return matching notifications.

Actual Behaviour:
The service references `notification.entityId`, likely producing a bad SQL/property path or returning no results depending on TypeORM handling.

Evidence:
`crm-v2-server/src/notifications/entities/notification.entity.ts` defines `entity_id`. `crm-v2-server/src/notifications/dto/query-notification.dto.ts` defines `entityId`. `crm-v2-server/src/notifications/user-notifications.service.ts` filters with `notification.entityId = :entityId`.

Impact:
Entity-scoped notification searches and audit-style notification views can fail or silently omit data.

Suspected Root Cause:
CamelCase DTO names were copied into TypeORM query paths without mapping to entity property names.

Recommended Fix:
Change query builder filters to `notification.entity_id = :entityId` and add contract tests for every query filter.

Regression Test:
Create notifications for two entity IDs and assert `entityId` query returns only the matching rows.

### BUG-026 - Duplicate contact email and phone groups exist in restored data

Severity: Medium

Status: Confirmed

Area: Contacts / Database Integrity / Duplicate Management

Description:
Read-only forensic queries found 49 duplicate contact-email groups and 86 duplicate normalized contact-phone groups in the restored backup. The contacts table has only a primary-key index and no uniqueness or partial uniqueness on email/phone.

Reproduction Steps:
1. Run duplicate group queries against `contacts`.
2. Count grouped `lower(email)` values where count > 1.
3. Count grouped normalized phone values where count > 1.

Expected Behaviour:
If contact email/phone is a logical identity signal, duplicates should be prevented, queued, or intentionally modeled.

Actual Behaviour:
Duplicates exist in production-like data. Examples included very large repeated email groups such as `tanyag@clearhue.co.zw` and `busid@clearhue.co.zw`.

Evidence:
Read-only SQL returned `duplicate_contact_emails|49` and `duplicate_contact_phones|86`. `pg_indexes` showed no contact email/phone index beyond the primary key.

Impact:
Sales reps can contact the wrong person, duplicate queues can miss already-existing duplicates, and reports by stakeholder/contact can be inflated.

Suspected Root Cause:
Contact identity is enforced by duplicate-detection application logic rather than database constraints, and historical imports allowed repeated placeholder/shared values.

Recommended Fix:
Decide whether email/phone must be unique per school, per organization, or globally. Add the corresponding partial unique indexes and a remediation queue for legacy duplicates.

Regression Test:
Add create/import tests for duplicate email/phone combinations under the chosen identity policy.

### BUG-027 - Some invoices have `created_at` later than `updated_at`

Severity: Low

Status: Confirmed

Area: Database Integrity / Timestamps

Description:
Read-only forensic SQL found 5 invoices where `created_at > updated_at`. The observed examples differ by sub-second truncation, indicating inconsistent timestamp precision or migration/import behavior.

Reproduction Steps:
1. Run `SELECT id, invoice_number, created_at, updated_at FROM invoices WHERE created_at > updated_at ORDER BY created_at DESC LIMIT 5;`.
2. Observe five invoice rows.

Expected Behaviour:
`updated_at` should be greater than or equal to `created_at`.

Actual Behaviour:
Five invoice rows have `updated_at` truncated earlier than `created_at`.

Evidence:
Examples included `INV-2026-0068` with `created_at=2026-05-26 09:41:13.648` and `updated_at=2026-05-26 09:41:13`.

Impact:
Low direct business impact, but timestamp ordering can break sync, audit, incremental export, and “recently updated” logic.

Suspected Root Cause:
Mixed timestamp precision during import/backfill or different code paths populating create/update columns.

Recommended Fix:
Normalize timestamp precision and add a data repair migration/backfill.

Regression Test:
Add DB invariant checks ensuring timestamp columns satisfy `created_at <= updated_at` after create/update/import flows.

### RISK-011 - Email sequence queue can double-send on multi-instance deployments

Status: Potential Risk

Area: Scheduler / Email / Idempotency

Description:
`EmailSequenceService.processQueue()` loads up to 50 pending due rows, sends email, then updates status to sent/failed. There is no row claim, pessimistic lock, `SKIP LOCKED`, or transactional state transition before the external send. Two app instances running the 15-minute cron could read and send the same pending row before either marks it sent.

Recommended Follow-up:
Claim rows transactionally before sending, use `SELECT ... FOR UPDATE SKIP LOCKED`, or move email delivery to a real queue with idempotency keys.

### RISK-012 - Cash requisition parent exclusivity is service-only, not database-enforced

Status: Potential Risk

Area: Database Integrity / Cash Requisitions

Description:
The service enforces exactly one of `deal_id`, `lead_id`, or `campaign_id`, and current data has zero violations. PostgreSQL has only nullable foreign keys and no CHECK constraint enforcing the exact-one rule.

Recommended Follow-up:
Add a CHECK constraint such as `num_nonnulls(deal_id, lead_id, campaign_id) = 1` and regression tests for create/update/import paths.

### BUG-028 - Concurrent payment-term application can create duplicate schedules and child invoices

Severity: High

Status: High Confidence

Area: Finance / Database Integrity / Idempotency

Description:
`POST /api/v2/payment-terms/apply` is intended to allow one applied payment term per document, but the guarantee is implemented as a check-before-insert inside a transaction with only a non-unique index on `(document_id, document_type)`. Two concurrent requests can both pass the lookup and then both insert applied terms; for `multiple_invoices` strategies, that can also duplicate generated child invoices.

Reproduction Steps:
1. Choose a parent invoice without an existing applied payment term.
2. Send two identical `POST /api/v2/payment-terms/apply` requests at the same time.
3. Inspect `applied_payment_terms`, `installments`, and child invoices for that document.

Expected Behaviour:
Exactly one applied term/schedule exists for a document; duplicates are rejected atomically.

Actual Behaviour:
The code has no database uniqueness constraint or locking guard that would make the check atomic.

Evidence:
`crm-v2-server/src/payment-terms/payment-terms.service.ts:249` checks `existingAppliedTerm`; `crm-v2-server/src/payment-terms/payment-terms.service.ts:455` can generate multiple child invoices; `crm-v2-server/src/payment-terms/entities/applied-payment-term.entity.ts:28` defines `@Index(['document_id', 'document_type'])` without `unique: true`.

Impact:
Duplicate installment schedules, duplicate child invoices, overstated receivables, and confused collections workflows under double-click/retry/concurrent API calls.

Suspected Root Cause:
Business uniqueness is enforced only in service code, not in the database.

Relevant Files:
- `crm-v2-server/src/payment-terms/payment-terms.service.ts:249`
- `crm-v2-server/src/payment-terms/payment-terms.service.ts:455`
- `crm-v2-server/src/payment-terms/entities/applied-payment-term.entity.ts:28`

Recommended Fix:
Add a unique database index on `(document_id, document_type)` and handle unique-violation errors as idempotent/409 responses. Consider locking the parent invoice/document row while applying terms.

Regression Test:
Add a concurrency test that fires two apply requests for the same invoice and asserts only one applied term, one schedule set, and one child-invoice set exists.

### BUG-029 - Dashboard aggregation endpoints are available to any authenticated role

Severity: High

Status: High Confidence

Area: Authorization / Reports / Data Exposure

Description:
Most dashboard endpoints have no `@Roles()` decorator. Global guards require login, but the absence of endpoint role checks means roles that should not see executive/team analytics can call `/api/v2/dashboard/*` directly. The frontend hides the executive dashboard for users without admin/manager/sales-manager role or `Dashboard:read`, but the backend does not mirror that policy for most dashboard APIs.

Reproduction Steps:
1. Log in as a role outside the executive dashboard policy, such as `finance` or another authenticated non-manager.
2. Manually call `GET /api/v2/dashboard/kpis`, `/dashboard/high-value-deals`, `/dashboard/collections-due`, or `/dashboard/top-performing-products`.
3. Observe that global authentication is the only declared controller-level requirement for those handlers.

Expected Behaviour:
Sensitive dashboard aggregates should be restricted server-side to the same roles/permissions that the UI uses.

Actual Behaviour:
Only `/dashboard/compliance-report` declares `@Roles('admin', 'sales_manager')`; many other team/executive endpoints rely on default authenticated access.

Evidence:
`crm-v2-server/src/dashboard/dashboard.controller.ts:30` has a role check for compliance only; handlers at `crm-v2-server/src/dashboard/dashboard.controller.ts:122`, `:155`, `:206`, `:350`, and `:373` have no `@Roles()`. The frontend gates executive dashboard rendering at `crm-v2-client/src/pages/dashboard/dashboard-page.tsx:103`, while `ProtectedRoute` only checks login at `crm-v2-client/src/components/protected-route.tsx:17`.

Runtime role-scope probe on the restored backup confirmed the issue: `finance` received HTTP 200 from `/dashboard/kpis?dateRange=ytd`, `/dashboard/sales-metrics?dateRange=ytd`, `/dashboard/leads-by-stage?dateRange=ytd`, `/dashboard/sla-compliance?dateRange=ytd`, `/dashboard/lead-conversion?dateRange=ytd`, and `/dashboard/activity-discipline?dateRange=mtd`. The same finance token received HTTP 403 from `/reports/sales-performance?period=year` and `/reports/finance`, proving the dashboard exposure is broader than the report authorization policy.

Impact:
Authenticated users can retrieve team-wide KPIs, high-value deal lists, collections summaries, and product performance aggregates through direct API calls even when the UI does not expose them.

Suspected Root Cause:
Authorization is enforced inconsistently between frontend rendering and backend controller decorators.

Relevant Files:
- `crm-v2-server/src/dashboard/dashboard.controller.ts:122`
- `crm-v2-server/src/dashboard/dashboard.controller.ts:206`
- `crm-v2-server/src/dashboard/dashboard.controller.ts:350`
- `crm-v2-client/src/pages/dashboard/dashboard-page.tsx:103`
- `crm-v2-client/src/components/protected-route.tsx:17`

Recommended Fix:
Add server-side role/permission decorators to all executive/team dashboard endpoints and preserve sales-rep self-scoping where intended.

Regression Test:
Add API authorization tests for every dashboard endpoint across `admin`, `sales_manager`, `manager`, `sales_rep`, `finance`, and `admin_support`.

### BUG-030 - Notification preference API accepts unvalidated event/channel/severity values

Severity: Medium

Status: High Confidence

Area: API Validation / Notifications / Data Integrity

Description:
Notification preference create/update bodies are TypeScript interfaces, not validation DTO classes. Nest's global `ValidationPipe` cannot validate interfaces at runtime, and the entity stores `event_type`, `channel`, and `severity_min` as plain varchar columns. The API can therefore persist arbitrary event names, unsupported channels, and unsupported severity strings.

Reproduction Steps:
1. Send `POST /api/v2/notification-preferences` with an arbitrary `event_type`, invalid `channel`, and invalid `severity_min`.
2. Send `PATCH /api/v2/notification-preferences/:eventType/:channel` with an unsupported path channel.
3. Inspect persisted rows.

Expected Behaviour:
Only known notification events/channels/severities should be accepted, with clear 400 responses.

Actual Behaviour:
The controller copies request values directly into `repo.create()` / `repo.save()` and the entity columns are varchar.

Evidence:
`crm-v2-server/src/notifications/notification-preferences.controller.ts:10` and `:17` define interfaces; body values are saved at `:77` and `:103`. The entity defines varchar-backed `event_type`, `channel`, and `severity_min` at `crm-v2-server/src/notifications/entities/notification-preference.entity.ts:31`, `:34`, and `:40`.

Impact:
Users can accumulate dead notification preferences that never match dispatch logic, or suppress/enable unsupported channels in ways the UI cannot represent.

Suspected Root Cause:
Runtime DTO validation was skipped because interfaces were used as request contracts.

Relevant Files:
- `crm-v2-server/src/notifications/notification-preferences.controller.ts:10`
- `crm-v2-server/src/notifications/notification-preferences.controller.ts:77`
- `crm-v2-server/src/notifications/entities/notification-preference.entity.ts:34`

Recommended Fix:
Replace interfaces with DTO classes using `@IsIn`, `@IsBoolean`, and explicit event/channel/severity enums. Consider database CHECK constraints for channel and severity.

Regression Test:
Add API tests asserting invalid channel/severity/event values return 400 and do not persist.

### BUG-031 - Discipline dashboard still counts demos/proposals using brittle subject text matching

Severity: Medium

Status: High Confidence

Area: Reporting / Business Metrics

Description:
The newer activity-discipline service explicitly documents that counting demos by `subject ILIKE '%demo%'` over-reported demo activity and switched to structured activity types. The older `/dashboard/discipline-metrics` service still uses subject text matching for demos and proposals, so the same dashboard family can report inconsistent or inflated metrics.

Reproduction Steps:
1. Create or locate a completed non-demo activity whose subject contains "demo".
2. Call `GET /api/v2/dashboard/discipline-metrics`.
3. Compare the result to `GET /api/v2/dashboard/activity-discipline`.

Expected Behaviour:
Demo/proposal metrics should use structured event types/outcomes consistently.

Actual Behaviour:
`/discipline-metrics` still uses subject text predicates for demos and proposals.

Evidence:
`crm-v2-server/src/dashboard/discipline-metrics.service.ts:119` uses `a.subject ILIKE '%demo%'`; `:174` uses `a.subject ILIKE '%proposal%'`. `crm-v2-server/src/dashboard/activity-discipline.service.ts:374` documents why the demo subject predicate was wrong and `:415` uses `a.type = 'demo_delivery'`.

Impact:
Managers can make staffing/performance decisions from inflated or inconsistent dashboard figures even after the newer dashboard widget was corrected.

Suspected Root Cause:
Duplicate dashboard metric implementations drifted.

Relevant Files:
- `crm-v2-server/src/dashboard/discipline-metrics.service.ts:119`
- `crm-v2-server/src/dashboard/discipline-metrics.service.ts:174`
- `crm-v2-server/src/dashboard/activity-discipline.service.ts:374`

Recommended Fix:
Replace subject matching with the same structured type/outcome rules used by `ActivityDisciplineService`, or consolidate both dashboards onto one metric source.

Regression Test:
Add fixture activities containing "demo" in non-demo subjects and assert they are not counted as demos.

## High - Continued Scan Additions

### BUG-032 - Public export includes helper scripts with fixed credentials and direct database mutation paths

Severity: High

Status: High Confidence

Area: Security / Repository Hygiene / Operations

Description:
The clean public export correctly excludes audit MDs, backups, `.env` files, and root scratch files, but it still includes server helper scripts that contain fixed login credentials and direct database update helpers. One smoke-test script logs in with fixed admin/rep passwords and contains a direct `psql` reset path with a hard-coded database password. Another script resets `admin@digilearn.com` to a fixed password and defaults the database password when `DATABASE_PASSWORD` is absent.

Reproduction Steps:
1. Inspect the pushed export at `C:\Users\8Y14\AppData\Local\Temp\digilearn-crm-public-export-20260826-144327`.
2. Run a secret-pattern scan excluding Markdown, environment files, lockfiles, and `.git`.
3. Open the matching helper scripts.

Expected Behaviour:
Public branches should not contain fixed credentials, operational database passwords, or scripts that reset privileged accounts unless they are harmless examples with no real environment overlap.

Actual Behaviour:
The public export contains scripts with fixed CRM credentials and database mutation logic. The helper comments explicitly describe live-DB use in one smoke-test script.

Evidence:
- `crm-v2-server/scripts/demo-feature-smoke-test.sh` defines fixed admin/rep emails and passwords, and its reset helper runs `psql` with an inline database password against `digilearn_crm`.
- `crm-v2-server/scripts/reset-admin-pw.js` sets `admin@digilearn.com` to a fixed password and falls back to a default database password when the environment variable is missing.
- Public export scan found no `SYSTEM_AUDIT.md`, `AUDIT_COVERAGE_V2.md`, backup directory, `.env`, `allt.json`, or `lchk.json`, so this is specific to shipped helper scripts.

Impact:
If any deployed or shared environment still accepts those credentials or database defaults, a public repository viewer could gain unauthorized CRM or database access. Even if these are only local defaults, keeping reset scripts in the public app source increases accidental misuse risk.

Suspected Root Cause:
The export filter removed docs, backup, and environment files but still included operational scripts under `crm-v2-server/scripts`.

Relevant Files:
- `crm-v2-server/scripts/demo-feature-smoke-test.sh`
- `crm-v2-server/scripts/reset-admin-pw.js`

Recommended Fix:
Remove these scripts from public branches or rewrite them to require explicit environment variables with no defaults and no real credentials. Rotate any admin, rep, or database credential that may match staging/production or shared development environments.

Regression Test:
Add a repository secret scan in CI that fails on fixed passwords, inline `PGPASSWORD`, default database passwords, reset-admin scripts, and known demo credentials.

### BUG-033 - Current production dependency audit reports critical/high vulnerabilities in server and client packages

Severity: High

Status: Confirmed

Area: Dependency Security / Supply Chain

Description:
Production dependency audits for both app packages report known vulnerabilities. The server package has one critical and seventeen high-severity findings. The client package has twelve high-severity findings. Several affected packages are in security-sensitive paths, including templating, mail sending, Socket.IO/WebSocket handling, routing, Vite tooling, and HTTP clients.

Reproduction Steps:
1. From `crm-v2-server`, run `npm audit --omit=dev --audit-level=moderate --json`.
2. From `crm-v2-client`, run `npm audit --omit=dev --audit-level=moderate --json`.
3. Review the metadata summaries.

Expected Behaviour:
Production dependency audit should be clean or limited to accepted, documented exceptions with mitigations.

Actual Behaviour:
The server audit exits nonzero with 26 production vulnerabilities: 1 critical, 17 high, 7 moderate, 1 low. The client audit exits nonzero with 14 production vulnerabilities: 12 high, 2 moderate.

Evidence:
- Server audit flagged packages including `handlebars`, `nodemailer`, `@nestjs/*`, `multer`, `engine.io`, `socket.io-parser`, `ws`, `lodash`, `typeorm`, and `undici`.
- Client audit flagged packages including `axios`, `react-router`, `vite`, `form-data`, `postcss`, `rollup`, `socket.io-parser`, `ws`, and `undici`.

Impact:
Known vulnerable production dependencies can expose the CRM to denial-of-service, injection, XSS/open redirect, credential/header leakage, unsafe file handling, or supply-chain audit failure during product-owner or customer review.

Suspected Root Cause:
Dependencies and lockfiles have not been updated against the current advisory database after the latest security disclosures.

Relevant Files:
- `crm-v2-server/package.json`
- `crm-v2-server/package-lock.json`
- `crm-v2-client/package.json`
- `crm-v2-client/package-lock.json`

Recommended Fix:
Upgrade vulnerable packages using `npm audit fix` where safe, then manually handle major-version changes such as mail/template/router/tooling packages. Re-run builds, tests, and smoke tests after each dependency cluster.

Regression Test:
Add a CI dependency-audit job for production dependencies and require documented approval for any remaining high or critical advisory.

### BUG-034 - Sales reps can attach file metadata to arbitrary CRM records without parent access checks

Severity: High

Status: High Confidence

Area: File Manager / Authorization / Data Integrity

Description:
The file metadata create endpoint is available to `sales_rep` and accepts caller-supplied `entity_type`, `entity_id`, `file_url`, `provider`, and metadata. The service stamps `uploaded_by_id` from the current user, but it does not verify that the caller can access the parent lead/deal/quote/invoice/school/contact before creating the metadata row. Read/update/delete paths later scope records for reps, but create can still pollute another user's record or attach arbitrary URLs to shared entities.

Reproduction Steps:
1. Authenticate as a sales rep.
2. Send `POST /api/v2/file-manager` with `entity_type` set to `lead`, `deal`, `quote`, or `invoice` and `entity_id` set to a record owned by another user.
3. Include any accepted provider and a caller-controlled `file_url`.
4. Inspect the created `managed_files` row.

Expected Behaviour:
The server should verify parent ownership/visibility before creating metadata. A rep should receive 404/403 when attaching a file to a record they cannot access.

Actual Behaviour:
`FileManagerService.create()` saves the DTO directly with `uploaded_by_id = userId` and performs no `canSeeParent()` or existence check for `entity_type/entity_id`.

Evidence:
- `crm-v2-server/src/file-manager/file-manager.controller.ts:32` allows `POST /file-manager` for `admin`, `sales_manager`, and `sales_rep`.
- `crm-v2-server/src/file-manager/dto/create-file.dto.ts` accepts `file_url`, `entity_type`, and `entity_id` from the request body.
- `crm-v2-server/src/file-manager/file-manager.service.ts:65` creates and saves the file from the DTO without checking parent access.
- `canSeeParent()` is used by list/read/update/delete paths, but not by create.
- Read-only backup scan found no current orphan managed-file parents, so this is a code-proven gap rather than an existing data anomaly.

Impact:
Authorized but scoped users can pollute other users' CRM records with misleading file entries, attach arbitrary external URLs, and create confusing or reputationally risky document history. This also weakens audit trust because the upload log would show a file attached to a record the actor should not control.

Suspected Root Cause:
Ownership scoping was added to read/update/delete flows after the create path had already been implemented and was not applied consistently.

Relevant Files:
- `crm-v2-server/src/file-manager/file-manager.controller.ts`
- `crm-v2-server/src/file-manager/file-manager.service.ts`
- `crm-v2-server/src/file-manager/dto/create-file.dto.ts`

Recommended Fix:
Call the same parent-access logic before saving metadata in `create()`. Also validate that `entity_id` exists for the declared `entity_type`, reject arbitrary external URLs unless explicitly supported, and bind Vercel upload completion to the authenticated user/token payload.

Regression Test:
Add API tests proving a sales rep cannot create file metadata for another rep's lead/deal/quote/invoice, cannot create metadata for a nonexistent parent, and can still attach files to records they own.

### BUG-035 - Operators can create cash requisitions against arbitrary leads or deals without ownership checks

Severity: High

Status: High Confidence

Area: Cash Requisitions / Finance / Authorization

Description:
The cash requisition create endpoint is available to all operator roles, including `sales_rep` and `finance`. The service validates that a supplied lead, deal, or campaign exists and that exactly one parent is supplied, but it does not verify that the requester owns or is allowed to raise spend against that parent. Later read/update/submit paths scope by requester for non-overseer users, so a user can create and submit a requisition against another rep's lead/deal while the finance approval context still points at that unrelated CRM record.

Reproduction Steps:
1. Authenticate as a non-overseer operator such as `sales_rep`.
2. Choose a valid `lead_id` or `deal_id` assigned to another user.
3. Send `POST /api/v2/cash-requisitions` with that ID and a valid line item.
4. Submit the created requisition via `POST /api/v2/cash-requisitions/:id/submit`.

Expected Behaviour:
The server should reject requisition creation unless the requester owns or is authorized for the linked lead/deal/campaign.

Actual Behaviour:
`CashRequisitionsService.create()` only verifies existence of the supplied parent and then saves the requisition with `requested_by_id = userId`.

Evidence:
- `crm-v2-server/src/cash-requisitions/cash-requisitions.controller.ts:49` allows `POST /cash-requisitions` for all operators.
- `crm-v2-server/src/cash-requisitions/cash-requisitions.service.ts:139` checks exact-one linkage.
- `crm-v2-server/src/cash-requisitions/cash-requisitions.service.ts:151` to `:164` verifies parent records exist, but does not compare lead/deal assignee or campaign permission to the acting user.
- Read-only backup scan found `0` existing lead/deal requisitions where requester differed from assignee, so this is not currently evidenced as historical data damage.

Impact:
Users can create spend requests attached to records they do not control, causing finance/manager approvals to be based on misleading parent context and polluting cost-to-close/campaign ROI reporting.

Suspected Root Cause:
Requester ownership checks were implemented for read/update/submit visibility but not for create-time parent binding.

Relevant Files:
- `crm-v2-server/src/cash-requisitions/cash-requisitions.controller.ts`
- `crm-v2-server/src/cash-requisitions/cash-requisitions.service.ts`
- `crm-v2-server/src/cash-requisitions/dto/cash-requisition.dto.ts`

Recommended Fix:
At create time, enforce parent access: reps may only link their own leads/deals; campaign-level requisitions should be limited to campaign managers or explicitly authorized roles. Keep the exact-one parent validation and add regression tests for cross-owner IDs.

Regression Test:
Add API tests where rep A attempts to create/submit requisitions against rep B's lead and deal and receives 403/404. Add positive tests for owned lead/deal creation and manager/finance approval flow.

### BUG-040 - Sales Performance report undercounts YTD cash collected by using invoice paid-date summaries instead of payment ledger

Severity: High

Status: Confirmed

Area: Reports / Finance Metrics / Data Integrity

Description:
The in-app Sales Performance report calculates `cashCollected` by summing `invoice.amount_paid` for invoices whose `paid_date` falls in the selected period. The dashboard executive/sales metrics calculate cash from the payment ledger using `payments.payment_date`. In the restored backup, many partially paid invoices have payment rows but no `paid_date`, so the Sales Performance report undercounts YTD cash collected compared with the authoritative payment ledger.

Reproduction Steps:
1. Use the restored backup database.
2. Compare YTD `SUM(payments.amount)` by `payments.payment_date` to the Sales Performance report formula of `SUM(invoices.amount_paid)` by `invoices.paid_date`.
3. Inspect invoices with payments and `paid_date IS NULL`.

Expected Behaviour:
Cash collected metrics should use one authoritative definition, ideally payment ledger rows by payment date, and should match across dashboard and reports for the same period.

Actual Behaviour:
For 2026 YTD in the restored backup, payment rows total `185000.00`, while the report formula totals only `126100.00`. Payments on invoices with no `paid_date` total `58900.00`.

Evidence:
- Read-only backup query: `dashboard_cash_payments_ytd = 185000.00`.
- Read-only backup query: `reports_cash_invoice_paid_date_ytd = 126100.00`.
- Read-only backup query: `ytd_payments_on_invoices_no_paid_date = 58900.00`.
- Example affected invoices include `INV-2026-0076`, `INV-2026-0072`, `INV-2026-0013`, `INV-2026-0002`, and `INV-2026-0038`.
- `crm-v2-server/src/reports/reports-read.service.ts:97` documents the invoice-paid-date formula.
- `crm-v2-server/src/reports/reports-read.service.ts:101` filters invoices by `paid_date`.
- `crm-v2-server/src/reports/reports-read.service.ts:106` sums `invoice.amount_paid`.
- `crm-v2-server/src/dashboard/dashboard.service.ts:315` and `:669` use `payments.payment_date` for dashboard cash metrics.

Impact:
Leadership can see materially different cash collection numbers depending on which report is open. This is likely to undermine confidence in the CRM during visual/product-owner review and can produce incorrect finance decisions.

Suspected Root Cause:
Reports use invoice summary fields as a cash ledger. Partial-payment workflows update `amount_paid` and payment rows, but do not reliably set `paid_date` until fully paid.

Relevant Files:
- `crm-v2-server/src/reports/reports-read.service.ts`
- `crm-v2-server/src/dashboard/dashboard.service.ts`
- `crm-v2-server/src/payments/payments.service.ts`

Recommended Fix:
Make all cash-collected metrics sum `payments.amount` by `payments.payment_date`, scoped through the related invoice/deal owner when required. Keep invoice `amount_paid` as a derived balance summary, not the source for period cash metrics.

Regression Test:
Add report tests with a partially paid invoice that has payment rows and no `paid_date`. Assert Sales Performance YTD cash equals the payment-ledger total and matches dashboard sales metrics for the same period/scope.

## Medium - Continued Scan Additions

### BUG-036 - Reports page exposes finance/export actions to roles the API denies

Severity: Medium

Status: High Confidence

Area: Reports / Frontend-Backend Contract / Authorization UX

Description:
The Reports route is available to admin, sales manager, and manager in navigation, while the reports component itself has no role-aware gating for finance or export controls. The page unconditionally starts the finance report query and renders export buttons for sales, pipeline, and collections reports. The server intentionally excludes `sales_rep` from finance and excludes both `manager` and `sales_rep` from export endpoints. This creates broken UI flows for roles that can reach the page directly or through navigation and leaves authorization behavior to failed API calls instead of clear role-aware page state.

Reproduction Steps:
1. Log in as a `manager`, or directly open `/reports` as any authenticated role that can route to the page.
2. Observe the frontend renders export controls and finance report UI without checking the current role.
3. Trigger an export as `manager`, or allow the finance query to run as an unauthorized role such as `sales_rep` via direct route access.
4. Observe the server-side role decorators deny those calls.

Expected Behaviour:
The reports page should only render tabs/actions the current role may use, and route guards should show a clear unauthorized state for roles that cannot use the page. Server authorization must remain authoritative.

Actual Behaviour:
The component always calls `useFinanceReportStats()` and renders `Finance Report` plus export buttons, while server decorators deny finance/export calls for some roles.

Evidence:
- `crm-v2-client/src/pages/reports/view-reports-page.tsx:99` calls `useFinanceReportStats()` unconditionally.
- `crm-v2-client/src/pages/reports/view-reports-page.tsx:111` always renders the `Finance Report` tab.
- `crm-v2-client/src/pages/reports/view-reports-page.tsx:117`, `:189`, and `:306` render export buttons.
- `crm-v2-client/src/api/reports/use-report-export.ts:12` calls `/reports/export/:type` with no role gating.
- `crm-v2-server/src/reports/reports.controller.ts:54` allows finance only for `admin`, `sales_manager`, and `manager`.
- `crm-v2-server/src/reports/reports.controller.ts:61`, `:82`, and `:100` allow exports only for `admin` and `sales_manager`.
- `crm-v2-client/src/App.tsx:130` mounts `/reports` behind login-only routing.

Impact:
Users encounter visible actions that fail, producing confusing operational UX and support tickets. This is also another example of the frontend relying on server errors instead of explicit role-aware states for sensitive workflows.

Suspected Root Cause:
Reports permissions evolved on the backend without equivalent frontend route/action gating.

Relevant Files:
- `crm-v2-client/src/pages/reports/view-reports-page.tsx`
- `crm-v2-client/src/api/reports/use-report-export.ts`
- `crm-v2-client/src/App.tsx`
- `crm-v2-server/src/reports/reports.controller.ts`

Recommended Fix:
Add role-aware route/action metadata for reports. Hide or disable finance/export controls for unauthorized roles and provide a clear unauthorized state for direct URL access. Keep backend `@Roles` decorators as the final enforcement layer.

Regression Test:
Add frontend role-render tests for admin, sales_manager, manager, and sales_rep on `/reports`, plus API tests proving denied roles receive 403 from finance/export endpoints.

### BUG-037 - Dashboard Specific Date filter sends fields the backend ignores, so one-day views show month-to-date metrics

Severity: Medium

Status: Confirmed

Area: Dashboard / Metrics / Frontend-Backend Contract

Description:
The dashboard filter UI labels the custom option as `Specific Date` and stores the selected day in `customStartDate` / `customEndDate`. Every dashboard hook passes that object directly as query params. The backend DTO and `DashboardService.getDateRange()` expect `startDate` / `endDate`. As a result, selecting a specific date sends unknown parameter names and the backend falls back to its default MTD window for custom ranges.

Reproduction Steps:
1. Use the Dashboard filter and choose `Specific Date`.
2. Select a date such as `2026-08-20`.
3. Observe the client sends `dateRange=custom&customStartDate=...&customEndDate=...`.
4. Compare raw one-day totals to the backend fallback MTD totals.

Expected Behaviour:
Specific Date should show only the selected day's dashboard metrics.

Actual Behaviour:
The selected date is ignored by the main dashboard endpoints. On the restored backup, `2026-08-20` has `0.00` payments and `0` new leads, while the ignored-custom MTD window shows `7800.00` payments and `4` new leads.

Evidence:
- `crm-v2-client/src/components/dashboard/dashboard-filters.tsx:57` and `:58` set `customStartDate` and `customEndDate`.
- `crm-v2-client/src/components/dashboard/dashboard-filters.tsx:77` and `:78` set the same fields after date picker changes.
- `crm-v2-client/src/api/dashboard/use-dashboard.ts:62` sends `filters` directly as query params.
- `crm-v2-server/src/dashboard/dto/dashboard-filters.dto.ts:23` expects `startDate`.
- `crm-v2-server/src/dashboard/dto/dashboard-filters.dto.ts:28` expects `endDate`.
- `crm-v2-server/src/dashboard/dashboard.service.ts:101` to `:106` falls back to MTD/current end when `startDate/endDate` are missing.
- Backup reconciliation: selected-day payments `0.00` vs ignored-custom MTD payments `7800.00`; selected-day new leads `0` vs ignored-custom MTD new leads `4`.

Impact:
Mr Dube or a manager can select a single date and see values that visually look like daily performance but are actually month-to-date. This can make daily coaching, reconciliations, and screenshots misleading.

Suspected Root Cause:
Frontend filter field names drifted from backend DTO names.

Relevant Files:
- `crm-v2-client/src/components/dashboard/dashboard-filters.tsx`
- `crm-v2-client/src/api/dashboard/use-dashboard.ts`
- `crm-v2-client/src/api/dashboard/types.ts`
- `crm-v2-server/src/dashboard/dto/dashboard-filters.dto.ts`
- `crm-v2-server/src/dashboard/dashboard.service.ts`

Recommended Fix:
Normalize the dashboard filter contract. Either send `startDate/endDate` from the client or accept/transform `customStartDate/customEndDate` on the backend. Add tests that assert specific-date payloads change the returned metric window.

Regression Test:
Add a frontend/API contract test that selects a specific date and verifies `/dashboard/kpis`, `/dashboard/sales-metrics`, `/dashboard/lead-conversion`, and related widgets receive and honor a one-day `startDate/endDate` range.

### BUG-038 - Dashboard Product filter is visible but not applied by backend metrics

Severity: Medium

Status: High Confidence

Area: Dashboard / Metrics / UX Contract

Description:
The dashboard filter bar exposes a Product filter and stores it as `productCategory`, but the backend dashboard DTO does not define that field and dashboard service methods do not apply any product/category predicate. Users can select product filters expecting every visual metric to narrow, but the returned data remains unfiltered.

Reproduction Steps:
1. Open the executive dashboard.
2. Select a Product filter such as `Board`, `Tablet`, or `LMS`.
3. Observe every dashboard hook sends `productCategory`.
4. Inspect backend DTO/service: no dashboard aggregation consumes this field.

Expected Behaviour:
A visible product filter should either affect relevant widgets or be absent/disabled.

Actual Behaviour:
The filter changes query keys and UI state, but backend metrics ignore it.

Evidence:
- `crm-v2-client/src/components/dashboard/dashboard-filters.tsx:81` to `:99` defines and updates `productCategory`.
- `crm-v2-client/src/components/dashboard/dashboard-filters.tsx:183` renders the Product select.
- `crm-v2-client/src/api/dashboard/types.ts:17` includes `productCategory`.
- `crm-v2-server/src/dashboard/dto/dashboard-filters.dto.ts` only defines `dateRange`, `startDate`, `endDate`, `salesRepId`, and `province`.
- Repository search found no use of `filters.productCategory` in `crm-v2-server/src/dashboard`.

Impact:
The dashboard can visually imply product-level analytics while showing all-product numbers. This is a high-confusion risk for demos and product-owner reviews.

Suspected Root Cause:
The frontend filter was added before backend product scoping was implemented.

Relevant Files:
- `crm-v2-client/src/components/dashboard/dashboard-filters.tsx`
- `crm-v2-client/src/api/dashboard/types.ts`
- `crm-v2-server/src/dashboard/dto/dashboard-filters.dto.ts`
- `crm-v2-server/src/dashboard/dashboard.service.ts`

Recommended Fix:
Either remove the Product filter until product scoping is defined, or add a backend `productCategory`/`productId` filter and apply it consistently to metrics where the relationship is meaningful.

Regression Test:
Add dashboard tests proving product-filtered results differ from unfiltered results when fixture data contains multiple product categories.

### BUG-039 - Demo dashboard metrics underreport restored historical demos after moving to structured demo activity types

Severity: Medium

Status: Confirmed

Area: Dashboard / Activity Metrics / Data Migration

Description:
The current dashboard services count demos using structured `demo_booking` and `demo_delivery` activity types. The restored backup schema supports those enum values, but the historical data has zero rows of any structured demo type. There are 42 completed activities whose subjects contain "demo". Therefore the current Demo Stats and Activity Discipline demo cards can show zero demos held even though historical demo activity exists in the CRM.

Reproduction Steps:
1. Use the restored backup database.
2. Count rows where `type IN ('demo_booking','demo_delivery','demo_followup')`.
3. Count completed activities where `subject ILIKE '%demo%'`.
4. Compare those raw counts to the dashboard formulas.

Expected Behaviour:
Historical demo metrics should either be migrated into structured demo activity types or the dashboard should clearly limit the visual to post-migration structured demos.

Actual Behaviour:
The backup contains `0` structured demo activity rows but `42` completed activities with demo-like subjects. Dashboard code counting `type='demo_delivery'` will show `0` completed demos/demos held.

Evidence:
- Read-only backup query: structured demo activity rows by type returned no rows.
- Read-only backup query: completed activities with `subject ILIKE '%demo%'` returned `42`.
- Example subjects include `Demo date set for 14th Jan`, `Demo booked for the second week. Date to be advised.`, and `Demo date agreed, 21st Jan.`
- `crm-v2-server/src/dashboard/dashboard.service.ts:771` filters completed demos to `a.type = 'demo_delivery'`.
- `crm-v2-server/src/dashboard/activity-discipline.service.ts:415` counts `Demos Held` using `a.type = 'demo_delivery'`.

Impact:
Demo activity can visually disappear from management dashboards after the structured-type migration. Users who know demos happened will distrust the dashboard.

Suspected Root Cause:
The code migrated from subject-based demo detection to structured activity types without a historical data backfill or visual disclaimer.

Relevant Files:
- `crm-v2-server/src/dashboard/dashboard.service.ts`
- `crm-v2-server/src/dashboard/activity-discipline.service.ts`
- `crm-v2-server/src/activities/entities/activity.entity.ts`

Recommended Fix:
Backfill historical demo activities into `demo_booking`, `demo_delivery`, or `demo_followup` where confidence is high, and mark ambiguous rows for review. Alternatively scope dashboard labels to "Structured demos" until backfill is complete.

Regression Test:
Add a restored-data integrity check that fails if demo-like historical rows exist but no structured demo rows exist after migration.

### BUG-041 - Multi-role sales manager/rep users get inconsistent dashboard scope across metric widgets

Severity: Medium

Status: Confirmed

Area: Dashboard / Roles / Metrics

Description:
A user holding both `sales_manager` and `sales_rep` receives inconsistent metric scope depending on which dashboard/report endpoint is called. Several DashboardService-backed widgets derive the effective role by scanning the raw `roles[]` array and can treat the user as a sales rep, producing self-scoped/zero metrics. The Activity Discipline controller and Reports controller use different role logic and treat the same user as an oversight/sales-manager user, producing team-wide metrics.

Reproduction Steps:
1. Use a restored-backup user with roles `sales_manager,sales_rep`.
2. Call DashboardService-backed endpoints such as `/dashboard/kpis?dateRange=ytd`, `/dashboard/sales-metrics?dateRange=ytd`, `/dashboard/leads-by-stage?dateRange=ytd`, `/dashboard/sla-compliance?dateRange=ytd`, and `/dashboard/lead-conversion?dateRange=ytd`.
3. Call `/dashboard/activity-discipline?dateRange=mtd` and `/reports/sales-performance?period=year` with the same token.
4. Compare whether the results are self-scoped or team-wide.

Expected Behaviour:
Multi-role users should have one consistent dashboard context. If `sales_manager` outranks `sales_rep`, all relevant dashboard/report metrics should use sales-manager scope unless the user explicitly switches context.

Actual Behaviour:
The multi-role user returned zeros/self-scope for several dashboard widgets, but team scope for Activity Discipline and Reports.

Evidence:
- Runtime role-scope probe for `audit.multi@example.test` returned `cash=0`, `principal=0`, `pipeline=0`, and `qualification.totalLeads=0` from `/dashboard/kpis?dateRange=ytd`.
- The same token returned `cashCollected=0` and `principalSold=0` from `/dashboard/sales-metrics?dateRange=ytd`.
- The same token returned an empty list from `/dashboard/leads-by-stage?dateRange=ytd` and `total=0` from `/dashboard/sla-compliance?dateRange=ytd`.
- The same token returned team Activity Discipline scope with `denom=320` and `reps=10`.
- The same token returned team Sales Performance report totals: `totalPrincipalSold=280165`, `cashCollected=126100`, and `outstanding=540658.5`.
- `crm-v2-server/src/dashboard/dashboard.controller.ts:74` implements separate `getUserInfo()` role derivation.
- `crm-v2-server/src/dashboard/dashboard.controller.ts:78` finds a representative role from the raw roles array.
- `crm-v2-server/src/dashboard/dashboard.controller.ts:106` to `:116` uses a different oversight-role check for Activity Discipline.
- `crm-v2-server/src/auth/strategies/jwt.strategy.ts:85` to `:89` derives `sales_manager` precedence for `@CurrentUser('role')`, which Reports uses.

Impact:
The same user can see conflicting visual totals on the dashboard and reports page. In a demo or daily review, this makes the CRM look unreliable even when individual formulas are internally consistent.

Suspected Root Cause:
Role precedence and context switching are duplicated across controllers instead of using one shared effective-role/context policy.

Relevant Files:
- `crm-v2-server/src/dashboard/dashboard.controller.ts`
- `crm-v2-server/src/auth/strategies/jwt.strategy.ts`
- `crm-v2-server/src/reports/reports.controller.ts`

Recommended Fix:
Centralize effective role/context resolution. Use explicit role switching for multi-role users or a deterministic precedence order shared by all metric controllers. Add tests for `sales_manager + sales_rep` users across all dashboard/report metrics.

Regression Test:
Add API tests for a multi-role sales manager/rep account asserting consistent scope across `/dashboard/kpis`, `/dashboard/sales-metrics`, `/dashboard/activity-discipline`, and `/reports/sales-performance`.

### BUG-042 - Duplicate payment retries create duplicate payment rows

Severity: High

Status: Confirmed

Area: Payments / Finance / Idempotency / Data Integrity

Description:
`POST /api/v2/payments` accepts two identical payment submissions with the same invoice, amount, payment date, method, and reference. There is no idempotency key, no unique reference constraint, and no retry detection. A double-click, retry after timeout, or replay can therefore create duplicate payment rows and inflate invoice `amount_paid`.

Reproduction Steps:
1. Start the local API against the restored backup DB.
2. Create an audit invoice for `100.00`.
3. Record a `10.00` payment with reference `FIN-LIFE-20260827142715-DUPLICATE`.
4. Send the exact same payment request again.
5. Query payments for that reference.

Expected Behaviour:
The second identical submission should be rejected as a duplicate, treated idempotently, or require an explicit distinct transaction reference according to finance policy.

Actual Behaviour:
Both requests return HTTP 201 and two payment rows are stored.

Evidence:
- Finance lifecycle probe tag: `FIN-LIFE-20260827142715`.
- First duplicate payment returned HTTP 201 with payment `6aaa0f77-373a-4677-b29c-c5b2a9c78c78`.
- Second duplicate payment returned HTTP 201 with payment `80733df0-ffd8-4eab-bdbe-53a4b3284a7b`.
- Direct DB summary: `duplicate_reference_count = 2`, `duplicate_reference_total = 20.00`.
- The invoice snapshot moved from `amount_paid = 40.00` after the first partial payment to `amount_paid = 60.00` after the duplicate retry pair.
- Code path: payment create generates or accepts a reference at `crm-v2-server/src/payments/payments.service.ts:269`; amount validation is present at `crm-v2-server/src/payments/payments.service.ts:267` but duplicate/reference idempotency is not enforced.

Impact:
Users can accidentally overstate collections through double-clicks, browser retries, network retry behavior, or manual replay. Finance dashboards, invoice balances, commission/collections reports, and customer statements can become wrong.

Suspected Root Cause:
Payment creation validates amount against current outstanding balance but does not model client request idempotency or enforce uniqueness for external transaction references.

Relevant Files:
- `crm-v2-server/src/payments/payments.service.ts`
- `crm-v2-server/src/payments/entities/payment.entity.ts`
- `crm-v2-server/src/payments/dto/create-payment.dto.ts`

Recommended Fix:
Require an idempotency key for payment creation and/or enforce a scoped unique constraint on normalized external payment reference, payment method, and invoice. Return the existing payment for exact retry, and reject conflicting reuse of the same reference.

Regression Test:
Add an API test that submits the same payment twice in sequence and concurrently. Assert only one payment row exists and invoice `amount_paid` changes once.

### BUG-043 - Paid or partially paid invoices can be cancelled and then resurrected by payment edits

Severity: High

Status: Confirmed

Area: Invoices / Payments / Business Logic / State Machine

Description:
`PATCH /api/v2/invoices/:id/status` allows an invoice with existing payments to be set to `Cancelled`. The invoice then holds contradictory state: `status = Cancelled`, `payment_status = Partial`, and `amount_paid > 0`. Later payment updates/deletes recalculate payment status and overwrite the cancellation, changing the invoice back to `Paid` or `Partially-Paid`. Cancellation is therefore not a protected terminal state.

Reproduction Steps:
1. Create an audit invoice for `100.00`.
2. Record payments totaling `60.00`.
3. Call `PATCH /api/v2/invoices/{invoiceId}/status` with `{ "status": "Cancelled" }`.
4. Update one existing payment from `40.00` to `95.00`.
5. Delete that updated payment.
6. Query the invoice after each step.

Expected Behaviour:
Invoices with payments should not be cancellable without a formal reversal/refund/credit process. Once cancelled, later payment edits should not silently resurrect or reclassify the invoice.

Actual Behaviour:
The cancellation request returns HTTP 200 and leaves `status = Cancelled`, `payment_status = Partial`, `amount_paid = 60.00`. Updating a payment after cancellation returns HTTP 200, overpays the invoice to `amount_paid = 115.00`, and changes the invoice to `status = Paid`. Deleting that payment returns HTTP 200 and changes the invoice to `status = Partially-Paid`.

Evidence:
- Finance lifecycle probe tag: `FIN-LIFE-20260827142715`.
- Invoice `c52d361c-7997-4bff-ab89-fec7e1b963c4` / `INV-2026-0078` was paid to `60.00` against total `100.00`.
- `PATCH /api/v2/invoices/c52d361c-7997-4bff-ab89-fec7e1b963c4/status` with `Cancelled` returned HTTP 200.
- DB snapshot after cancellation: `status = Cancelled`, `payment_status = Partial`, `amount_paid = 60.00`.
- `POST /payments` against the cancelled invoice correctly returned HTTP 400, but `PUT /payments/7adad736-ca73-4864-b1c2-8a5843c611d5` to `95.00` returned HTTP 200.
- DB snapshot after payment update: `status = Paid`, `payment_status = Paid`, `amount_paid = 115.00`.
- `DELETE /payments/7adad736-ca73-4864-b1c2-8a5843c611d5` returned HTTP 200 and DB snapshot then showed `status = Partially-Paid`, `payment_status = Partial`, `amount_paid = 20.00`.
- Code path: status update at `crm-v2-server/src/invoices/invoices.controller.ts:186`; direct assignment at `crm-v2-server/src/invoices/invoices.service.ts:478` and `crm-v2-server/src/invoices/invoices.service.ts:491`; payment update/recalculation at `crm-v2-server/src/payments/payments.service.ts:619`, `crm-v2-server/src/payments/payments.service.ts:629`, `crm-v2-server/src/payments/payments.service.ts:630`, and `crm-v2-server/src/payments/payments.service.ts:648`.

Impact:
Finance users can produce contradictory invoice states and later erase cancellation state accidentally through routine payment maintenance. Cancelled invoices can re-enter revenue/reporting as paid or partially paid, and overpayment behavior from `BUG-017` becomes reachable even after cancellation.

Suspected Root Cause:
Invoice lifecycle status and payment-derived status are stored in the same mutable `status` column, while cancellation lacks guards against existing payments and recalculation does not respect terminal business states.

Relevant Files:
- `crm-v2-server/src/invoices/invoices.controller.ts`
- `crm-v2-server/src/invoices/invoices.service.ts`
- `crm-v2-server/src/payments/payments.service.ts`

Recommended Fix:
Separate immutable business lifecycle from derived payment state or make recalculation terminal-state aware. Block cancellation when payments exist unless a controlled reversal workflow is completed. Block payment update/delete on cancelled/voided invoices except through reversal logic.

Regression Test:
Add state-machine tests for Draft/Sent/Partial/Paid/Cancelled transitions. Assert invoices with payments cannot be cancelled directly and that payment edits cannot overwrite a terminal cancellation state.

### BUG-045 - Duplicate payment-entry approval requests become duplicate real payments

Severity: High

Status: Confirmed

Area: Payments / Approval Queue / Finance / Idempotency

Description:
Sales reps submit payments through the manager approval queue. The queue correctly subtracts pending request totals from the invoice's available balance, but it does not detect exact duplicate submissions with the same invoice, amount, date, method, and reference. A rep can submit the same payment request twice, both appear as pending, and a manager can approve both. Each approval creates a separate `payments` row with the same reference.

Reproduction Steps:
1. Start the local API against the restored backup DB.
2. Create a rep-owned invoice for `200.00`.
3. As the rep, submit a payment-entry request for `50.00` with reference `FIN-FLOWS-20260827143651-PAYREQ`.
4. Submit the same request again with the same reference.
5. As sales manager, approve the first request.
6. As sales manager, approve the second request.
7. Query `payment_entry_requests`, `payments`, and the invoice.

Expected Behaviour:
The second identical payment-entry request should be rejected or treated idempotently. If the same external reference is reused, approval should not create a second real payment unless it is explicitly marked as a separate transaction.

Actual Behaviour:
Both payment-entry requests are accepted and both can be approved. Two real payment rows are created with the same reference, and invoice `amount_paid` increases twice.

Evidence:
- Finance flows probe tag: `FIN-FLOWS-20260827143651`.
- Rep-owned invoice `ff58ab5b-be1a-4159-917e-4e6f8663e353` / `INV-2026-0081`, total `200.00`.
- First rep request returned HTTP 201: `0f563407-a2fb-400b-935b-00502342e75a`.
- Second identical rep request returned HTTP 201: `bb5f9c15-94e9-43d4-a70f-bd7130fbacc9`.
- Pending summary after submission: `count = 2`, `total = 100.00`.
- First approval returned HTTP 200 and created payment `21ba0703-7b26-4ba6-91c8-64ff85796554`.
- Second approval returned HTTP 200 and created payment `a82b9604-e19b-4dbb-9261-0708eca7f6b4`.
- Direct DB verification showed both payment requests `approved`, both linked to distinct resulting payments, and both payments had reference `FIN-FLOWS-20260827143651-PAYREQ`.
- Invoice snapshot after both approvals: `total = 200.00`, `amount_paid = 100.00`.
- Code path: `crm-v2-server/src/payments/payments.service.ts:192` creates payment-entry requests; `:203` subtracts pending totals but does not de-duplicate exact requests; `:143` to `:160` approves requests and posts payments; payment-entry `reference` has no unique constraint at `crm-v2-server/src/payments/entities/payment-entry-request.entity.ts:49`.

Impact:
The approval queue can inflate collections through double-clicks, retries, or repeated submissions. Managers may approve duplicate-looking entries during busy queue processing, causing incorrect cash collected, invoice balances, reports, and customer statements.

Suspected Root Cause:
The approval queue tracks aggregate pending value but lacks idempotency and duplicate-reference rules at both request creation and approval time.

Relevant Files:
- `crm-v2-server/src/payments/payments.service.ts`
- `crm-v2-server/src/payments/entities/payment-entry-request.entity.ts`
- `crm-v2-server/src/payments/entities/payment.entity.ts`

Recommended Fix:
Add idempotency keys to payment-entry request creation. Enforce a scoped unique policy for external payment references across pending/approved requests and resulting payments. At approval time, re-check for duplicate references and exact duplicate approved payments before creating the payment.

Regression Test:
Add API tests where a sales rep submits the same payment-entry request twice, then a manager attempts to approve both. Assert the second request or second approval is rejected and only one payment row exists.

## Potential Risks - Continued Scan Additions

### RISK-013 - Calendar/video OAuth state is stored only in process memory

Status: Potential Risk

Area: Integrations / Deployment / Session State

Description:
Calendar and video connection flows store pending OAuth `state` nonces in an in-memory `Map`. The comments acknowledge this is only safe for a single instance. On multi-instance/serverless deployments or after a process restart, a valid OAuth callback can land on an instance that does not hold the state and fail with "unknown or expired"; in-memory state also prevents reliable horizontal scaling of integrations.

Evidence:
`crm-v2-server/src/calendar-sync/services/calendar-sync.service.ts:63` and `crm-v2-server/src/video-integrations/services/video-integrations.service.ts:56` store `pendingStates` in a local `Map`.

### RISK-014 - User email credential encryption falls back instead of failing closed when key is missing

Status: Potential Risk

Area: Security / Secrets / User Email

Description:
`CredentialsCipher` logs a warning and derives an encryption key from JWT secret or a literal development key when `USER_EMAIL_CREDENTIALS_KEY` is absent. This keeps local development convenient, but in production it can silently encrypt SMTP/OAuth credentials under the wrong key and make rotation/incident response harder. It also treats non-`gcm:` blobs as cleartext during decrypt.

Evidence:
`crm-v2-server/src/user-email/services/credentials-cipher.service.ts:26` checks `USER_EMAIL_CREDENTIALS_KEY`; `:30` falls back to JWT secret or `crm-dev-key`; `:58` returns cleartext blobs unchanged.


---

# Consolidated Source: AUDIT_COVERAGE_V2.md

# Audit Coverage V2

Second-pass exhaustive inventory generated on 2026-08-26. Discovery only: no production fixes intentionally applied.

## Linked Audit Documents

| Document | Purpose |
| --- | --- |
| `SYSTEM_AUDIT.md` | Master bug ledger and first/second-pass finding detail. Current counts: Critical 4, High 20, Medium 18, Low 3, Potential Risks 14. |
| `WHAT_CAN_BE_IMPROVED.md` | Consolidated repair and efficiency plan derived from `SYSTEM_AUDIT.md` and this coverage matrix. |
| `POST_AUDIT_SCAN_RESULTS.md` | Local backup/public-export/dependency scan follow-up performed after repo publication. |
| `METRIC_AUDIT.md` | Local-only dashboard/report metric reconciliation focused on visual correctness. |

## Improvement Themes

The full improvement brief is in `WHAT_CAN_BE_IMPROVED.md`. The highest-impact work is:

1. Stabilize finance/data integrity around payments, invoices, allocations, and payment terms.
2. Enforce authorization consistently on the server, especially dashboard/report aggregates and ownership guards.
3. Make workflow transitions transactional so failed requests cannot leave partial SLA/status/payment state.
4. Add database constraints for business invariants currently enforced only in service code.
5. Complete or hide stubbed calendar/video integrations.
6. Add browser regression coverage for role navigation, forms, responsive behavior, and theme/UI states.
7. Improve performance through route-level code splitting, dashboard query consolidation, indexes, and pagination.

## Surface Counts

| Surface | Count |
| --- | ---: |
| Backend controllers | 41 |
| Backend HTTP handler decorators | 344 |
| Frontend routes | 47 |
| Entity files | 68 |
| Service files | 70 |
| DTO files | 105 |
| Migrations | 24 |

## Exact Coverage

| Surface | Inventory Coverage | Runtime Coverage | Notes |
| --- | ---: | ---: | --- |
| Backend routes | 344 / 344 (100%) | Targeted, not exhaustive | Every executable controller handler is listed below. Runtime was limited to existing tests/build/read-only database forensics and selected static proof paths. |
| Frontend routes | 47 / 47 (100%) | Static only | No Playwright/Cypress/Puppeteer/Vitest browser harness is declared in either app package. |
| Database entities | 68 / 68 (100%) | Read-only forensic queries | Entity files inventoried; selected restored-data invariant queries executed. |
| Schedulers/background jobs | 7 / 7 (100%) | Static + prior runtime scheduler observation | Cron decorators/jobs inventoried; local auto-run was already recorded as BUG-019. |
| Integrations/webhooks | 5 / 5 (100%) | Static only, no external sends | Calendar/video/email/blob/WhatsApp paths inspected without sending production messages. |

## Second-Pass New Findings

| ID | Severity | Status | Area | Summary |
| --- | --- | --- | --- | --- |
| BUG-020 | High | High Confidence | Calendar Sync / Webhooks | Public calendar webhook can trigger full sync without implemented signature validation. |
| BUG-021 | High | High Confidence | Integrations | Calendar/video integrations are exposed in UI but provider adapters are stubs. |
| BUG-022 | High | High Confidence | XSS / Email Templates | Template preview renders stored HTML via `dangerouslySetInnerHTML` without sanitizing template body. |
| BUG-023 | High | Confirmed | Finance / Data Integrity | 28 payment rows have allocation summary columns inconsistent with allocation rows. |
| BUG-024 | Medium | High Confidence | Scheduling / Timezone | Scheduling availability ignores link timezone and uses UTC day/hour math. |
| BUG-025 | Medium | High Confidence | Notifications | Notification entity filtering uses `entityId` instead of mapped `entity_id`. |
| BUG-026 | Medium | Confirmed | Contacts / Data Integrity | Restored data contains 49 duplicate contact-email groups and 86 duplicate phone groups. |
| BUG-027 | Low | Confirmed | Database Integrity | 5 invoices have `created_at > updated_at`. |
| BUG-028 | High | High Confidence | Payment Terms / Idempotency | Applying payment terms is check-before-insert with no unique DB constraint. |
| BUG-029 | High | Confirmed | Dashboard / Authorization | Most dashboard aggregate endpoints are available to any authenticated role. |
| BUG-030 | Medium | High Confidence | Notifications / Validation | Notification preference API uses interfaces and varchar columns, accepting invalid event/channel/severity values. |
| BUG-031 | Medium | High Confidence | Dashboard / Metrics | Discipline metrics still use brittle subject text matching for demo/proposal counts. |
| BUG-032 | High | High Confidence | Security / Repository Hygiene | Public export includes helper scripts with fixed credentials and direct DB mutation paths. |
| BUG-033 | High | Confirmed | Dependency Security | Production dependency audits report critical/high vulnerabilities in both app packages. |
| BUG-034 | High | High Confidence | File Manager / Authorization | Sales reps can attach file metadata to arbitrary CRM records without parent access checks. |
| BUG-035 | High | High Confidence | Cash Requisitions / Authorization | Operators can create requisitions against arbitrary leads/deals without ownership checks. |
| BUG-036 | Medium | High Confidence | Reports / Frontend Contract | Reports UI exposes finance/export actions to roles the API denies. |
| BUG-037 | Medium | Confirmed | Dashboard / Metrics | Specific Date filter sends ignored fields, so one-day views fall back to MTD. |
| BUG-038 | Medium | High Confidence | Dashboard / Metrics | Product filter is visible but not applied by backend dashboard metrics. |
| BUG-039 | Medium | Confirmed | Dashboard / Demo Metrics | Structured demo metrics show zero against restored data with 42 demo-like completed activities. |
| BUG-040 | High | Confirmed | Reports / Finance Metrics | Sales Performance undercounts YTD cash collected by 58,900 versus the payment ledger. |
| BUG-041 | Medium | Confirmed | Dashboard / Roles | Multi-role sales manager/rep users get inconsistent self/team metric scope across widgets. |
| BUG-042 | High | Confirmed | Payments / Idempotency | Duplicate payment retries with the same reference create duplicate payment rows and inflate invoice paid totals. |
| BUG-043 | High | Confirmed | Invoices / Payments | Paid or partially paid invoices can be cancelled, then payment edits/deletes resurrect or reclassify them. |
| BUG-044 | Critical | Confirmed | Invoices / Payments | Deleting an invoice with payments succeeds and cascades away the payment records. |
| BUG-045 | High | Confirmed | Payments / Approval Queue | Duplicate payment-entry approval requests become duplicate real payments with the same reference. |
| RISK-013 | Potential Risk | Potential Risk | Integrations / Deployment | Calendar/video OAuth state lives only in process memory. |
| RISK-014 | Potential Risk | Potential Risk | Security / Secrets | User-email credential encryption falls back instead of failing closed when key is missing. |

## Runtime Probe: Finance Flows 2-5

Executed against the restored local backup DB on 2026-08-27 using local-only audit JWT sessions and the local API on `127.0.0.1:3001`.

| Requested Area | Runtime Coverage | Result |
| --- | --- | --- |
| Payment-entry approval queue | Rep-created payment-entry requests, duplicate request, manager approval, repeat approval, direct DB verification | New `BUG-045` confirmed. Duplicate requests with the same reference can both be approved into separate real payments. Repeat approval of the same request is blocked with 409. |
| Quote to invoice conversion | Draft quote creation/conversion, duplicate conversion of same quote, DB invoice count by quote id | Duplicate conversion of the same quote is blocked. Draft quote conversion returned HTTP 201; code comments indicate this is currently intentional because historical CRM data used Draft conversions, so this was not recorded as a bug without product-rule confirmation. |
| Payment terms / installments | Apply active payment term to invoice, repeat apply, schedule endpoint, DB counts for applied terms/child invoices/installments | Repeat apply is blocked. Applying `Buy4Pay2` created two child invoices and one applied term. No new defect recorded in this pass. |
| Cash requisitions | Create, submit, invalid early finance approval, duplicate submit, wrong-role manager approve, manager approve, duplicate manager approve, finance approve, reject after approval, mark paid, duplicate mark paid | State order and role checks behaved correctly in this probe. No new defect recorded in this pass. |

## Coverage Matrix

| Area | Tested | Result | Notes |
| --- | --- | --- | --- |
| Authentication | Yes | Static + existing tests | Auth tests passed; second pass did not re-run destructive auth probes. |
| Authorization | Yes | Static | RolesGuard, per-resource guards, controller decorators inspected. |
| Roles | Yes | Static | admin, admin_support, sales_manager, sales_rep, manager, finance mapped against controllers. |
| Multi-role behaviour | Yes | Static | JwtStrategy derives one representative role while RolesGuard uses all roles; owner-scope guards remain sensitive to derived role. |
| Tenant isolation | N/A single-org CRM | Static | No school tenant boundary implemented; ownership is mostly rep-vs-manager. |
| Database integrity | Yes | Read-only DB queries | Restored backup queried for finance/contact/timestamp anomalies. |
| APIs | Yes | 100% inventoried | 344 executable handler decorators inventoried; targeted runtime limited to tests/build/db. |
| Navigation | Yes | Static | 47 React routes inventoried from App.tsx. |
| Forms | Yes | Static | DTO/frontend contract reviewed for under-tested modules. |
| Business logic | Yes | Static + DB | Finance, scheduling, automation, requisition state machines reviewed. |
| Error handling | Yes | Static | Raw error surfaces and swallowed integration errors inspected. |
| UI | Yes | Static | Browser harness unavailable; React route/form/render paths inspected. |
| Responsive design | Static only | Limited | No browser test dependency present. |
| Theme handling | Static only | Limited | No visual browser run; components use shared tokens. |
| Security | Yes | Static + DB | Webhooks, XSS, IDOR guards, SMTP SSRF, secrets handling inspected. |
| Performance | Yes | Static + build | Client bundle 2.83 MB; scheduler/query risks noted. |
| Integrations | Yes | Static | Calendar/video/email/blob/WhatsApp integration paths inspected. |
| Schedulers | Yes | Static | Cron decorators inventoried; local auto-run already recorded in SYSTEM_AUDIT. |

## Endpoint Coverage Table

Parser note: roles are extracted from each controller method decorator block, including decorators that appear after the HTTP method decorator. Endpoints marked `auth default` have no endpoint-level `@Public()` or `@Roles()` decorator and rely on global authentication plus any controller/service guards.

| Module | Endpoint | Auth | Roles | Happy Path | Invalid Input | Unauthorized | Wrong Role | Invalid ID | State Edge Cases | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| activities | `DELETE /api/v2/activities/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `DELETE /api/v2/activities/attachments/:attachmentId` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `GET /api/v2/activities` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `GET /api/v2/activities/:id` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `GET /api/v2/activities/:id/attachments` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `GET /api/v2/activities/leads/:leadId/stats` | Authenticated | 'admin', 'manager', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `GET /api/v2/activities/summary` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `PATCH /api/v2/activities/:id/status` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `PATCH /api/v2/activities/bulk-status` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `POST /api/v2/activities` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `POST /api/v2/activities/:id/attachments` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `POST /api/v2/activities/:id/comments` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `POST /api/v2/activities/whatsapp/send` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activities | `PUT /api/v2/activities/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activity-logs | `GET /api/v2/activity-logs` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| activity-logs | `GET /api/v2/activity-logs/entity/:entity/:entityId` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| audit | `GET /api/v2/audit-logs` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| audit | `GET /api/v2/audit-logs/entity/:entityType/:entityId` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `GET /api/v2/auth/profile` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `GET /api/v2/auth/refresh` | Public | Public | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `POST /api/v2/auth/2fa/disable` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `POST /api/v2/auth/2fa/enable` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `POST /api/v2/auth/2fa/generate` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `POST /api/v2/auth/2fa/regenerate-backup-codes` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `POST /api/v2/auth/login` | Public | Public | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `POST /api/v2/auth/logout` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `POST /api/v2/auth/logout-all` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `POST /api/v2/auth/password/change` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `POST /api/v2/auth/password/request-reset` | Public | Public | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `POST /api/v2/auth/password/reset` | Public | Public | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| auth | `POST /api/v2/auth/register` | Public | Public | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `GET /api/v2/automation/assignment-proposals` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `GET /api/v2/automation/assignment-proposals/projection` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `GET /api/v2/automation/attribution/sources` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `GET /api/v2/automation/quote-draft/:dealId` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `PATCH /api/v2/automation/assignment-proposals/:id/approve` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `PATCH /api/v2/automation/assignment-proposals/:id/reject` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `POST /api/v2/automation/assignment-proposals/:id/redirect` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `POST /api/v2/automation/assignment-proposals/:id/to-new-leads` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `POST /api/v2/automation/assignment-proposals/approve-batch` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `POST /api/v2/automation/assignment-proposals/reject-batch` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `POST /api/v2/automation/assignment-proposals/run` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `POST /api/v2/automation/assignment-proposals/undo` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `POST /api/v2/automation/handoff/social-lead` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `POST /api/v2/automation/ingest/whatsapp` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| automation | `POST /api/v2/automation/rebalance` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| bug-reports | `GET /api/v2/bug-reports` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| bug-reports | `GET /api/v2/bug-reports/:id` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| bug-reports | `GET /api/v2/bug-reports/assignable-users` | Authenticated | ...TRIAGE | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| bug-reports | `GET /api/v2/bug-reports/counts` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| bug-reports | `PATCH /api/v2/bug-reports/:id` | Authenticated | ...TRIAGE | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| bug-reports | `POST /api/v2/bug-reports` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| calendar-sync | `DELETE /api/v2/calendar-sync/connections/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| calendar-sync | `GET /api/v2/calendar-sync/connections` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| calendar-sync | `GET /api/v2/calendar-sync/connections/callback` | Public | Public | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| calendar-sync | `POST /api/v2/calendar-sync/connections/:provider/begin` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| calendar-sync | `POST /api/v2/calendar-sync/webhook/:provider` | Public | Public | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| campaigns | `DELETE /api/v2/campaigns/:id` | Authenticated | ...CAMPAIGN_MANAGERS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| campaigns | `GET /api/v2/campaigns` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| campaigns | `GET /api/v2/campaigns/:id/leads` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| campaigns | `GET /api/v2/campaigns/:id/roi` | Authenticated | ...CAMPAIGN_MANAGERS, 'finance' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| campaigns | `GET /api/v2/campaigns/:id/spend` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| campaigns | `GET /api/v2/campaigns/:idOrSlug` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| campaigns | `PATCH /api/v2/campaigns/:id` | Authenticated | ...CAMPAIGN_MANAGERS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| campaigns | `POST /api/v2/campaigns` | Authenticated | ...CAMPAIGN_MANAGERS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `GET /api/v2/cash-requisitions` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `GET /api/v2/cash-requisitions/:id` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `GET /api/v2/cash-requisitions/deals/:dealId/summary` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `GET /api/v2/cash-requisitions/leads/:leadId/summary` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `GET /api/v2/cash-requisitions/reports/cost-to-close` | Authenticated | 'admin', 'manager', 'sales_manager', 'finance' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `PATCH /api/v2/cash-requisitions/:id` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `POST /api/v2/cash-requisitions` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `POST /api/v2/cash-requisitions/:id/finance-approve` | Authenticated | ...FINANCE_APPROVERS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `POST /api/v2/cash-requisitions/:id/finance-reject` | Authenticated | ...FINANCE_APPROVERS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `POST /api/v2/cash-requisitions/:id/manager-approve` | Authenticated | ...MANAGER_APPROVERS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `POST /api/v2/cash-requisitions/:id/manager-reject` | Authenticated | ...MANAGER_APPROVERS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `POST /api/v2/cash-requisitions/:id/mark-paid` | Authenticated | ...FINANCE_APPROVERS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| cash-requisitions | `POST /api/v2/cash-requisitions/:id/submit` | Authenticated | ...ALL_OPERATORS | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| contacts | `DELETE /api/v2/contacts/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| contacts | `GET /api/v2/contacts` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| contacts | `GET /api/v2/contacts/:id` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| contacts | `PATCH /api/v2/contacts/:id/restore` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| contacts | `POST /api/v2/contacts` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| contacts | `PUT /api/v2/contacts/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/activity-discipline` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/collections-due` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/compliance-report` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/demo-stats` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/discipline-metrics` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/funnel-health` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/high-value-deals` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/kpis` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/lead-conversion` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/leads-by-stage` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/leads-contacted` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/nurture-follow-ups` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/qualification-overview` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/sales-metrics` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/schools-bought` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/sla-compliance` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/top-performing-products` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| dashboard | `GET /api/v2/dashboard/top-selling-products` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `GET /api/v2/deal-rollback-requests` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `GET /api/v2/deals` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `GET /api/v2/deals/:id` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `GET /api/v2/deals/:id/health` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `GET /api/v2/deals/:id/rollback-requests` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `GET /api/v2/deals/archived` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `GET /api/v2/deals/export` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `GET /api/v2/deals/pipeline/:id` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `GET /api/v2/deals/summary` | Authenticated | 'admin', 'sales_manager', 'sales_rep', 'viewer' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `PATCH /api/v2/deals/:id/assignee` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `PATCH /api/v2/deals/:id/close` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `PATCH /api/v2/deals/:id/stage` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `PATCH /api/v2/deals/bulk-update` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `POST /api/v2/deal-rollback-requests/:id/review` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `POST /api/v2/deals` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `POST /api/v2/deals/:id/health/calculate` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `POST /api/v2/deals/:id/rollback-requests` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| deals | `PUT /api/v2/deals/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| email-sequences | `DELETE /api/v2/email-sequences/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| email-sequences | `GET /api/v2/email-sequences` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| email-sequences | `GET /api/v2/email-sequences/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| email-sequences | `GET /api/v2/email-sequences/queue` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| email-sequences | `POST /api/v2/email-sequences` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| email-sequences | `PUT /api/v2/email-sequences/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| file-manager | `DELETE /api/v2/file-manager/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| file-manager | `GET /api/v2/file-manager` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| file-manager | `GET /api/v2/file-manager/:id` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| file-manager | `GET /api/v2/file-manager/entity/:entityType/:entityId` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| file-manager | `PATCH /api/v2/file-manager/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| file-manager | `POST /api/v2/file-manager` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| file-manager | `POST /api/v2/file-manager/upload` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| invoices | `DELETE /api/v2/invoices/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| invoices | `DELETE /api/v2/invoices/:id/items/:itemId` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| invoices | `GET /api/v2/invoices` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| invoices | `GET /api/v2/invoices/:id` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| invoices | `GET /api/v2/invoices/:id/payment-schedule` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| invoices | `GET /api/v2/invoices/stats` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| invoices | `PATCH /api/v2/invoices/:id/status` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| invoices | `POST /api/v2/invoices` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| invoices | `POST /api/v2/invoices/:id/items` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| invoices | `POST /api/v2/invoices/convert-from-quote/:quoteId` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| invoices | `PUT /api/v2/invoices/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| invoices | `PUT /api/v2/invoices/:id/items/:itemId` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `DELETE /api/v2/leads/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `DELETE /api/v2/lead-sla/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `DELETE /api/v2/leads-qualification/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/duplicates` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/escalations/leads` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/lead-reversal-requests` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/lead-reversal-requests/mine` | Authenticated | 'sales_rep', 'sales_manager', 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads/:id` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads/:id/qualification` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads/:id/related` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads/:id/reversal-requests` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads/:id/stakeholders` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads/:leadId/escalations` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads/export` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads/import/batches` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads/import/batches/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads/status-counts` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/lead-sla` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/lead-sla/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/lead-sla/status/:status` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads-qualification` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads-qualification/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `GET /api/v2/leads-qualification/lead/:leadId` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `PATCH /api/v2/duplicates/:id/review` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `PATCH /api/v2/escalations/leads/:id/resolve` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `PATCH /api/v2/leads/:id/assign` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `PATCH /api/v2/leads/:id/restore` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `PATCH /api/v2/leads/:id/status` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `PATCH /api/v2/leads/bulk-update` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `PATCH /api/v2/leads/import/batches/:id/decisions` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `PATCH /api/v2/leads/import/batches/:id/rows/:rowNumber/region` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/duplicates` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/duplicates/:id/merge` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/duplicates/peek/contact` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/duplicates/peek/lead` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/duplicates/peek/school` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/duplicates/rebuild` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/duplicates/scan` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/lead-reversal-requests/:id/approve` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/lead-reversal-requests/:id/enquiry` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/lead-reversal-requests/:id/respond` | Authenticated | 'sales_rep', 'sales_manager', 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/leads` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/leads/:id/reversal-requests` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/leads/:id/stakeholders` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/leads/:leadId/escalations` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/leads/:survivorId/merge/:loserId` | Authenticated | 'admin', 'sales_manager', 'admin_support' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/leads/import` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/leads/import/batches/:id/approve` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/leads/import/batches/:id/reject` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/lead-sla` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/lead-sla/:id/restore` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `POST /api/v2/leads-qualification` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `PUT /api/v2/leads/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `PUT /api/v2/lead-sla/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| leads | `PUT /api/v2/leads-qualification/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `DELETE /api/v2/user-notifications/admin/:id` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `DELETE /api/v2/user-notifications/my-notifications` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `DELETE /api/v2/user-notifications/my-notifications/:notificationId` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `GET /api/v2/notification-preferences` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `GET /api/v2/user-notifications/admin/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `GET /api/v2/user-notifications/admin/all` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `GET /api/v2/user-notifications/my-notifications` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `GET /api/v2/user-notifications/my-notifications/unread-count` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `GET /api/v2/user-notifications/user/:userId` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `GET /api/v2/user-notifications/user/:userId/unread-count` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `PATCH /api/v2/notification-preferences/:eventType/:channel` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `PATCH /api/v2/user-notifications/my-notifications/mark-all-read` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `PATCH /api/v2/user-notifications/my-notifications/mark-as-read` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `POST /api/v2/notification-preferences` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `POST /api/v2/user-notifications` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| notifications | `POST /api/v2/user-notifications/send` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payments | `DELETE /api/v2/payments/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payments | `GET /api/v2/payments` | Authenticated | 'admin', 'sales_manager', 'sales_rep', 'manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payments | `GET /api/v2/payments/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep', 'manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payments | `GET /api/v2/payments/requests` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payments | `GET /api/v2/payments/statistics` | Authenticated | 'admin', 'sales_manager', 'sales_rep', 'manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payments | `GET /api/v2/payments/stats` | Authenticated | 'admin', 'sales_manager', 'sales_rep', 'manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payments | `PATCH /api/v2/payments/requests/:id/review` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payments | `POST /api/v2/payments` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payments | `PUT /api/v2/payments/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payment-terms | `DELETE /api/v2/payment-terms/:id` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payment-terms | `GET /api/v2/payment-terms` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payment-terms | `GET /api/v2/payment-terms/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payment-terms | `GET /api/v2/payment-terms/installments` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payment-terms | `GET /api/v2/payment-terms/schedule/:documentId` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payment-terms | `POST /api/v2/payment-terms` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payment-terms | `POST /api/v2/payment-terms/allocate/:paymentId` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payment-terms | `POST /api/v2/payment-terms/apply` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payment-terms | `POST /api/v2/payment-terms/calculate` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| payment-terms | `PUT /api/v2/payment-terms/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `DELETE /api/v2/pipelines/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `DELETE /api/v2/pipelines/:pipelineId/stages/:stageId` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `GET /api/v2/pipelines` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `GET /api/v2/pipelines/:id` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `GET /api/v2/pipelines/:pipelineId/stages` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `GET /api/v2/pipelines/:pipelineId/stages/:stageId` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `GET /api/v2/pipelines/default` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `PATCH /api/v2/pipelines/:id/set-default` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `PATCH /api/v2/pipelines/:pipelineId/stages/reorder` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `POST /api/v2/pipelines` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `POST /api/v2/pipelines/:pipelineId/stages` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `PUT /api/v2/pipelines/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| pipelines | `PUT /api/v2/pipelines/:pipelineId/stages/:stageId` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| products | `DELETE /api/v2/products/:id` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| products | `GET /api/v2/products` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| products | `GET /api/v2/products/:id` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| products | `PATCH /api/v2/products/:id/restore` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| products | `POST /api/v2/products` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| products | `PUT /api/v2/products/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| quotes | `DELETE /api/v2/quotes/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| quotes | `DELETE /api/v2/quotes/:id/items/:itemId` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| quotes | `GET /api/v2/quotes` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| quotes | `GET /api/v2/quotes/:id` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| quotes | `GET /api/v2/quotes/:id/pdf` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| quotes | `GET /api/v2/quotes/stats` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| quotes | `PATCH /api/v2/quotes/:id/status` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| quotes | `POST /api/v2/quotes` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| quotes | `POST /api/v2/quotes/:id/items` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| quotes | `POST /api/v2/quotes/:id/reissue` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| quotes | `PUT /api/v2/quotes/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| quotes | `PUT /api/v2/quotes/:id/items/:itemId` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `DELETE /api/v2/rbac/permissions/:permissionId` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `DELETE /api/v2/rbac/roles/:roleId` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `GET /api/v2/rbac/permissions` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `GET /api/v2/rbac/permissions/role` | Authenticated | 'admin', 'super_admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `GET /api/v2/rbac/permissions/role/:roleId` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `GET /api/v2/rbac/permissions/user/:userId` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `GET /api/v2/rbac/roles` | Authenticated | 'admin', 'super_admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `GET /api/v2/rbac/roles/:roleId` | Authenticated | 'admin', 'super_admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `PATCH /api/v2/rbac/permissions/:permissionId` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `PATCH /api/v2/rbac/roles/:roleId` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `PATCH /api/v2/rbac/roles/:roleId/permissions/:permissionId` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `POST /api/v2/rbac/permissions` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `POST /api/v2/rbac/roles` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `POST /api/v2/rbac/roles/:roleId/permissions/assign` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| rbac | `POST /api/v2/rbac/roles/:roleId/permissions/unassign` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| reports | `GET /api/v2/collections/aging-report` | Authenticated | 'admin', 'sales_manager', 'manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| reports | `GET /api/v2/reports/export/collections` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| reports | `GET /api/v2/reports/export/pipeline` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| reports | `GET /api/v2/reports/export/sales` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| reports | `GET /api/v2/reports/finance` | Authenticated | 'admin', 'sales_manager', 'manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| reports | `GET /api/v2/reports/pipeline-analysis` | Authenticated | 'admin', 'sales_manager', 'sales_rep', 'manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| reports | `GET /api/v2/reports/sales-performance` | Authenticated | 'admin', 'sales_manager', 'sales_rep', 'manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| scheduling | `DELETE /api/v2/scheduling-links/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| scheduling | `GET /api/v2/book/:slug` | Public | Public | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| scheduling | `GET /api/v2/scheduling-links` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| scheduling | `PATCH /api/v2/scheduling-links/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| scheduling | `POST /api/v2/book/:slug/confirm` | Public | Public | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| scheduling | `POST /api/v2/book/:slug/hold` | Public | Public | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| scheduling | `POST /api/v2/scheduling-links` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| schools | `DELETE /api/v2/schools/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| schools | `GET /api/v2/schools` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| schools | `GET /api/v2/schools/:id` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| schools | `GET /api/v2/schools/:id/stats` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| schools | `PATCH /api/v2/schools/:id/city` | Authenticated | auth default | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| schools | `PATCH /api/v2/schools/:id/restore` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| schools | `POST /api/v2/schools` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| schools | `POST /api/v2/schools/with-contacts` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| schools | `PUT /api/v2/schools/:id` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| settings | `DELETE /api/v2/settings/:key` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| settings | `DELETE /api/v2/settings/:key/hard` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| settings | `GET /api/v2/settings` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| settings | `GET /api/v2/settings/:key` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| settings | `GET /api/v2/settings/all` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| settings | `GET /api/v2/settings/category/:category` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| settings | `GET /api/v2/settings/public` | Public | Public | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| settings | `POST /api/v2/settings` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| settings | `POST /api/v2/settings/:key/restore` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| settings | `POST /api/v2/settings/bulk` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| sla | `GET /api/v2/sla/deal-breaches` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| sla | `GET /api/v2/sla/lead-breaches` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| sla | `POST /api/v2/sla/check-deal-breaches` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| sla | `POST /api/v2/sla/check-lead-breaches` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `DELETE /api/v2/email-templates/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `DELETE /api/v2/user-email/accounts/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `GET /api/v2/email-templates` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `GET /api/v2/email-templates/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `GET /api/v2/email-templates/:id/render` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `GET /api/v2/user-email/accounts` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `PATCH /api/v2/email-templates/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `PATCH /api/v2/user-email/accounts/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `POST /api/v2/email-templates` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `POST /api/v2/user-email/accounts/:id/test-send` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `POST /api/v2/user-email/accounts/:id/verify` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `POST /api/v2/user-email/accounts/smtp` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `POST /api/v2/user-email/send` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| user-email | `POST /api/v2/user-email/send/template` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| users | `DELETE /api/v2/users/:id` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| users | `GET /api/v2/users` | Authenticated | 'admin', 'sales_manager' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| users | `GET /api/v2/users/:id` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| users | `GET /api/v2/users/stats` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| users | `PATCH /api/v2/users/:id/activate` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| users | `POST /api/v2/users` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| users | `PUT /api/v2/users/:id` | Authenticated | 'admin' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| video-integrations | `DELETE /api/v2/video-integrations/connections/:id` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| video-integrations | `GET /api/v2/video-integrations/connections` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| video-integrations | `GET /api/v2/video-integrations/connections/callback` | Public | Public | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |
| video-integrations | `POST /api/v2/video-integrations/connections/:provider/begin` | Authenticated | 'admin', 'sales_manager', 'sales_rep' | Inventoried | Static DTO/schema review | Global guard/static | Decorator/static | ParseUUID/guard/static where present | Static plus targeted probes | Static inventoried |

## Frontend Route Inventory

| Route | Auth Surface | Coverage | Result |
| --- | --- | --- | --- |
| `/login` | Public | Static route/component inspection | Inventoried |
| `/forgot-password` | Public | Static route/component inspection | Inventoried |
| `/reset-password` | Public | Static route/component inspection | Inventoried |
| `/book/:slug` | Public | Static route/component inspection | Inventoried |
| `/` | Protected | Static route/component inspection | Inventoried |
| `/dashboard` | Protected | Static route/component inspection | Inventoried |
| `/change-password` | Protected | Static route/component inspection | Inventoried |
| `/leads` | Protected | Static route/component inspection | Inventoried |
| `/leads/new` | Protected | Static route/component inspection | Inventoried |
| `/leads/:id` | Protected | Static route/component inspection | Inventoried |
| `/schools` | Protected | Static route/component inspection | Inventoried |
| `/schools/:id` | Protected | Static route/component inspection | Inventoried |
| `/quotes` | Protected | Static route/component inspection | Inventoried |
| `/quotes/new` | Protected | Static route/component inspection | Inventoried |
| `/invoices` | Protected | Static route/component inspection | Inventoried |
| `/invoices/new` | Protected | Static route/component inspection | Inventoried |
| `/invoices/:id/schedule` | Protected | Static route/component inspection | Inventoried |
| `/invoice/:id/schedule` | Protected | Static route/component inspection | Inventoried |
| `/deals/:id` | Protected | Static route/component inspection | Inventoried |
| `/payments` | Protected | Static route/component inspection | Inventoried |
| `/collections` | Protected | Static route/component inspection | Inventoried |
| `/pipeline` | Protected | Static route/component inspection | Inventoried |
| `/tasks` | Protected | Static route/component inspection | Inventoried |
| `/activities` | Protected | Static route/component inspection | Inventoried |
| `/reports` | Protected | Static route/component inspection | Inventoried |
| `/whats-new` | Protected | Static route/component inspection | Inventoried |
| `/bug-reports` | Protected | Static route/component inspection | Inventoried |
| `/admin/settings` | Protected | Static route/component inspection | Inventoried |
| `/admin/finance-plans` | Protected | Static route/component inspection | Inventoried |
| `/admin/products` | Protected | Static route/component inspection | Inventoried |
| `/admin/users` | Protected | Static route/component inspection | Inventoried |
| `/admin/roles-permissions` | Protected | Static route/component inspection | Inventoried |
| `/admin/email-sequences` | Protected | Static route/component inspection | Inventoried |
| `/admin/email-templates` | Protected | Static route/component inspection | Inventoried |
| `/admin/approval-queue` | Protected | Static route/component inspection | Inventoried |
| `/admin/compliance-report` | Protected | Static route/component inspection | Inventoried |
| `/profile` | Protected | Static route/component inspection | Inventoried |
| `/profile/email-accounts` | Protected | Static route/component inspection | Inventoried |
| `/profile/calendar-connections` | Protected | Static route/component inspection | Inventoried |
| `/profile/video-connections` | Protected | Static route/component inspection | Inventoried |
| `/scheduling-links` | Protected | Static route/component inspection | Inventoried |
| `/requisitions` | Protected | Static route/component inspection | Inventoried |
| `/requisitions/:id` | Protected | Static route/component inspection | Inventoried |
| `/campaigns` | Protected | Static route/component inspection | Inventoried |
| `/campaigns/:id` | Protected | Static route/component inspection | Inventoried |
| `/management/escalations` | Protected | Static route/component inspection | Inventoried |
| `/management/duplicates` | Protected | Static route/component inspection | Inventoried |

## Entity Inventory

- `crm-v2-server\src\activities\entities\activity-attachments.entity.ts`
- `crm-v2-server\src\activities\entities\activity-comments.entity.ts`
- `crm-v2-server\src\activities\entities\activity.entity.ts`
- `crm-v2-server\src\activities\entities\call-outcome-tags.entity.ts`
- `crm-v2-server\src\activities\entities\calls.entity.ts`
- `crm-v2-server\src\activities\entities\demos.entity.ts`
- `crm-v2-server\src\activities\entities\emails.entity.ts`
- `crm-v2-server\src\activities\entities\meetings.entity.ts`
- `crm-v2-server\src\activities\entities\notes.entity.ts`
- `crm-v2-server\src\activities\entities\task-comments.entity.ts`
- `crm-v2-server\src\activities\entities\tasks.entity.ts`
- `crm-v2-server\src\activities\entities\whats-app.entity.ts`
- `crm-v2-server\src\activity-logs\entities\activity-log.entity.ts`
- `crm-v2-server\src\audit\entities\audit-log.entity.ts`
- `crm-v2-server\src\auth\entities\account-security.entity.ts`
- `crm-v2-server\src\auth\entities\auth-session.entity.ts`
- `crm-v2-server\src\auth\entities\permission.entity.ts`
- `crm-v2-server\src\auth\entities\role-permission.entity.ts`
- `crm-v2-server\src\auth\entities\role.entity.ts`
- `crm-v2-server\src\automation\entities\lead-assignment-proposal.entity.ts`
- `crm-v2-server\src\bug-reports\entities\bug-report.entity.ts`
- `crm-v2-server\src\calendar-sync\entities\calendar-event-link.entity.ts`
- `crm-v2-server\src\calendar-sync\entities\user-calendar-connection.entity.ts`
- `crm-v2-server\src\campaigns\entities\campaign.entity.ts`
- `crm-v2-server\src\cash-requisitions\entities\cash-requisition.entity.ts`
- `crm-v2-server\src\cash-requisitions\entities\requisition-line-item.entity.ts`
- `crm-v2-server\src\contacts\entities\contact.entity.ts`
- `crm-v2-server\src\deals\entities\deal-competitor.entity.ts`
- `crm-v2-server\src\deals\entities\deal-health-history.entity.ts`
- `crm-v2-server\src\deals\entities\deal-rollback-request.entity.ts`
- `crm-v2-server\src\deals\entities\deal-stage-history.entity.ts`
- `crm-v2-server\src\deals\entities\deal.entity.ts`
- `crm-v2-server\src\document-items\entities\document-item.entity.ts`
- `crm-v2-server\src\email-sequences\entities\email-queue.entity.ts`
- `crm-v2-server\src\email-sequences\entities\email-sequence.entity.ts`
- `crm-v2-server\src\file-manager\entities\managed-file.entity.ts`
- `crm-v2-server\src\invoices\entities\invoice.entity.ts`
- `crm-v2-server\src\leads\entities\duplicate-suspicion.entity.ts`
- `crm-v2-server\src\leads\entities\lead-escalation.entity.ts`
- `crm-v2-server\src\leads\entities\lead-import-batch.entity.ts`
- `crm-v2-server\src\leads\entities\lead-qualification-criteria.entity.ts`
- `crm-v2-server\src\leads\entities\lead-reversal-request.entity.ts`
- `crm-v2-server\src\leads\entities\lead-sla-history.entity.ts`
- `crm-v2-server\src\leads\entities\lead-sla.entity.ts`
- `crm-v2-server\src\leads\entities\lead-stakeholders.entity.ts`
- `crm-v2-server\src\leads\entities\lead.entity.ts`
- `crm-v2-server\src\notifications\entities\notification-preference.entity.ts`
- `crm-v2-server\src\notifications\entities\notification.entity.ts`
- `crm-v2-server\src\notifications\entities\user-notification.entity.ts`
- `crm-v2-server\src\payment-terms\entities\applied-payment-term.entity.ts`
- `crm-v2-server\src\payment-terms\entities\installment.entity.ts`
- `crm-v2-server\src\payment-terms\entities\payment-allocation.entity.ts`
- `crm-v2-server\src\payment-terms\entities\payment-term-period.entity.ts`
- `crm-v2-server\src\payment-terms\entities\payment-term.entity.ts`
- `crm-v2-server\src\payments\entities\payment-entry-request.entity.ts`
- `crm-v2-server\src\payments\entities\payment.entity.ts`
- `crm-v2-server\src\pipelines\entities\pipeline.entity.ts`
- `crm-v2-server\src\pipelines\entities\stage.entity.ts`
- `crm-v2-server\src\products\entities\product.entity.ts`
- `crm-v2-server\src\quotes\entities\quote.entity.ts`
- `crm-v2-server\src\scheduling\entities\scheduling-hold.entity.ts`
- `crm-v2-server\src\scheduling\entities\scheduling-link.entity.ts`
- `crm-v2-server\src\schools\entities\schools.entity.ts`
- `crm-v2-server\src\settings\entities\settings.entity.ts`
- `crm-v2-server\src\user-email\entities\email-template.entity.ts`
- `crm-v2-server\src\user-email\entities\user-email-account.entity.ts`
- `crm-v2-server\src\users\entities\user.entity.ts`
- `crm-v2-server\src\video-integrations\entities\video-provider-connection.entity.ts`

## Service Inventory

- `crm-v2-server\src\activities\activities.service.ts`
- `crm-v2-server\src\activities\whatsapp-send.service.ts`
- `crm-v2-server\src\activity-logs\activity-logs.service.ts`
- `crm-v2-server\src\audit\audit.service.ts`
- `crm-v2-server\src\auth\auth.service.ts`
- `crm-v2-server\src\auth\two-factor.service.ts`
- `crm-v2-server\src\auth\casl\ability-scope.service.ts`
- `crm-v2-server\src\automation\services\attribution.service.ts`
- `crm-v2-server\src\automation\services\demo-followup-draft.service.ts`
- `crm-v2-server\src\automation\services\followup-discipline.service.ts`
- `crm-v2-server\src\automation\services\lead-auto-router.service.ts`
- `crm-v2-server\src\automation\services\lead-reactivation.service.ts`
- `crm-v2-server\src\automation\services\quote-draft.service.ts`
- `crm-v2-server\src\automation\services\social-handoff.service.ts`
- `crm-v2-server\src\automation\services\whatsapp-ingest.service.ts`
- `crm-v2-server\src\bug-reports\bug-reports.service.ts`
- `crm-v2-server\src\calendar-sync\services\calendar-reconciler.service.ts`
- `crm-v2-server\src\calendar-sync\services\calendar-sync.service.ts`
- `crm-v2-server\src\calendar-sync\services\meeting-cancellation.service.ts`
- `crm-v2-server\src\campaigns\campaigns.service.ts`
- `crm-v2-server\src\cash-requisitions\cash-requisitions.service.ts`
- `crm-v2-server\src\common\common.service.ts`
- `crm-v2-server\src\contacts\contacts.service.ts`
- `crm-v2-server\src\contacts\services\customer-identity.service.ts`
- `crm-v2-server\src\dashboard\activity-discipline.service.ts`
- `crm-v2-server\src\dashboard\compliance-report.service.ts`
- `crm-v2-server\src\dashboard\dashboard.service.ts`
- `crm-v2-server\src\dashboard\discipline-metrics.service.ts`
- `crm-v2-server\src\database\database-config.service.ts`
- `crm-v2-server\src\database\seed-runner.service.ts`
- `crm-v2-server\src\deals\deal-health-calculation.service.ts`
- `crm-v2-server\src\deals\deals.service.ts`
- `crm-v2-server\src\document-generator\document-generator.service.ts`
- `crm-v2-server\src\email-sequences\email-sequence-scheduler.service.ts`
- `crm-v2-server\src\email-sequences\email-sequence.service.ts`
- `crm-v2-server\src\file-manager\file-manager.service.ts`
- `crm-v2-server\src\invoices\invoices.service.ts`
- `crm-v2-server\src\leads\leads.service.ts`
- `crm-v2-server\src\leads\services\duplicate-detection.service.ts`
- `crm-v2-server\src\leads\services\lead-escalation.service.ts`
- `crm-v2-server\src\leads\services\lead-qualification.service.ts`
- `crm-v2-server\src\leads\services\lead-sla.service.ts`
- `crm-v2-server\src\leads\services\lead-temperature.service.ts`
- `crm-v2-server\src\leads\services\leads-xlsx-import.service.ts`
- `crm-v2-server\src\notifications\notifications.service.ts`
- `crm-v2-server\src\notifications\user-notifications.service.ts`
- `crm-v2-server\src\payment-terms\installment-calculation.service.ts`
- `crm-v2-server\src\payment-terms\payment-terms.service.ts`
- `crm-v2-server\src\payments\payments.service.ts`
- `crm-v2-server\src\pipelines\pipelines.service.ts`
- `crm-v2-server\src\pipelines\stages.service.ts`
- `crm-v2-server\src\products\products.service.ts`
- `crm-v2-server\src\quotes\quotes.service.ts`
- `crm-v2-server\src\rbac\rbac.service.ts`
- `crm-v2-server\src\reports\report-export.service.ts`
- `crm-v2-server\src\reports\reports-read.service.ts`
- `crm-v2-server\src\scheduling\services\scheduling-sweeper.service.ts`
- `crm-v2-server\src\scheduling\services\scheduling.service.ts`
- `crm-v2-server\src\schools\schools.service.ts`
- `crm-v2-server\src\settings\compliance-settings.service.ts`
- `crm-v2-server\src\settings\settings.service.ts`
- `crm-v2-server\src\sla\sla-breach.service.ts`
- `crm-v2-server\src\sla\sla-scheduler.service.ts`
- `crm-v2-server\src\user-email\services\credentials-cipher.service.ts`
- `crm-v2-server\src\user-email\services\email-templates.service.ts`
- `crm-v2-server\src\user-email\services\merge-var-context.service.ts`
- `crm-v2-server\src\user-email\services\user-email-accounts.service.ts`
- `crm-v2-server\src\user-email\services\user-email-sender.service.ts`
- `crm-v2-server\src\users\users.service.ts`
- `crm-v2-server\src\video-integrations\services\video-integrations.service.ts`

## DTO Inventory

- `crm-v2-server\src\activities\dto\bulk-status.dto.ts`
- `crm-v2-server\src\activities\dto\create-activity-comment.dto.ts`
- `crm-v2-server\src\activities\dto\create-activity.dto.ts`
- `crm-v2-server\src\activities\dto\create-attachment.dto.ts`
- `crm-v2-server\src\activities\dto\query-activity.dto.ts`
- `crm-v2-server\src\activities\dto\update-activity.dto.ts`
- `crm-v2-server\src\activities\dto\update-status.dto.ts`
- `crm-v2-server\src\activity-logs\dto\create-activity-log.dto.ts`
- `crm-v2-server\src\activity-logs\dto\query-activity-log.dto.ts`
- `crm-v2-server\src\auth\dto\login.dto.ts`
- `crm-v2-server\src\auth\dto\password-reset.dto.ts`
- `crm-v2-server\src\auth\dto\register.dto.ts`
- `crm-v2-server\src\auth\dto\signup.dto.ts`
- `crm-v2-server\src\auth\dto\two-factor.dto.ts`
- `crm-v2-server\src\automation\dto\ingest-whatsapp.dto.ts`
- `crm-v2-server\src\bug-reports\dto\bug-report.dto.ts`
- `crm-v2-server\src\campaigns\dto\campaign.dto.ts`
- `crm-v2-server\src\cash-requisitions\dto\cash-requisition.dto.ts`
- `crm-v2-server\src\contacts\dto\create-contact.dto.ts`
- `crm-v2-server\src\contacts\dto\query-contact.dto.ts`
- `crm-v2-server\src\contacts\dto\update-contact.dto.ts`
- `crm-v2-server\src\dashboard\dto\dashboard-filters.dto.ts`
- `crm-v2-server\src\deals\dto\add-assignee.dto.ts`
- `crm-v2-server\src\deals\dto\bulk-update-deal.dto.ts`
- `crm-v2-server\src\deals\dto\close-deal.dto.ts`
- `crm-v2-server\src\deals\dto\create-deal-rollback-request.dto.ts`
- `crm-v2-server\src\deals\dto\create-deal.dto.ts`
- `crm-v2-server\src\deals\dto\query-archived-deals.dto.ts`
- `crm-v2-server\src\deals\dto\query-deal-rollback-requests.dto.ts`
- `crm-v2-server\src\deals\dto\review-deal-rollback-request.dto.ts`
- `crm-v2-server\src\deals\dto\update-deal-stage.dto.ts`
- `crm-v2-server\src\deals\dto\update-deal.dto.ts`
- `crm-v2-server\src\email-sequences\dto\create-email-sequence.dto.ts`
- `crm-v2-server\src\email-sequences\dto\update-email-sequence.dto.ts`
- `crm-v2-server\src\file-manager\dto\create-file.dto.ts`
- `crm-v2-server\src\file-manager\dto\query-file.dto.ts`
- `crm-v2-server\src\file-manager\dto\update-file.dto.ts`
- `crm-v2-server\src\invoices\dto\create-invoice.dto.ts`
- `crm-v2-server\src\invoices\dto\query-invoice.dto.ts`
- `crm-v2-server\src\invoices\dto\update-invoice-item.dto.ts`
- `crm-v2-server\src\invoices\dto\update-invoice.dto.ts`
- `crm-v2-server\src\leads\dto\assign-lead.dto.ts`
- `crm-v2-server\src\leads\dto\create-lead-qualification.dto.ts`
- `crm-v2-server\src\leads\dto\create-lead-reversal-request.dto.ts`
- `crm-v2-server\src\leads\dto\create-lead-sla.dto.ts`
- `crm-v2-server\src\leads\dto\create-lead-stakeholder.dto.ts`
- `crm-v2-server\src\leads\dto\create-lead-with-school-contacts.dto.ts`
- `crm-v2-server\src\leads\dto\create-lead.dto.ts`
- `crm-v2-server\src\leads\dto\import-leads-xlsx.dto.ts`
- `crm-v2-server\src\leads\dto\lead-escalation.dto.ts`
- `crm-v2-server\src\leads\dto\query-lead-qualification.dto.ts`
- `crm-v2-server\src\leads\dto\query-lead-sla.dto.ts`
- `crm-v2-server\src\leads\dto\query-lead.dto.ts`
- `crm-v2-server\src\leads\dto\review-lead-reversal-request.dto.ts`
- `crm-v2-server\src\leads\dto\update-lead-qualification.dto.ts`
- `crm-v2-server\src\leads\dto\update-lead-sla.dto.ts`
- `crm-v2-server\src\leads\dto\update-lead.dto.ts`
- `crm-v2-server\src\notifications\dto\create-notification.dto.ts`
- `crm-v2-server\src\notifications\dto\mark-as-read.dto.ts`
- `crm-v2-server\src\notifications\dto\notification-config.dto.ts`
- `crm-v2-server\src\notifications\dto\query-notification.dto.ts`
- `crm-v2-server\src\notifications\dto\send-notification.dto.ts`
- `crm-v2-server\src\payment-terms\dto\apply-payment-term.dto.ts`
- `crm-v2-server\src\payment-terms\dto\calculate-installments.dto.ts`
- `crm-v2-server\src\payment-terms\dto\create-payment-term.dto.ts`
- `crm-v2-server\src\payment-terms\dto\query-installment.dto.ts`
- `crm-v2-server\src\payment-terms\dto\query-payment-term.dto.ts`
- `crm-v2-server\src\payment-terms\dto\update-payment-term.dto.ts`
- `crm-v2-server\src\payments\dto\create-payment.dto.ts`
- `crm-v2-server\src\payments\dto\query-payment.dto.ts`
- `crm-v2-server\src\payments\dto\review-payment-entry-request.dto.ts`
- `crm-v2-server\src\payments\dto\update-payment.dto.ts`
- `crm-v2-server\src\pipelines\dto\create-pipeline.dto.ts`
- `crm-v2-server\src\pipelines\dto\create-stage.dto.ts`
- `crm-v2-server\src\pipelines\dto\query-pipeline.dto.ts`
- `crm-v2-server\src\pipelines\dto\reorder-stages.dto.ts`
- `crm-v2-server\src\pipelines\dto\update-pipeline.dto.ts`
- `crm-v2-server\src\pipelines\dto\update-stage.dto.ts`
- `crm-v2-server\src\products\dto\create-product.dto.ts`
- `crm-v2-server\src\products\dto\query-product.dto.ts`
- `crm-v2-server\src\products\dto\update-product.dto.ts`
- `crm-v2-server\src\quotes\dto\add-quote-item.dto.ts`
- `crm-v2-server\src\quotes\dto\create-quote.dto.ts`
- `crm-v2-server\src\quotes\dto\query-quote.dto.ts`
- `crm-v2-server\src\quotes\dto\update-quote-item.dto.ts`
- `crm-v2-server\src\quotes\dto\update-quote.dto.ts`
- `crm-v2-server\src\rbac\dto\assign-permissions.dto.ts`
- `crm-v2-server\src\rbac\dto\create-permission.dto.ts`
- `crm-v2-server\src\rbac\dto\create-role.dto.ts`
- `crm-v2-server\src\rbac\dto\update-permission.dto.ts`
- `crm-v2-server\src\rbac\dto\update-role-permission-conditions.dto.ts`
- `crm-v2-server\src\rbac\dto\update-role.dto.ts`
- `crm-v2-server\src\scheduling\dto\scheduling.dto.ts`
- `crm-v2-server\src\schools\dto\create-school-with-contacts.dto.ts`
- `crm-v2-server\src\schools\dto\create-school.dto.ts`
- `crm-v2-server\src\schools\dto\query-school.dto.ts`
- `crm-v2-server\src\schools\dto\set-school-city.dto.ts`
- `crm-v2-server\src\schools\dto\update-school.dto.ts`
- `crm-v2-server\src\settings\dto\update-settings.dto.ts`
- `crm-v2-server\src\user-email\dto\email-template.dto.ts`
- `crm-v2-server\src\user-email\dto\user-email-account.dto.ts`
- `crm-v2-server\src\users\dto\bulk-import-users.dto.ts`
- `crm-v2-server\src\users\dto\create-users.dto.ts`
- `crm-v2-server\src\users\dto\query-users.dto.ts`
- `crm-v2-server\src\users\dto\update-users.dto.ts`

## Migration Inventory

- `1700000000000-InitialSchema.ts`
- `1738000000000-AddChecklistItemsToLeadQualificationCriteria.ts`
- `1761000000000-AddPaymentTermGraceAndInvoiceSplitColumns.ts`
- `1762000000000-AddIsInternalToNotes.ts`
- `1763000000000-AddUserEmailAndTemplates.ts`
- `1764000000000-AddCalendarSyncAndScheduling.ts`
- `1765000000000-AddCashRequisitions.ts`
- `1766000000000-AddCampaigns.ts`
- `1767000000000-AddBugReports.ts`
- `1768000000000-AddBugReportResolvedAt.ts`
- `1769000000000-MakeSchoolCityNullable.ts`
- `1770000000000-AddVeryCriticalBugSeverity.ts`
- `1771000000000-AddAssignmentProposalsAndTerritories.ts`
- `1772000000000-AddLeadImportBatches.ts`
- `1773000000000-AddReversalRequestEnquiry.ts`
- `1774000000000-AddSecondaryPhoneToContacts.ts`
- `1775000000000-AddWorkTrackerFields.ts`
- `1776000000000-BackfillWorkTrackerClassification.ts`
- `1778000000000-AddCampaignEntryDate.ts`
- `1779000000000-AddCampaignSlug.ts`
- `1780000000000-AddProductSkuAndDescription.ts`
- `1781000000000-AddQuoteCurrency.ts`
- `1782000000000-AddLeadProduct.ts`
- `1783000000000-AddPaymentEntryApprovals.ts`

## Scheduler Inventory

| Scheduler | Schedule | Data Mutated | Idempotency/Locking | Result |
| --- | --- | --- | --- | --- |
| EmailSequenceSchedulerService.handleProcessQueue | every 15 minutes | email_queue status, outbound email | No claim/lock before send; batch find pending then send | High-risk static finding |
| CalendarReconcilerService.tick | every 30 minutes | calendar connections sync tokens | No distributed lock; adapters stubbed | Integration dead path |
| SchedulingSweeperService.tick | every 5 minutes | scheduling_holds expired status | Idempotent update | Static OK |
| LeadReactivationService | AUTOMATION_CRON.reactivation | lead notification/drafts | No environment gate seen | Covered by scheduler systemic risk |
| LeadAutoRouterService | AUTOMATION_CRON.unassignedRouting | assignment proposals | Proposal-based, but no deployment-wide lock seen | Static risk |
| FollowupDisciplineService | AUTOMATION_CRON.disciplineDigest | notifications | Dedupe keys used in notification service | Static partial |
| DemoFollowupDraftService | 07:00 daily | follow-up drafts/notifications | Unique/conflict handling in code paths | Static partial |
| SlaSchedulerService | multiple 15/30/60/120 minute crons | SLA state, escalations, notifications | Covered by prior BUG-019/BUG-014 | Existing bugs |
| LeadTemperatureService | 02:00 daily | lead temperature fields | Tests cover failure logging | Static + unit tests |
| QuotesService | 01:00 daily | quote expiry/status | No runtime in pass | Static only |

## Integration Inventory

| Integration | Paths | Coverage Result |
| --- | --- | --- |
| Calendar Google/Microsoft | /calendar-sync/*, scheduling confirm, reconciler cron | Stubbed adapters; frontend exposes connect. |
| Video Zoom/Meet/Teams | /video-integrations/*, scheduling confirm | Zoom marked available but adapter throws; Meet/Teams not implemented. |
| User SMTP email | /user-email/* | SSRF guard exists; raw HTML send/template XSS risk in preview. |
| Notifications gateway | socket hook + gateway | Static only; client logs to console. |
| WhatsApp | /activities/whatsapp/send, automation ingest | Static only; provider errors return provider messages. |
| File/blob manager | /file-manager/* | Existing blob delete/orphan risk remains. |

## Role Action Matrix Summary

| Role | Sensitive API Surface | Expected | Observed Enforcement |
| --- | --- | --- | --- |
| admin | All admin/manager/finance operations | Full access | RolesGuard alias and service checks mostly allow. |
| admin_support | Intended admin-like support | Broad oversight | Alias to admin in RolesGuard; not always present in service allowlists. |
| sales_manager | Sales/approval/reports | Broad sales access | Decorators widely include sales_manager. |
| sales_rep | Own sales objects, limited finance | Scoped access | Per-object guards/services vary; quote/invoice fail-open risk already recorded. |
| manager | Reports/collections/requisitions | Management read/approval | Excluded from many notification/profile surfaces; static only. |
| finance | Requisitions/finance | Finance approvals | Missing from payments/invoices decorators except requisitions/campaign ROI. |

## Runtime/Command Coverage

| Command | Result | Evidence |
| --- | --- | --- |
| server npm test | Passed | 27 suites, 110 tests. |
| server npm run build | Passed | nest build exit 0. |
| server npm run lint | Failed | 1175 problems, 1029 errors, 146 warnings. Script runs eslint --fix and formatted at least one file. |
| client npm run build | Passed with warning | JS bundle 2,830.37 kB, gzip 766.28 kB. |
| client npm run lint | Failed | 225 problems, 167 errors, 58 warnings. |
| client npm test | Blocked | package has no test script. |
| browser automation | Not executable through repo tooling | No Playwright/Cypress/Puppeteer/Vitest/browser harness declared. |

## Database Forensics

| Check | Count | Result |
| --- | ---: | --- |
| Negative payments | 0 | Clean |
| Negative invoice totals/paid | 0 | Clean |
| Overpaid invoices | 0 | Clean after first-pass rollback |
| Paid invoices with zero amount_paid | 0 | Clean |
| Cancelled invoices with payments | 0 | Clean |
| Draft invoices with payments | 0 | Clean after first-pass rollback |
| Invoices created_at > updated_at | 5 | Confirmed timestamp anomaly |
| Users without roles | 0 | Clean |
| Inactive users assigned leads | 0 | Clean |
| Duplicate contact email groups | 49 | Confirmed data quality/invariant gap |
| Duplicate contact phone groups | 86 | Confirmed data quality/invariant gap |
| Payments allocated_amount mismatch allocation rows | 28 | Confirmed finance integrity bug |
| Cash requisitions with no/multiple parent | 0 | Clean, but no DB CHECK constraint |

## State Enum/Status Inventory

Status-bearing entities found: Lead, Deal, Quote, Invoice, PaymentEntryRequest, CashRequisition, Campaign, Activity/Task/Meeting/Call/Email/Demo/WhatsApp, EmailQueue, SchedulingHold, LeadAssignmentProposal, LeadReversalRequest, DealRollbackRequest, DuplicateSuspicion, LeadEscalation, PaymentTerm/Installment.

## Untested Surface Area

No unknown route/entity/controller surface remains after inventory. Runtime execution remains incomplete for visual browser workflows, live third-party integrations, destructive mutation edge cases, and full 345-endpoint happy/error matrix because this pass avoided data mutation and the repo has no browser test harness.



---

# Consolidated Source: METRIC_AUDIT.md

# Metric Audit

Date: 2026-08-27

Scope:
- Dashboard and Reports metric surfaces in `crm-v2-client` and `crm-v2-server`.
- Read-only checks against the restored backup database.
- No production database access or writes.

## Executive Summary

This scan found five additional metric/visual correctness problems:

| ID | Severity | Status | Metric Area | Summary |
| --- | --- | --- | --- | --- |
| BUG-037 | Medium | Confirmed | Dashboard filters | Specific Date sends `customStartDate/customEndDate`, but backend expects `startDate/endDate`, so one-day views fall back to MTD. |
| BUG-038 | Medium | High Confidence | Dashboard filters | Product filter is visible but ignored by backend dashboard metrics. |
| BUG-039 | Medium | Confirmed | Demo metrics | Structured demo metrics show zero against restored data even though 42 completed activities contain demo-like subjects. |
| BUG-040 | High | Confirmed | Sales Performance | YTD cash collected is undercounted by 58,900 because reports use invoice paid-date summaries instead of payment ledger rows. |
| BUG-041 | Medium | Confirmed | Role scoping | Multi-role sales manager/rep users get inconsistent self/team scope across dashboard/report metrics. |

## Metric Surface Inventory

| Surface | Endpoint / Hook | Visual Metric |
| --- | --- | --- |
| Executive dashboard | `/dashboard/kpis` | Cash collected, principal sold, pipeline coverage, overdue amount, qualification totals. |
| Executive dashboard | `/dashboard/leads-contacted` | Leads contacted vs target. |
| Executive dashboard | `/dashboard/collections-due` | Due today, overdue, due in 7 days, due in 30 days. |
| Executive dashboard | `/dashboard/sales-metrics` | Principal sold, contract value, cash collected, previous period. |
| Executive dashboard | `/dashboard/demo-stats` | Upcoming demos, completed demos, demo-to-proposal rate. |
| Executive dashboard | `/dashboard/high-value-deals` | High-value active deals and SLA breach badge. |
| Executive dashboard | `/dashboard/funnel-health` | Pipeline coverage and stage breakdown. |
| Executive dashboard | `/dashboard/schools-bought` | New/repeat schools and province split. |
| Executive dashboard | `/dashboard/leads-by-stage` | Lead count by status. |
| Executive dashboard | `/dashboard/sla-compliance` | On track, at risk, breached, compliance rate. |
| Executive dashboard | `/dashboard/lead-conversion` | Total leads, converted, disqualified, active, conversion rate, average days. |
| Executive dashboard | `/dashboard/nurture-follow-ups` | Overdue, due today, due in 7 days, overdue list. |
| Executive dashboard | `/dashboard/qualification-overview` | Qualification total, qualified count, average score, criteria, top needs. |
| Executive dashboard | `/dashboard/activity-discipline` | Prospecting, volume, quality, progression, at-risk, per-rep table. |
| Executive dashboard | `/dashboard/top-performing-products` | Top products by accepted quote item value and rep breakdown. |
| Reports page | `/reports/sales-performance` | Principal sold, contract value, cash collected, outstanding. |
| Reports page | `/reports/pipeline-analysis` | Deals/value/age by active stage. |
| Reports page | `/reports/finance` | Revenue by method, outstanding invoices, upcoming installments. |
| Collections report | `/collections/aging-report` | Installment aging buckets and balances. |

## Read-Only Reconciliation Evidence

### Specific Date Filter

Selected date checked: `2026-08-20`.

| Raw Check | Value |
| --- | ---: |
| Payments on selected day | 0.00 |
| Payments returned if custom date falls back to MTD | 7800.00 |
| New leads on selected day | 0 |
| New leads returned if custom date falls back to MTD | 4 |

Conclusion: a one-day dashboard can visually show MTD results.

### Cash Collected

YTD checked from `2026-01-01` through `2026-08-27`.

| Formula | Value |
| --- | ---: |
| Payment ledger by `payments.payment_date` | 185000.00 |
| Sales Performance report by `invoices.paid_date` / `amount_paid` | 126100.00 |
| Payments on invoices with no `paid_date` | 58900.00 |
| Invoices with `amount_paid > 0` and no `paid_date` | 18 |

Conclusion: Sales Performance underreports cash when partial payments exist without invoice paid dates.

### Demo Metrics

| Raw Check | Count |
| --- | ---: |
| Structured demo activity rows | 0 |
| Completed activities with demo-like subjects | 42 |

Conclusion: dashboard demo metrics can render zero for historical data that users recognize as demo work.

### Arithmetic Integrity Checks

| Check | Count |
| --- | ---: |
| Invoice total not equal subtotal - discount + tax | 0 |
| Document item total not equal quantity * unit price - discount + tax | 0 |
| Quote total not equal quote item sum | 0 |
| Invoice total not equal invoice item sum | 0 |

Conclusion: item/invoice/quote arithmetic looked consistent in the restored backup for these tested formulas.

## Role-Scoped Metric API Probe

The local API was run against the restored backup with seeds, migrations, and synchronize disabled. Active restored sessions were used to generate local-only tokens for role testing.

| Role | Endpoint Group | Result |
| --- | --- | --- |
| admin | Dashboard + reports | Team dashboard/report metrics returned HTTP 200. |
| sales_manager | Dashboard + reports | Team dashboard/report metrics returned HTTP 200. |
| finance | Dashboard | Full team dashboard metrics returned HTTP 200. This confirms existing `BUG-029`. |
| finance | Reports | `/reports/sales-performance` and `/reports/finance` returned HTTP 403. |
| sales_rep | Dashboard + reports | Dashboard/report metrics self-scoped to the rep. |
| sales_manager + sales_rep | DashboardService widgets | Several widgets returned self-scoped zero results. |
| sales_manager + sales_rep | Activity Discipline + Reports | Returned team-scope results. This is `BUG-041`. |

Representative values:

| Role / Scope | Metric | Value |
| --- | --- | ---: |
| admin | `/dashboard/kpis` YTD cash | 185000 |
| finance | `/dashboard/kpis` YTD cash | 185000 |
| finance | `/reports/finance` | 403 |
| multi-role | `/dashboard/kpis` YTD cash | 0 |
| multi-role | `/dashboard/activity-discipline` reps | 10 |
| multi-role | `/reports/sales-performance` principal sold | 280165 |

## Visual Screenshot Attempt

The Vite client and Nest API both launched locally against the restored backup. Browser screenshots could not be captured because the browser runtime reported no available browser backends:

```text
agent.browsers.list() => []
```

Fallback coverage completed:
- Live local API role-scope probes for dashboard/report metric endpoints.
- Static frontend inspection of dashboard filter controls and reports page render logic.
- Read-only SQL reconciliation against the restored backup.

## Visual QA Notes

- Metrics most likely to embarrass the product review are cash collected, specific-date screenshots, product-filter screenshots, and demo counts.
- The Product filter should be removed or made real before a visual demo; a visible no-op filter is easy for a visual reviewer to spot.
- Historical demo data needs either a backfill or a label that clearly says structured/post-migration demos only.
- Cash metrics need one source of truth. The payment ledger is safer than invoice summary dates for period reporting.


---

# Consolidated Source: WHAT_CAN_BE_IMPROVED.md

# What Can Be Improved

Date: 2026-08-26

Source documents:
- `SYSTEM_AUDIT.md`
- `AUDIT_COVERAGE_V2.md`
- `POST_AUDIT_SCAN_RESULTS.md`

This is a practical improvement brief for the DigiLearn CRM. It is not a fix list by file alone; it groups the audit findings into repair themes that will make the system more reliable, safer to operate, and easier to evolve.

## Current Audit Position

| Severity | Count |
| --- | ---: |
| Critical | 4 |
| High | 20 |
| Medium | 18 |
| Low | 3 |
| Potential Risks | 14 |

Coverage from `AUDIT_COVERAGE_V2.md`:

| Surface | Inventory Coverage | Runtime Coverage |
| --- | ---: | --- |
| Backend routes | 344 / 344 (100%) | Targeted, not exhaustive |
| Frontend routes | 47 / 47 (100%) | Static only |
| Database entities | 68 / 68 (100%) | Read-only forensic queries |
| Schedulers/background jobs | 7 / 7 (100%) | Static + prior runtime scheduler observation |
| Integrations/webhooks | 5 / 5 (100%) | Static only, no external sends |

## Highest Priority Improvements

1. Stabilize finance and data integrity.
   Fix the payment, invoice, allocation, requisition, and payment-term defects before pilot expansion. These are the highest operational-risk areas because they can corrupt money state, duplicate schedules, misstate collections, or leave historical records contradictory.

2. Enforce authorization server-side.
   Several UI restrictions are stronger than the backend restrictions. Dashboard aggregate endpoints, ownership guards, quote/invoice guards, and role-sensitive APIs need consistent server-side role and ownership enforcement.

3. Make workflow transitions transactional.
   Status changes, SLA history, lead assignment, approval flows, invoice/payment updates, and rollback/reversal operations should mutate related records in one transaction and fail without partial writes.

4. Add database constraints for business invariants.
   Critical rules should not rely only on service code. Add unique/check constraints for applied payment terms, exact-one cash requisition parent, contact identity policy, valid states, timestamp invariants, and one-open-SLA-history-per-record rules.

5. Replace stubbed integrations or hide them.
   Calendar and video integrations are visible to users but adapters are not fully implemented. Either complete provider implementation or remove/disable those UI paths until they work.

6. Add real browser regression coverage.
   Current browser, responsive, route-refresh, theme, and form behavior coverage is mostly static. Add Playwright or Cypress and cover auth, role-specific navigation, leads, deals, quotes, invoices, payments, scheduling, file upload, and admin workflows.

## Backend Improvements

- Convert interface-based request bodies to DTO classes so Nest validation actually runs.
- Audit every `auth default` endpoint and decide whether login-only access is intentional.
- Remove fail-open guard behavior; authorization failures and lookup errors should fail closed.
- Normalize role handling so multi-role users do not depend on one derived representative role.
- Use structured enums/state machines for lead, deal, quote, invoice, payment, requisition, campaign, activity, and approval transitions.
- Add idempotency keys or duplicate-request protection to mutation endpoints.
- Add payment-specific idempotency so duplicate references/retries cannot create duplicate collections.
- Extend idempotency into the payment-entry approval queue so duplicate pending requests cannot become duplicate real payments.
- Make invoice cancellation and payment recalculation one explicit state machine; payment edits/deletes must not resurrect cancelled invoices.
- Return consistent 400/403/404 responses instead of leaking raw errors or returning 500 for validation problems.
- Add API tests per role for sensitive endpoints.

## Database Improvements

- Add constraints for payment allocation totals and invoice/payment consistency.
- Block hard deletion of invoices with payments; finance records should be voided/reversed, not cascaded away.
- Add a unique index on applied payment terms per `(document_id, document_type)`.
- Add a CHECK constraint for cash requisitions so exactly one parent is set.
- Add a normalized contact duplicate policy and enforce it with partial unique indexes where appropriate.
- Add one-open-SLA-history constraints or transactional repair logic.
- Add indexes for common filters: owner/assignee/status/date/school/deal/lead/payment status.
- Create read-only integrity checks that run before deployment and after data imports.

## Frontend Improvements

- Add route-level code splitting; the current client build emits an oversized main bundle.
- Add role-aware route guards, while keeping backend as the real security boundary.
- Gate report tabs/export controls by role so users do not see actions the API will reject.
- Fix dashboard filter contracts before demos: Specific Date and Product filters currently mislead the visual output.
- Use the payment ledger as the single source of truth for period cash-collected metrics.
- Backfill or relabel historical demo metrics so demo work does not disappear from dashboards.
- Centralize metric role scoping so multi-role users see one consistent dashboard/report context.
- Add form-level loading/disabled states for every mutation to reduce duplicate submissions.
- Add explicit empty, unauthorized, deleted-record, invalid-ID, and error states.
- Make admin/finance/report pages responsive under table-heavy layouts.
- Remove dead scratch files and unused code surfaced by lint.
- Fix client lint errors so regressions become visible in CI.

## Integration Improvements

- Add signature verification and replay protection to public webhooks.
- Move OAuth state storage from process memory to durable/shared storage.
- Fail closed when required production credential keys are missing.
- Add sandbox tests for SMTP, WhatsApp, blob uploads, Google/Microsoft calendar, and Zoom/video behavior.
- Make external send/sync operations idempotent and retry-aware.

## Scheduler And Automation Improvements

- Gate destructive or production-like schedulers in local/dev environments.
- Use row claiming, locks, or a real queue for email sequence processing.
- Ensure SLA, escalation, automation, sync, and sweeper jobs are safe on multi-instance deployments.
- Add audit logs for automated changes that affect leads, deals, invoices, payments, and notifications.

## Performance Improvements

- Replace loop-per-stage/report queries with grouped SQL aggregation.
- Avoid broad `.find()` calls when projections would be enough.
- Add pagination and hard limits to all list/export/report endpoints.
- Cache low-volatility settings/compliance values.
- Consolidate dashboard endpoints or cache expensive dashboard bundles.
- Split frontend routes and lazy-load admin/report-heavy modules.

## Recommended Repair Order

1. Critical data-corruption bugs: SLA partial mutation, SLA historical inconsistencies, payment overpayment.
2. High finance defects: draft invoice payments, allocation mismatches, payment-term duplicate race.
3. Authorization defects: dashboard aggregate exposure, fail-open ownership guards, file metadata parent ownership checks, route/API role mismatches.
4. Integration security: calendar webhook validation, OAuth state durability, credential-key fail-closed behavior.
5. Public repository hygiene: remove/reset helper scripts with fixed credentials and rotate any credential that may overlap with a deployed environment.
6. Dependency security: upgrade server/client packages flagged by `npm audit`, especially templating, mail, socket, router, Vite, and HTTP client packages.
7. Validation/error handling: invalid enum payloads, notification preference DTOs, raw provider errors.
8. Data cleanup: duplicate contacts, timestamp anomalies, historical SLA/payment repairs.
9. Performance and UX: bundle splitting, dashboard/report query optimization, browser regression tests.

## Bottom Line

The CRM has enough useful product surface to continue staging and product-owner review, but the audit evidence does not support production confidence yet. The main improvement theme is moving trust out of the frontend and informal service checks into server-side authorization, transactions, database constraints, and automated regression tests.


---

# Consolidated Source: POST_AUDIT_SCAN_RESULTS.md

# Post-Audit Scan Results

Date: 2026-08-26

Scope:
- Restored backup database only: `db-backup/digilearn_crm-prod-20260820.sql` loaded into local PostgreSQL.
- Public export pushed to GitHub: `C:\Users\8Y14\AppData\Local\Temp\digilearn-crm-public-export-20260826-144327`.
- No production database writes were performed.

## Local Backup Data Forensics

Read-only anomaly scan results:

| Check | Count | Notes |
| --- | ---: | --- |
| Active leads missing open SLA history | 881 | Previously known SLA class issue remains widespread. |
| Leads with multiple open SLA history rows | 97 | Previously known SLA class issue remains widespread. |
| Payment allocation summary mismatch | 28 | Existing payments show `allocated_amount` despite no allocation rows. |
| Duplicate contact email groups | 49 | Largest group: `tanyag@clearhue.co.zw` with 245 contacts. |
| Duplicate contact phone groups | 86 | Phone normalization exposes duplicates. |
| Contacts with `created_at > updated_at` | 7 | New timestamp anomaly category found in this pass. |
| Invoices with `created_at > updated_at` | 5 | Previously recorded as BUG-027. |
| User-role orphan rows | 0 | Clean for tested relationship. |
| Lead/school/contact/deal/quote/invoice/payment orphan rows | 0 | Clean for tested core relationships. |
| Negative payments | 0 | No negative payment rows found in backup. |
| Overpaid invoices | 0 | No invoice `amount_paid > total` rows found in backup. |
| Paid invoices with zero amount paid | 0 | No rows found. |
| Draft invoices with paid amount | 0 | No rows found. |

Example evidence:
- Payment mismatch examples include `PAY-2026-0035`, `PAY-2026-0033`, `PAY-2026-0032`, all with `allocated_amount` populated while allocation-row sum is `0`.
- Contact timestamp examples include contacts where milliseconds exist on `created_at` but not `updated_at`, causing `created_at > updated_at`.
- Duplicate email examples: `tanyag@clearhue.co.zw`, `busid@clearhue.co.zw`, `salesandmarketing@clearhue.co.zw`.

## Public Export Exposure Scan

Confirmed clean:
- No `SYSTEM_AUDIT.md`, `AUDIT_COVERAGE_V2.md`, `WHAT_CAN_BE_IMPROVED.md`, backup folder, `.env` files, `allt.json`, or `lchk.json` were found in the clean public export.
- Export contains only `crm-v2-client` and `crm-v2-server`.

New issue added:
- `BUG-032`: public export includes helper scripts with fixed credentials and direct database mutation paths.

Evidence:
- `crm-v2-server/scripts/demo-feature-smoke-test.sh` contains fixed admin/rep login credentials and an inline `PGPASSWORD` reset helper.
- `crm-v2-server/scripts/reset-admin-pw.js` resets the admin account to a fixed password and defaults database password if the environment variable is absent.

## Dependency Security Scan

Command used in both app packages:

```powershell
npm audit --omit=dev --audit-level=moderate --json
```

Results:

| Package | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| `crm-v2-server` | 1 | 17 | 7 | 1 | 26 |
| `crm-v2-client` | 0 | 12 | 2 | 0 | 14 |

New issue added:
- `BUG-033`: current production dependency audit reports critical/high vulnerabilities in server and client packages.

Notable affected areas:
- Server: templating, mail, NestJS platform packages, file upload middleware, Socket.IO/WebSocket stack, TypeORM, HTTP client stack.
- Client: Axios, React Router, Vite, PostCSS, Rollup, Socket.IO/WebSocket stack.

## Additional Ownership / Frontend Contract Findings

New issues added:
- `BUG-034`: sales reps can attach file metadata to arbitrary CRM records without parent access checks.
- `BUG-035`: operators can create cash requisitions against arbitrary leads or deals without ownership checks.
- `BUG-036`: reports page exposes finance/export actions to roles the API denies.

Evidence:
- `FileManagerService.create()` saves caller-supplied `entity_type`, `entity_id`, and `file_url` without checking parent visibility.
- `CashRequisitionsService.create()` verifies parent existence but not whether the requester owns or may spend against the parent lead/deal.
- `ReportsPage` unconditionally calls the finance report hook and renders export controls, while the server restricts finance/export endpoints to narrower roles.

## Scheduler / Automation Scan

Cron/static inventory reconfirmed:
- Calendar reconciler every 30 minutes.
- Lead reactivation automation cron.
- Lead auto-router cron.
- Follow-up discipline digest cron.
- Demo follow-up draft cron.
- Quote expiry daily cron.
- Lead temperature daily cron.
- SLA scheduler jobs every 15/30/60/120 minutes.
- Email sequence queue every 15 minutes.
- Scheduling hold sweeper every 5 minutes.

Risk status:
- Existing `BUG-019` remains the main operational problem: schedulers run automatically in local/dev and can mutate restored production-like data.
- Existing `RISK-011` remains: email sequence queue needs multi-instance row claiming/idempotency.

## Performance / Operational Risk Scan

High-risk patterns remain:
- Dashboard and reporting services perform multiple broad `getMany()`/`getRawMany()` queries and in-memory reductions.
- Duplicate detection services include full-table style scans of schools and contacts.
- Several scheduler loops fetch active records and process them in app memory.
- Client build had already been recorded as oversized in `BUG-009`; dependency audit also shows Vite/tooling upgrades are needed.

## Immediate Follow-Up

1. Remove or sanitize public helper scripts before keeping the GitHub repository public.
2. Rotate any credential that could overlap with fixed script defaults.
3. Run dependency upgrades in controlled clusters and re-run build/test/audit after each cluster.
4. Keep any future restored-production DB testing behind scheduler-off configuration.
5. Add CI gates for secret scanning, `npm audit --omit=dev`, build, lint, and endpoint authorization tests.
