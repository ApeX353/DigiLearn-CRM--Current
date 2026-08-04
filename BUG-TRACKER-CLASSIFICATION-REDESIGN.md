# Production Bug Tracker Classification and Redesign

Snapshot: 2 August 2026, read directly from the production CRM API. No production records were changed during this review.

## Executive result

The tracker contains 145 records. They are not all bugs.

| Recommended work type | Open | In progress | Resolved | Closed | Total |
|---|---:|---:|---:|---:|---:|
| Bug / defect | 15 | 7 | 54 | 28 | **104** |
| Feature / enhancement | 1 | 2 | 7 | 16 | **26** |
| Other or mixed work | 6 | 2 | 0 | 7 | **15** |
| **Production total** | **22** | **11** | **61** | **51** | **145** |

Seventeen production records already carry a 2 August resolution note saying they were reclassified and moved out of the bug queue. That cleanup is directionally correct, but `closed` is not a suitable feature backlog: it makes requested work look rejected or completed and hides it among finished defects.

## Classification rules used

- **Bug / defect:** implemented or agreed behaviour is broken, unsafe, inconsistent, leaking data, calculating incorrectly, or regressed.
- **Feature / enhancement:** a new capability, policy, workflow, integration, field, or approval mechanism is requested.
- **Other or mixed:** investigation, decision, data repair/import, test artefact, reminder, documentation, or a ticket combining more than one work type.
- Security is a label/component on a bug, not a replacement for work type.
- Severity describes the impact of a defect. Priority describes when any work item should be done. Features should not be called “critical bugs” merely because they are important.

## Feature / enhancement tickets — 26

These should be marked `feature` or `enhancement`, retained in a visible backlog, and prioritised independently from defects.

| Ticket | Current status | Why it is a feature |
|---|---|---|
| LNAME2 — capture and show client interest | Resolved | Adds a new lead field and presentation. |
| EMAIL1 — send and receive email | Closed | Adds a new CRM capability. |
| NUM1 — number bugs by resolved date | Closed | Changes tracker presentation/identity. |
| AUTO3 — refined lead-distribution rules | Closed | Introduces new assignment policy. |
| NEXT4 — allow two next steps | Resolved | Expands the workflow from one next step to two. |
| SCHLEAD2 — create a lead from a school with inherited information | Resolved | Adds a creation workflow. |
| HEAD1 — validate head/decision-maker details | Closed | Proposed validation; requirements still needed. |
| DISC2 — role-aware daily targets | Resolved | Introduces new targets and measurement policy. |
| SCH3 — show decision maker under school | Resolved | Adds information to a view. |
| STAKE1 — manager-approved stakeholder editing with audit | Closed | Adds approval and audit workflow. |
| CSV7 — rep lead import with a go-live gate | Closed | Adds a role and approval workflow. |
| QDL1 — rep quote download plus audit | Resolved | Adds access and audit behaviour. |
| INV2 — payment deadline and more invoice options | Closed | Adds invoice capabilities. |
| MGRBUG1 — managers see and triage the complete tracker | Closed | Expands tracker permissions/workflow. |
| DUP6 — undo merge and show merge history | Closed | Adds reversibility and history. |
| AUTO2 — location-aware, balanced auto-assignment | Closed | Adds distribution rules. |
| AUTO1 — manager gate before auto-assignment | Closed | Adds an approval gate. |
| SCHLEAD1 — create lead when a school has none | Resolved | Adds a school-to-lead action. |
| CSV6 — second phone column | In progress | Expands import data capture. |
| CON1 — more than one contact phone number | In progress | Expands the contact data model. |
| CSV4 — server-side import with rollback | Open | New bulk-import architecture and rollback capability. |
| REM-ERP — merge the clerk's ERP into CRM | Closed | A future integration epic, even though recorded as a reminder. |
| QSYNC1 — quote/pipeline/deal sync and two-week automation | Closed | Adds enforced sync and automation. |
| ASGN1 — rep-created leads remain unassigned for manager allocation | Closed | Changes the assignment policy. |
| REA1 — capture a reassignment reason/note | Closed | Restores legacy capability but adds a field/workflow to this CRM. |
| ESC1 — escalation on Deals | Closed | Extends an existing capability to a new record type. |

### Important correction to the current cleanup

The closed feature tickets should become `Backlog`, `Planned`, or `Done` according to their real outcome. A resolution note saying “tracked as backlog” is not enough when the only database status is `closed`.

## Other or mixed tickets — 15

These should not be forced into Bug or Feature without splitting or clarifying them.

| Ticket | Recommended type | Current status | Recommendation |
|---|---|---|---|
| Activities — “I can only see mine” | Needs clarification | Open | R6 deliberately scoped reps to their own global activity feed. Confirm the reporter's role and expected visibility before calling this a defect. |
| DATA1 — six business days missing | Incident / investigation | Open | Reconcile source, migration and production counts; create defect(s) only after the failure mode is known. |
| WANEZI1 — duplicate school/payment | Data incident | Open | Preserve as an incident, link the underlying duplicate-prevention defect and the repair task. |
| TEST ARTEFACT (first copy) | Test | Closed | Archive or delete under an explicit test-data policy. |
| ACT5 — 2,364 undated open activities | Mixed bug + data repair | In progress | Split into prevention defect and one-time audited cleanup. |
| IMPORT2 — imported principal/phone blank | Mixed bug + data repair | In progress | Split future importer mapping from the production backfill. |
| METRICS1 — audit every dashboard figure | Investigation / epic | Open | Split each confirmed wrong metric into a defect; keep decisions as product tasks. |
| QUOTE5 — `po_received` looks unused | Investigation / decision | Open | Confirm whether the field is required and how it should be used. |
| NEXT1 — document the Next Step workflow | Documentation task | Closed | Track as documentation, not a feature defect. |
| HYG2 — grading plus possibly wrong metrics | Mixed feature + bug | Open | Split grading bands from the calculation defect. |
| IMPORT1 — import NASH file | Data operation | Closed | Preserve import manifest and reconciliation as operational evidence. |
| ACT3 — restore missing Lobengula activities | Data repair / incident | Closed | Link the cleanup defect that caused the cancellation. |
| TEST ARTEFACT (second copy) | Test / duplicate | Closed | Exact duplicate title; link to the first and archive. |
| REM-OPENAI — pay API | Reminder / commercial task | Closed | Keep outside engineering defects. |
| PROD-BOARD — change/add 85-inch to 86-inch product | Product-data task | Closed | Keep as catalogue/configuration work. |

## Clear bug / defect tickets — 104

The following records describe broken, unsafe or inconsistent existing behaviour. Compact grouping is used so every ticket remains identifiable.

### Platform, API, security, access control and audit — 45

- API2; API1; AUD-M10; AUD-M06; AUD-H10; AUD-H08; AUD-H07; AUD-H06; AUD-H05; AUD-H03; AUD-H02; AUD-H01; AUD-H13; AUD-C05; AUD-C04; AUD-C03.
- X-Powered-By exposed; missing security headers; cookie flags depend on `NODE_ENV`; public API documentation; no login brute-force protection; HTTP plaintext accepted; uploaded documents listable.
- Bulk deal access uses `some` instead of `every`; marking a foreign deal won/lost; editing a foreign lead; the earlier unprefixed R7 CSV leak; pipeline board exposes all deals; opening a foreign deal; public registration.
- SEED1; R15; R14; CSV5; N5; N2; N1; R12; R9; R7; R6; R5; R4; R3; R2.

### Leads, activities, pipeline and reporting behaviour — 27

- Pipeline deals not opening; completed Next Up outcome disappears; NEXT3; AUD-M01; AUD-H09; ACT4; repeated idle alerts; DEALS1; NEXT2.
- LNAME1; SLAW1; TRK2; SC2; SC1; ACT2; ACT1; LCK1; HYG1; AUD1; N3.
- C9; C8; C7; C5; C2; C1; R8.

### Quotes, invoices, payments and financial correctness — 15

- AUD-H11; invoice remains Paid after payment removal; payment edit/delete fails to reverse an instalment; payment is allocated without applying the instalment.
- QUOTE6; QUOTE4; QUOTE3; QUOTE2; QUOTE1; product rename fails to update matching draft lines; DL1; N4; C6; C4; R1.

### Imports, schools, contacts and duplicate handling — 11

- DUP5; DUP4; PH1; SCH2; DUP3; SCH1; DUP2; DUP1; CSV3; CSV2; CSV1.

### Client/UI consistency and resilience — 6

- BRAND1; C10; C3; R13; R11; R10.

## Duplicate and overlap cleanup

- `TEST ARTEFACT` is the one exact duplicate-title group in production.
- R7 appears twice as separate tickets describing the same leads CSV permission leak; link one as a duplicate of the canonical record.
- C9, NEXT2 and LCK1 overlap around the next-step completion lock. Keep separate only if each has a distinct reproducible failure and acceptance test.
- The new `Activities` ticket may conflict with the intentional R6 ownership rule. It needs a role/expectation decision, not an immediate fix.
- ACT5 and IMPORT2 each combine a permanent code change with a one-time data mutation. Split these so verification and rollback are explicit.

## What the current implementation supports

The current database entity has title, description, severity, status, page URL, reporter, assignee, resolution note and timestamps. It has no work type, priority, component, tags, comments, verification state, parent/duplicate relationship or attachment model.

The create/update DTOs likewise expose no classification field. List queries can filter only by status and severity. The client exposes status tabs and a severity picker but no type, search, component, priority or assignee filters.

This is why “marking” a feature currently means changing its title or abusing `closed`. The proper fix is a schema/API/UI change and then a controlled backfill.

## Recommended redesign

### 1. Rename the feature

Use **Work Tracker** or **Product & Support Tracker** as the page title. Keep separate saved views:

- Inbox
- Bugs
- Features / Backlog
- Data & Operations
- Investigations
- My work
- Awaiting verification
- Done

The report button should become **Create work item**, then ask what the user is reporting. A small **Report a problem** shortcut can still default to Bug.

### 2. Add a real work-type model

Recommended enum:

```text
bug | feature | data_task | investigation | task
```

Add labels such as `security`, `payments`, `leads`, `activities`, `imports`, and `production`. Do not use a security issue as a separate lifecycle type; it remains a bug with a security label.

### 3. Separate severity from priority

- `severity`: bug impact only — low, medium, high, critical, very critical.
- `priority`: delivery decision for every item — P0, P1, P2, P3, backlog.
- Reporters provide impact and affected users. A triager confirms severity and priority.

Features then stop showing misleading labels such as “High severity feature”.

### 4. Use one honest lifecycle

Recommended states:

```text
new -> triaged -> ready -> in_progress -> verification -> done
                    \-> backlog
terminal: duplicate | cancelled | wont_do
```

- `resolved` should mean the implementer claims the defect is fixed.
- `verification` should mean staging/production evidence is still required.
- `done` should require acceptance or a recorded reason for waiving it.
- `closed` should not double as “feature backlog”.
- Reopening must preserve the previous resolution attempt and history.

### 5. Use type-specific forms

For bugs, capture expected result, actual result, reproduction steps, environment, page/record ID, frequency, affected users and evidence.

For features, capture the user problem, desired outcome, business value, requester, acceptance criteria and dependencies.

For data work, capture source file/query, expected affected count, dry-run result, backup, reconciliation and rollback plan.

For investigations, capture the question, evidence, decision owner and required output.

### 6. Make the tracker searchable and operational

Add server-side filtering and stable pagination for:

- type, state, severity, priority, component and labels;
- reporter, assignee and unassigned;
- full-text title/description search;
- created, updated, due and completed date ranges;
- deterministic sorting by selected column plus ID.

The current server sorts only by `created_at DESC`. Records with the same timestamp have no tie-breaker, so paging can be unstable. The current client also fetches up to 2,000 records sequentially; a server-paginated table or cursor is more scalable.

### 7. Add history, discussion and relationships

Create append-only history for classification, status, severity, priority, assignee, description and resolution changes. Add comments/mentions, attachments, duplicate-of, parent/child and blocks/blocked-by relationships.

This matters because triagers can currently rewrite the title and description without the bug-report service preserving the original in a ticket history.

### 8. Make resolution and notifications type-aware

- Require a resolution/acceptance note before verification or done.
- Bugs notify “Fixed” only after verification.
- Features notify “Delivered”.
- Data tasks notify “Completed and reconciled”.
- Duplicates notify with a link to the canonical item.
- Do not announce reminders or rejected requests as fixes.

The current service announces every item entering `resolved` as `Fixed: ...`, because it cannot know the work type.

### 9. Correct role consistency

The server allows `admin`, `admin_support`, `manager`, and `sales_manager` to patch tickets. The client hides triage from a plain `admin`, treating that role as a read-only product owner. Choose one policy and enforce it in both places.

Recommended ownership:

- Any authenticated operator: create; view their own submissions.
- Support/manager triage: classify, deduplicate, set impact and assign.
- Product owner: set feature priority, backlog/ready state and acceptance criteria.
- Assignee: update progress and submit for verification.
- Reporter or designated verifier: accept/reopen.

### 10. Fix tracker-specific implementation defects during the redesign

- `very_critical` notifications currently fall through to `info`; only `critical` maps to `error`.
- Default assignment takes the first active `admin_support` result without deterministic ordering. Use a queue owner or explicit routing rule.
- A resolution note is optional even when an item is resolved/closed.
- The assignable-users client comment says only admins/support can call it, while the server also permits managers.
- The server permits admin triage while the UI deliberately hides it.
- Exact and semantic duplicate detection is absent.
- Aggregate status/type counts should come from one counts endpoint instead of four separate status requests.

## Suggested implementation sequence

1. Add `work_type`, `priority`, `component`, `triaged_at`, `started_at`, `verified_at`, `closed_at`, `duplicate_of_id` and indexes.
2. Add history/comments and enforce valid state transitions server-side.
3. Extend DTOs and list/count endpoints with search, type, priority, assignee, component and stable sorting.
4. Backfill the 145 records using the classification in this document; do it in a transaction and export a before/after manifest.
5. Move closed feature requests to `backlog`, except genuinely delivered features, which become `done`.
6. Split the three mixed tickets and link their child work.
7. Replace the client status-only board with saved views, type badges, search, pagination and a type-aware create form.
8. Add transition, permissions, pagination, notification and migration tests before production deployment.

## Code evidence inspected

- `crm-v2-server/src/bug-reports/entities/bug-report.entity.ts`
- `crm-v2-server/src/bug-reports/dto/bug-report.dto.ts`
- `crm-v2-server/src/bug-reports/bug-reports.service.ts`
- `crm-v2-server/src/bug-reports/bug-reports.controller.ts`
- `crm-v2-client/src/api/bug-reports/types.ts`
- `crm-v2-client/src/api/bug-reports/use-bug-reports.ts`
- `crm-v2-client/src/pages/bug-reports/bug-reports-page.tsx`

