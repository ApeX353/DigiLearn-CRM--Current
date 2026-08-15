# Invoice Truth Investigation — Staging Only

This file is the complete handoff between the operator, Codex, and Claude for
Mr Dube's invoice-truth directive. It is intentionally an investigation brief,
not permission to fix, migrate, deploy, commit, push, or change data.

Never place passwords, tokens, private keys, connection strings, database
exports, customer email addresses, or customer phone numbers in this file.

## Claude directive

REQUEST_ID: `invoice-truth-staging-2026-08-14-01`

STATUS: `NEW`

TASK_TYPE: `INDEPENDENT_INVESTIGATION`

ALLOW_PRODUCTION: `NO`

ALLOW_STAGING_WRITES: `NO`

ALLOW_CODE_CHANGES: `NO`

ALLOW_GIT_CHANGES: `NO`

ALLOW_DEPLOYMENT: `NO`

NO_TERMINAL_REPORT: `YES`

### Mandatory read order

Claude must complete this read order before investigating:

1. Read all of `CODEBASE-SKELETON.md` from the first line through EOF. Do not
   rely on an old line count or a previous Claude conversation.
2. In particular, reconcile the money flow in section 4.2, the entity map,
   state machines, permissions, domain rules, environments, migrations, and
   verification gaps against the running staging implementation.
3. Read this entire `INVOICES.md` file.
4. Read the complete current invoice, payment, payment-term, quote, deal,
   dashboard, school-statistics, report, document-generation, settings, and
   relevant client code listed under `Code surface to inspect`.
5. Inspect the exact code currently deployed on staging. Do not assume that a
   local branch, Git commit, or working-tree file is identical to staging.
6. Only then independently reproduce or disprove every finding below.

### Terminal privacy and reporting rule

Do not print the investigation brief, prompts, findings, SQL results, customer
information, credentials, or final report in the terminal.

- Do not start an interactive Claude conversation in the terminal.
- Do not use `echo`, `printf`, `cat`, `type`, `Get-Content`, or similar commands
  to display this brief or the report in a terminal window.
- Use Claude's direct file-reading and file-editing facilities for Markdown and
  source review.
- Keep necessary diagnostic commands non-interactive. Suppress routine stdout
  and stderr where doing so does not hide a failure that must be investigated.
- Never print secrets. Parse credentials without displaying their values.
- Do not copy query output into shell history or a console transcript.
- Write the complete investigation result only under `Claude investigation
  report` at the bottom of this file.
- The result must be understandable without reading Claude chat or terminal
  output.

### Safety boundary

This investigation is staging-only.

- Confirm the database name is exactly `digilearn_crm_staging` before every
  database session.
- Start database reconciliation with `BEGIN READ ONLY` and confirm
  `transaction_read_only = on`.
- Do not connect to, query, export, snapshot, or mutate production.
- Do not insert, update, delete, repair, resequence, allocate, cancel, resend,
  regenerate, or otherwise change any staging invoice, payment, quote, deal,
  installment, allocation, setting, audit log, or file.
- Do not create a test invoice on staging.
- Do not send invoice emails or regenerate PDFs.
- Do not run migrations, seeds, synchronisation, destructive tests, or commands
  that can alter external state.
- Do not edit source code, documentation other than the report section in this
  file, Git state, branches, commits, remotes, or deployment configuration.
- Do not push or deploy anything.
- If safe read-only access is unavailable, set the report status to `BLOCKED`
  and document the exact missing access. Never fall back to production.

### Investigation standard

Treat every Codex finding below as a claim to verify, not as accepted truth.
For every material finding, Claude must report one of:

- `CONFIRMED` — independently reproduced against deployed staging code/data.
- `PARTIALLY CONFIRMED` — only part of the claim is supported; explain exactly
  which part.
- `NOT REPRODUCED` — evidence does not support it; include contrary evidence.
- `HISTORICAL DATA ONLY` — the staging rows are inconsistent, but the currently
  deployed creation path prevents a recurrence.
- `CURRENT CODE RISK` — the deployed code can still create the failure.
- `BLOCKED` — evidence could not be obtained safely.

Distinguish these categories throughout the report:

1. Stored ledger arithmetic.
2. Stored lifecycle/status truth.
3. Display and PDF truth.
4. Dashboard/reporting truth.
5. Historical staging-data defects.
6. Defects the current deployed code can still create.
7. Business-policy questions that code alone cannot settle.

Do not describe a raw numeric total as dollars, rand, revenue, or cash unless
the underlying currency is known and homogeneous. The absence of invoice
currency is one of the primary claims under investigation.

## Executive conclusion from the Codex audit

Codex's staging-only audit concluded that the core invoice/payment arithmetic
mostly reconciles, but staging is not yet trustworthy as an invoice source of
truth. Currency identity is absent, reports double-count split invoices,
payment-derived status can be overridden manually, historical installment
allocations are missing, quotes have produced duplicate master invoices, and
deleted invoice numbers are about to be reused.

This conclusion must be independently challenged by Claude.

## Exact staging scope audited by Codex

- Date of audit: 2026-08-14, Africa/Johannesburg.
- API: deployed `api-staging` container only.
- API container start: 2026-08-13T14:52:32Z.
- Deployed invoice service SHA-256 observed by Codex:
  `9a00f987d2366961edb50713ea67a5b42d295cce787f8e8d53ec2e18ba33fdea`.
- Client: public staging bundle `/assets/index-Cuxfe7_o.js`, 2,820,179 bytes.
- Database: `digilearn_crm_staging`, queried in explicit read-only
  transactions.
- Production was not accessed.
- Codex made no code, Git, deployment, or database changes during the audit.

Claude must record the container timestamp/image identity and public bundle
identity it observes. A changed deployment does not invalidate this brief; it
means Claude must state that it audited a newer staging build.

## Staging population observed by Codex

### Invoice and payment population

| Population | Count |
|---|---:|
| Invoice table rows | 67 |
| Default-list master rows (`parent_invoice_id IS NULL`) | 36 |
| Standalone non-summary masters | 23 |
| Non-payable summary masters | 13 |
| Payable child invoices | 31 |
| Payable non-summary invoices in total | 54 |
| Invoice document items | 67 |
| Payments | 29 |
| Applied invoice payment terms | 14 |
| Installments | 34 |

### Raw values

These are deliberately called raw values because multiple currencies are
mixed and the invoice rows do not preserve their currency.

| Population | Raw value |
|---|---:|
| All 67 invoice rows | 816,358.50 |
| Payable non-summary rows | 517,329.25 |
| Default-list master rows | 517,329.25 |
| Summary rows duplicated from children | 299,029.25 |
| Payment rows | 177,200.00 |

The equality between payable value and visible-master value is expected for
this particular staging population: each split summary mirrors the combined
value of its hidden children. Adding both populations produces the false
816,358.50 total.

## Findings that passed reconciliation

Codex observed all of the following with zero exceptions:

- Duplicate invoice numbers currently present: 0.
- Invoices without document items: 0.
- Invoice document items without an invoice: 0.
- Document-item stored totals differing from the deployed server formula: 0.
- Invoice subtotal/tax/discount/total differing from summed stored items: 0.
- Non-summary `amount_paid` differing from summed payment rows: 0.
- Summary total differing from child totals: 0.
- Summary `amount_paid` differing from child `amount_paid`: 0.
- Overpaid invoices: 0.
- Negative invoice totals: 0.
- Payments recorded directly on summary invoices: 0.
- Missing split parents or children attached to a non-summary parent: 0.
- Applied-term total differing from installment totals: 0.
- Installment `balance != amount - paid_amount`: 0.
- Invoice/payment-term identifier mismatches: 0.
- Summary child count differing from the applied number of installments: 0.
- Future-dated payments: 0.

Claude must re-run equivalent checks and must not generalise these staging
passes into proof that the current code prevents every future failure.

## Finding F01 — invoice currency is absent

Codex classified this as a stop-ship invoice-truth defect.

Observed staging schema:

- The `invoices` table has no currency column.
- The invoice API entity has no currency property.
- Staging has no active `currency` application setting.
- The client currency hook falls back to USD.
- Invoice PDF generation formats invoice items and totals using the global
  setting/fallback rather than an immutable invoice currency.
- Quote and deal records do have currency fields.

Currency context among the 36 master invoices:

| Linked quote currency | Master invoices | Raw value |
|---|---:|---:|
| ZAR | 20 | 287,965.00 |
| USD | 9 | 120,500.00 |
| Null/unresolved | 7 | 108,864.25 |

Consequences to verify:

- ZAR-context invoices can be rendered as USD in the staging UI and PDF.
- Previously issued invoices can change displayed currency if a global setting
  is added or changed later.
- Company-wide invoice, collection, pipeline, school, and report sums combine
  currencies without conversion or grouping.
- Payment rows also lack an immutable currency, preventing a defensible cash
  total across currencies.

Claude must verify the API response, client formatting, PDF generator, email
template data, settings fallback, reports, and export code. Do not infer a
currency for the seven unresolved records.

## Finding F02 — the invoice statistics widget is not ledger-true

Codex reconstructed the year-to-date staging values as follows:

| Metric | Current invoice widget logic | Reconciled payable ledger |
|---|---:|---:|
| Invoice count | 67 | 54 payable rows, or 36 master records |
| Invoice value | 816,358.50 | 517,329.25 |
| Paid/collected value | 126,100.00 | 177,200.00 from payment rows |
| Outstanding value | 690,258.50 | 340,129.25 remaining balance |
| Overdue count | 30 raw rows | 22 payable non-summary rows |

Causes found in deployed/local staging code:

- Invoice statistics include split summary masters and payable children.
- `totalValue` sums every invoice row.
- `outstandingValue` sums full invoice totals by status rather than
  `GREATEST(total - amount_paid, 0)`.
- The Paid card treats invoice status as proof of collection.
- The UI calls `paidValue` "collected" although partial payments are omitted.
- The period is selected using invoice creation/current status rather than
  payment date for collected cash.
- `collectionRate` is paid invoice count divided by collectible invoice count,
  not a cash collection rate.
- The default invoice list hides children, while the statistics count them.

Claude must independently define and compare all three defensible counts:

1. Number of visible master records.
2. Number of legally payable numbered invoice documents.
3. Number of raw table rows.

Do not choose one silently. State which business definition each screen uses.

## Finding F03 — one invoice is marked Paid without payment

Observed record:

| Invoice | Status | Payment status | Total | Amount paid |
|---|---|---|---:|---:|
| `INV-2026-0062` | Paid | Unpaid | 7,800.00 | 0.00 |

Code path found by Codex:

- The invoice preview offers every invoice status, including Paid.
- The status endpoint assigns the requested status without reconciling payment
  rows.
- The general invoice update DTO also includes status and can bypass the
  dedicated status behavior.
- The invoice list hides the Pay button when `invoice.status === "Paid"`, even
  if `payment_status` is Unpaid and a balance remains.
- Invoice statistics count this record as collected.

Claude must verify whether any role restriction, CASL policy, client path, or
database trigger prevents these outcomes. Inspect both PATCH status and PUT
invoice paths.

Do not repair `INV-2026-0062`. Its correct treatment requires supporting
payment evidence or a manager decision.

## Finding F04 — Sent does not prove successful delivery

Codex found that the service stores status `Sent` before PDF/blob/email work.
The generation/send method catches and logs errors without reverting status or
returning a failure. A missing customer email also leaves the invoice Sent
without sending an email.

Claude must verify whether another delivery log, file record, notification
record, or retry mechanism provides authoritative sent/delivered evidence.
Distinguish `issued`, `PDF generated`, `email attempted`, `email accepted`, and
`delivered`; they must not be treated as synonyms without evidence.

## Finding F05 — installment schedules contradict payment records

Observed staging schedule state:

| Measure | Observed value |
|---|---:|
| Installments | 34 |
| Scheduled raw total | 299,329.25 |
| Actually past grace date with balance | 21 |
| Stored installment status `overdue` | 0 |
| Stored installment paid amount | 0.00 |
| Stored installment balance | 299,329.25 |
| Payments tied to payment-plan invoices | 12 |
| Raw value of those payments | 90,400.00 |
| Payment-allocation rows | 0 |

Across all 29 payments:

- Payment amount: 177,200.00.
- Stored `allocated_amount`: 175,100.00.
- Stored `unallocated_amount`: 0.00.
- Allocation-row total: 0.00.
- Arithmetically unallocated without allocation rows: 177,200.00.
- Twenty-eight payment `allocated_amount` values disagree with allocation rows.
- Twenty-nine `unallocated_amount` values disagree with payment minus genuine
  allocations.

The invoice headers reconcile to the payment table, but the installment screen
shows no allocation or installment payment. The current FIFO code contains a
comment explaining a former decimal-string truthiness bug, but no historical
repair was observed.

Claude must determine:

- Whether the deployed current code correctly allocates a newly created
  payment in all role paths.
- Whether the client performs a redundant second allocation after the server's
  automatic allocation.
- Whether current concurrent payments can race while updating installments.
- Whether the absence of allocation rows is entirely historical or still
  reproducible.
- Which reporting endpoints trust tracking columns, allocation rows,
  installments, invoice `amount_paid`, or payment rows.

Do not rebuild allocations during this investigation.

## Finding F06 — overdue has incompatible meanings

Observed staging state:

- Thirty unpaid/non-cancelled raw invoice rows are past effective due date.
- Twenty-two of those are payable non-summary invoices.
- No invoice has stored status Overdue.
- Twenty-one installments are past grace date with balance, but no installment
  has status `overdue`.
- No invoice or installment overdue-status writer was found.

Code inconsistencies found:

- Invoice list/statistics overdue logic uses
  `COALESCE(grace_due_date, due_date)`.
- Dashboard executive and collections queries use `due_date` and ignore grace.
- Some dashboards restrict debt to Sent/Partially-Paid/Overdue and omit Draft
  debt even when past due.
- Collections exports age by `due_date`, not `grace_due_date`.
- The pipeline's `overdue_deals` is a sales-stage SLA measure, while overdue
  invoices are a different signal.

Claude must produce a matrix showing the exact overdue predicate for every
invoice, dashboard, pipeline, report, collection, school, and export consumer.

## Finding F07 — duplicate master invoices exist and remain possible

Five quotes have two master invoices each:

| Quote | Quote status | Master invoices | Combined raw value |
|---|---|---:|---:|
| `QUO-2026-0007` | Draft | `INV-2026-0004`, `INV-2026-0030` | 62,400.00 |
| `QUO-2026-0009` | Draft | `INV-2026-0009`, `INV-2026-0028` | 15,600.00 |
| `QUO-2026-0010` | Draft | `INV-2026-0010`, `INV-2026-0021` | 31,200.00 |
| `QUO-2026-0047` | Accepted | `INV-2026-0067`, `INV-2026-0068` | 23,400.00 |
| `QUO-2026-0053` | Accepted | `INV-2026-0063`, `INV-2026-0064` | 23,400.00 |

Aggregate exposure observed:

- Ten master invoices.
- Combined raw value: 156,000.00.
- Potential duplicate value if one invoice per quote is authoritative:
  74,100.00.
- One duplicate group has differing invoice totals.
- Payments on duplicate master invoices: 31,200.00.

Current code risks found:

- Manual invoice creation accepts a `quote_id` without checking whether another
  master invoice already exists for it.
- Quote conversion checks for an existing invoice only inside the
  `quote.status === "Accepted"` branch.
- There is no database uniqueness constraint covering master `quote_id`.

Claude must distinguish legitimate installment children from duplicate master
invoices. Exclude `parent_invoice_id IS NOT NULL` from the duplicate-master
check.

Do not delete, cancel, merge, relink, or choose an authoritative duplicate.
The five groups require human evidence, especially because payments exist.

## Finding F08 — deleted invoice numbers will be reused

Observed staging evidence:

- Highest currently stored invoice number: `INV-2026-0077`.
- Audit logs record deleted invoices `INV-2026-0078` through
  `INV-2026-0081`.
- Ten numbers between `0001` and `0077` are also absent from the invoice table.
- The next-number algorithm takes MAX from currently existing invoice rows and
  adds one.
- The invoice-number unique index protects only currently existing rows.

Therefore, unless the staging deployment has changed, the next invoice will
reuse `INV-2026-0078`, a number already present in deletion history and
possibly in previously generated PDFs or emails.

Additional concerns:

- Managers/admins can hard-delete an invoice.
- Payments cascade-delete with the invoice.
- Child invoices are detached with `SET NULL` if the summary parent is
  deleted.
- Document items are deleted before the invoice, outside one transaction.
- The delete activity log is written after deletion, also outside that
  transaction.

Claude must verify all cascade behavior against the actual staging constraints
and deployed service. Do not create an invoice merely to prove number reuse.

## Finding F09 — discount semantics disagree between client and server

The client labels line discount `Disc %` and calculates:

`discount amount = quantity * unit price * discount / 100`

The server calculates:

`discount amount = discount`

Example with quantity 1, unit price 1,000, discount 10, zero tax:

- Client preview/form meaning: 10% discount, total 900.
- Server stored meaning: fixed 10-unit discount, total 990.

The PDF prints stored discount as a currency amount, while the client preview
prints the same stored value with a percent sign and recalculates line totals.

All 67 staging invoice items currently have zero discount and zero tax, so
Codex found no existing row-level mismatch. This is a latent current-code risk,
not proof that an existing invoice is mispriced.

Claude must also inspect product discount semantics and quote calculation,
because both feed invoice creation and quote conversion.

## Finding F10 — invoice edits can break dependent financial structures

Code risks found:

- Items can be added, changed, or removed without blocking Paid, Cancelled,
  Sent, summary, or payment-plan invoices.
- Item edits recalculate only the invoice header.
- They do not rebuild applied terms, installments, summary children, payment
  status, overpayment state, or the linked deal value.
- `UpdateInvoiceDto` inherits `payment_term_id` and `status` from create.
- Changing `payment_term_id` does not apply/rebuild a payment schedule.
- Changing `due_date` does not update `grace_due_date` or installments.
- Updating an invoice writes the linked deal's value using the invoice total,
  but later item-specific edits do not.
- Invoice creation and quote conversion overwrite `deal.value` with an invoice
  total, so the latest paperwork can replace the manager's commercial value.

Claude must map every invoice mutation to all derived structures and identify
which writes are transactional.

## Finding F11 — server validation does not fully protect monetary truth

Code risks found:

- The server validates that `items` is an array but does not require at least
  one item.
- Discount has no upper bound and can exceed the line subtotal.
- Tax rate has no upper bound.
- The database has no checks enforcing non-negative totals, paid amount not
  exceeding total, status/payment consistency, or summary/child rules.
- The payment API enforces only a positive amount. It does not enforce amount
  less than or equal to the outstanding balance.
- The browser form applies an overpayment maximum, but direct API callers do
  not receive equivalent protection.
- Payment creation, invoice recalculation, FIFO allocation, parent
  recalculation, and audit logging are not one atomic transaction.
- Allocation reversal and payment deletion/update are also not one atomic
  transaction.

Staging currently has no negative or overpaid invoice, so separate existing
data truth from future-code exposure.

## Finding F12 — quote, deal, school, and ownership links disagree

Observed staging data:

- Twenty master invoices have a linked quote that is not Accepted: nine Draft
  and eleven Expired.
- Six master invoices have a quote with a deal but have no invoice `deal_id`.
- No master invoice was found where both quote and invoice had different
  non-null deal IDs.
- Two invoice/quote school mismatches exist.
- One invoice/deal school mismatch exists: `INV-2026-0041`.
- Three payable linked invoices have `owner_id` different from the deal
  assignee, representing raw value 23,400.00.
- One master invoice owner differs from its quote owner.

Consequences to verify:

- Deal and pipeline invoice totals can omit invoices whose `deal_id` is null.
- Sales-rep invoice lists scope by invoice owner, while some dashboards scope
  through the linked deal assignee.
- Manager-created invoices on rep deals can therefore appear in one view and
  disappear from another.
- School dashboards can attribute invoice debt inconsistently.

Do not assume that every owner mismatch is wrong; managers may legitimately
create invoices. Report visibility and attribution behavior separately from
the business decision about ownership.

## Finding F13 — downstream finance consumers use different truths

Codex found these incompatible consumers:

### Invoice page

- Default list excludes child invoices.
- Statistics include every row.
- Balance columns use `total - amount_paid`.
- Pay-button visibility uses invoice status rather than payment status/balance.

### Sales performance report

- Cash collected sums `invoice.amount_paid` only for invoices whose `paid_date`
  falls in the period.
- This omits partial cash and attributes the entire paid amount to the final
  paid date.
- It can double-count a paid summary and its paid children.
- Outstanding includes summary and child rows.

### Finance report

- Revenue by method correctly starts from payment rows.
- Outstanding invoice list includes summary and child rows.
- Upcoming installments trust stale installment status/balances.

### Dashboard executive and collections widgets

- Cash collected starts from payment rows.
- Role filtering is reached through linked deal assignee and can omit invoices
  without a deal or with ownership/assignment mismatch.
- Overdue/collections logic ignores grace date.
- Summary and child rows can both contribute once a summary becomes Partial.

### School statistics

- Outstanding totals sum full invoice total, not remaining balance.
- Summary and child invoices are both eligible.

### Collections export

- Includes Unpaid/Partial invoices without excluding Cancelled status.
- Includes summary and child rows.
- Uses due date rather than grace date.
- PDF/XLSX headings hard-code `$` instead of invoice currency.

### Pipeline

- Pending Collections and won invoice value exclude summary rows, which avoids
  that particular double count.
- Only invoices with `deal_id` contribute.
- Pending Collections includes only Sent/Partially-Paid/Overdue statuses.
- Won value is filtered by the deal's actual close date, not invoice issue date.
- Values still mix currencies.

Codex observed these raw outstanding comparisons:

| Consumer-style calculation | Raw value |
|---|---:|
| Reports outstanding including summaries | 548,758.50 |
| Reconciled non-summary outstanding | 340,129.25 |
| School-style full Sent/Partial/Overdue totals | 360,641.66 |
| Dashboard-style balances including summaries | 211,341.66 |
| Non-summary Sent/Partial/Overdue balances | 76,176.66 |

Claude must reproduce a source-of-truth matrix that names the table, date
column, currency handling, summary filter, status filter, and balance formula
for every consumer.

## Finding F14 — test coverage is insufficient

Codex found no direct `InvoicesService` test suite. A payment service spec and
installment-calculation spec exist, but no focused regression coverage was
found for:

- Invoice create and item calculations.
- Percentage discount semantics.
- Currency preservation.
- Quote conversion and duplicate prevention.
- Status/payment invariants.
- Split summary/child statistics.
- Invoice deletion and number permanence.
- Invoice/payment transaction failure handling.
- Invoice stats, dashboard, school, reports, and exports agreeing.
- Staging data reconciliation.

Claude must verify the current test inventory rather than relying on filenames
alone. Report tests that assert behavior, not tests that merely instantiate a
service.

## Investigation 3 - Herentials pipeline, partial payments, and approval

### Implementation trail - local only, 2026-08-14

STATUS: `IMPLEMENTED_LOCALLY_AWAITING_USER_TEST`

The operator authorised a fix for Investigation 3 only. No staging or
production data was changed, no deployment was performed, and no Git operation
was performed.

Implemented behavior:

- Paid and Partially-Paid can no longer be written directly through invoice
  update/status endpoints. The preview actions open payment capture instead.
- Partial payment starts with an empty amount field; full payment starts with
  the current outstanding amount.
- Sales-rep submissions create a pending payment-entry request and leave every
  financial total unchanged until approval.
- Admin and sales-manager submissions post immediately.
- The authenticated submitter is stored as `recorded_by_id`; the browser cannot
  choose the actor.
- Sales managers/admins can approve or reject payment entries from a dedicated
  Approval Queue tab. Approval rechecks ownership and current outstanding,
  then creates the payment, FIFO allocations, child/summary invoice states,
  request decision, and activity evidence in one transaction. Rejection
  requires a note and creates no payment.
- Pending requests reserve available balance against other pending requests,
  while approval still performs a locked current-balance recheck.
- The client no longer makes a second, role-dependent allocation call after
  the server posts a payment.
- Invoice and deal cards display Total, Verified Paid, Outstanding, and a
  payment-derived state separately. Payment availability depends on actual
  outstanding rather than a manually stored Paid label.
- Deal-linked invoice, installment, preview, and payment-capture amounts use
  the linked deal/quote currency when available, so the ZAR Herentials and
  Wanezi amounts are not rendered with the USD fallback.
- Pipeline Pending Collections includes non-Draft, non-Cancelled invoices with
  a real positive balance, so Wanezi INV-2026-0062 is not hidden by its stale
  manual Paid label.
- The aging report rebuilds installment paid/balance/status in memory from
  authoritative invoice paid totals using FIFO and calculates active overdue
  from the grace/effective due date. Fully paid installments no longer appear
  as active debt, fixing the Herentials 39,000 projection without fabricating
  another payment.

Local schema trail:

- Migration `1783000000000-AddPaymentEntryApprovals.ts` creates
  `payment_entry_requests`, adds the payment recorder/request links, indexes the
  review paths, and backfills recorder IDs from existing Payment create
  activity logs where evidence exists.
- The migration ran successfully only against the local PostgreSQL database.

Verification completed:

- Server production build: passed.
- Client production build: passed.
- Focused PaymentsService and DealsService suites: 11 tests passed.
- Local migration: passed.
- Local API started on port 3001 and local client started on port 5174.
- In-app browser smoke test: not run because no browser backend was available
  in this session; operator test remains required.

Historical Herentials/Wanezi rows were not mutated. Their display is corrected
from ledger evidence, but permanent staging-data repair or duplicate-invoice
decisions still require a separately approved reconciliation.

### Product-owner requirement captured on 2026-08-14

This section records the requested behavior as an auditable requirement. It is
not authorization to implement or repair staging data.

- When a user chooses `Partially-Paid`, the system must ask how much was paid.
- The authenticated user must be captured automatically as the person who
  entered the payment. There must be no actor picker and the client must not be
  trusted to supply an arbitrary actor ID.
- A sales representative may submit a payment only for an invoice they own.
- A sales-representative submission must go to sales managers in the existing
  Approval Queue before it changes payment, invoice, installment, pipeline, or
  reporting totals.
- Admin and sales-manager entries do not need approval, but must still retain
  who entered them and when.
- After an approved or directly authorized payment is posted, the amount paid,
  outstanding balance, invoice status, installment allocation, pipeline
  balance, and overdue state must all update from the same committed event.

The phrase "if the owner of the invoice is a sales rep" could mean either the
actor's role or merely the invoice owner's role. The safest enforceable rule is:
a sales-rep actor may submit only against their own invoice and always requires
manager approval. Admin and sales-manager actors may post directly. Claude must
flag any contrary business interpretation before implementation.

### Herentials staging reproduction

Codex reproduced the reported case in the staging database using an explicit
read-only transaction. The school is stored as `Herentials College`; its won
deal is `interactive board`, with a deal value of 39,000.00 and currency ZAR.

The invoice family linked to the deal is:

| Invoice | Kind | Stored status | Total | Paid | Stored outstanding |
|---|---|---|---:|---:|---:|
| INV-2026-0058 | Summary/master | Partially-Paid | 39,000.00 | 13,000.00 | 26,000.00 |
| INV-2026-0059 | Child 1 | Paid | 13,000.00 | 13,000.00 | 0.00 |
| INV-2026-0060 | Child 2 | Draft | 13,000.00 | 0.00 | 13,000.00 |
| INV-2026-0061 | Child 3 | Draft | 13,000.00 | 0.00 | 13,000.00 |

INV-2026-0059 has two existing payment rows of 6,500.00 each. They total
13,000.00. The summary invoice correctly rolls those payments up to
`amount_paid = 13,000.00`; there are no direct payments on the summary invoice.
The ledger-true remaining balance for this family is therefore 26,000.00, not
39,000.00.

The payment-term installment rows contradict those invoice/payment rows:

| Installment | Linked child invoice | Stored status | Amount | Paid amount | Balance |
|---:|---|---|---:|---:|---:|
| 1 | INV-2026-0059 | pending | 13,000.00 | 0.00 | 13,000.00 |
| 2 | INV-2026-0060 | pending | 13,000.00 | 0.00 | 13,000.00 |
| 3 | INV-2026-0061 | pending | 13,000.00 | 0.00 | 13,000.00 |

No payment-allocation row connects either existing payment to installment 1.
The pipeline is therefore not displaying the authoritative invoice balance; it
is summing stale installment balances.

The exact display chain is:

1. `reports-read.service.ts#getAgingReport` excludes only installments whose
   own stored status is `paid`.
2. It derives each balance as `installment.amount -
   installment.paid_amount` and derives overdue days from `due_date`.
3. `view-deal-details.tsx` filters that global aging list to invoice IDs on the
   deal and sums each returned `installment.balance`.
4. Because all three installment rows still say pending and paid amount zero,
   the deal screen shows 39,000.00 outstanding.
5. Because installment 1 remains pending, its days-overdue counter increases
   every day even though the linked child invoice is fully paid.

As of 2026-08-14, installment 1 is 59 days after its 2026-06-16 due date. It is
29 days after its 2026-07-16 grace date. The current report uses the former;
other invoice paths use the grace date. In this case neither active-overdue
number is valid because that installment has already been fully paid. If the
business needs a late-payment history, it must be a separate historical field,
not an active overdue counter.

The deal currency is ZAR. The pipeline can nevertheless format this value with
the application's USD fallback because invoices have no currency column and
staging has no usable global currency setting. Thus the reported `$39,000`
combines two defects: a stale 39,000 installment balance and the wrong currency
identity. See F01 and F06.

Expected Herentials display after an evidence-backed data repair is:

- Total: ZAR 39,000.00.
- Paid: ZAR 13,000.00.
- Outstanding: ZAR 26,000.00.
- Installment 1: Paid, balance zero, and not actively overdue.
- Installments 2 and 3: 13,000.00 outstanding each; neither is overdue as of
  2026-08-14.

Do not create another 13,000.00 payment to obtain that result. The cash/payment
rows already exist; another payment would double-count collections. Any repair
must reconstruct the missing allocation/status projection from the existing
payments, after a separate approved repair plan and backup/reconciliation.

### Wanezi precision case - Paid and Unpaid on the same invoice

Codex also reproduced the Wanezi case against staging in a read-only
transaction. Staging contains four separate school master rows whose names are
variations of Wanezi, including two identically displayed as `Wanezi High
School.` and one misspelled `Wanezi High Scool`. The two won deals in question
belong to two different duplicate Wanezi school IDs. This matters because a
name-based school total can combine or omit records unpredictably.

The two won deals and their deal-linked invoices are:

| Deal | Deal value/currency | Invoice | Invoice status | Payment status | Total | Payment rows | True outstanding |
|---|---:|---|---|---|---:|---:|---:|
| 2 interactive boards | ZAR 7,800.00 | INV-2026-0062 | Paid | Unpaid | 7,800.00 | 0.00 | 7,800.00 |
| Interactive Boards Wanezi | ZAR 15,600.00 | INV-2026-0076 | Partially-Paid | Partial | 15,600.00 | 7,800.00 | 7,800.00 |

The two deal values total ZAR 23,400.00. One genuine payment of ZAR 7,800.00
exists, on INV-2026-0076. Therefore the reconciled outstanding across the two
deal-linked invoices is ZAR 15,600.00.

INV-2026-0062 is the exact contradiction reported by the operator. Its
`status` was changed from Draft to Paid through the generic status control by a
sales-manager actor on 2026-03-20. Its `payment_status` remained Unpaid,
`amount_paid` remained zero, `paid_date` remained null, and it has no Payment
row. It is not paid in ledger terms.

The deal-details invoice card makes both database values visible at once:

- it prints `Status: {invoice.status}`, which produces `Status: Paid`;
- it then prints an unlabelled badge from `invoice.payment_status`, which
  produces `Unpaid`;
- it prints invoice total but does not print paid amount or outstanding amount.

This is why the same invoice appears Paid and Unpaid. The values disagree in
storage; the UI is exposing both without explaining that one is a manually
editable document label and the other is payment-derived.

The inconsistency affects actions and totals as well as wording:

- The invoice list calculates INV-2026-0062 outstanding as 7,800.00, but hides
  its Pay button because `invoice.status === 'Paid'`.
- The deal-details page permits Add Payment because it checks the calculated
  balance and only excludes Cancelled. The two pages therefore disagree on
  whether the same invoice can be paid.
- Pipeline Pending Collections includes only invoice statuses Sent,
  Partially-Paid, or Overdue. It excludes INV-2026-0062 solely because its
  manual invoice status says Paid, even though its payment status is Unpaid and
  its balance is 7,800.00.
- For these two deals, that filter can report only 7,800.00 pending instead of
  the ledger-true 15,600.00.

There is also a third Wanezi invoice, INV-2026-0075:

- Status Draft, payment status Unpaid, total and outstanding 15,600.00.
- It has no `deal_id`, but its source quote belongs to the second Wanezi deal.
- Its Draft source quote and invoice describe four 86-inch boards. The accepted
  quote and INV-2026-0076 describe four 85-inch boards for the same deal.
- It was created one day before INV-2026-0076.
- Its quote/deal use one Wanezi school master ID while the invoice itself uses
  the other duplicate Wanezi school master ID.

This is a likely superseded or duplicate draft, but code and data cannot prove
whether it represents a separate legal obligation. Do not delete it, cancel it,
or count it as confirmed collectible without manager review of the underlying
customer documents. Raw outstanding across all three Wanezi invoice rows is
31,200.00; confirmed deal-linked outstanding is 15,600.00; the remaining
15,600.00 is an unresolved Draft document, not a confirmed collection. The UI
must label those scopes instead of presenting one ambiguous "Outstanding"
number.

Wanezi has no installment rows. Its one Payment says 7,800.00 allocated, while
there are zero payment-allocation rows. This does not change the invoice balance
calculation, but it is another allocation-audit contradiction for F05.

The precise deal invoice card should show separately:

- Invoice Total.
- Verified Payments.
- Outstanding Balance (`max(total - verified payments, 0)`).
- Payment State, derived from those values.
- Document State, restricted to non-financial lifecycle values such as Draft,
  Sent/Issued, and Cancelled.
- Due/Overdue state only when outstanding is positive, using the agreed
  effective due date.

Financial states Paid and Partially-Paid must not remain independent choices
that can contradict Payment rows. If kept as convenient dropdown actions,
`Paid` must open payment capture with the full current balance and
`Partially-Paid` must ask for the amount; both follow the same audit and approval
rules described below. The status saved after posting must still be derived
from the resulting ledger.

### Current partial-payment behavior is not an approval workflow

The status dropdown in `invoice-preview-modal.tsx` includes
`Partially-Paid`. Selecting it calls the generic invoice status endpoint.
`InvoicesService.updateStatus` assigns the requested status directly. That
action does not ask for an amount, create a Payment, allocate cash, deduct the
balance, or retain an entered-by field. It can therefore label an invoice
partially paid without any payment evidence.

The separate `AddPaymentModal` already captures amount, payment date, method,
reference, and notes. It validates `amount <= outstanding` only in the client.
The server currently accepts admin, sales_manager, and sales_rep on
`POST /payments`. It immediately saves a payment, recalculates invoice and
parent status, attempts FIFO allocation, and writes an activity-log record.
There is no pending review stage.

The `payments` table/entity has no `recorded_by_id`, `entered_by_id`,
`requested_by_id`, `approved_by_id`, or `rejected_by_id`. ActivityLog records
identify an actor after the save, but that is not a direct, immutable payment
audit link and does not implement approval. The two payments on
INV-2026-0059 each have a create activity whose actor was a sales manager; the
payment rows themselves do not identify that actor.

The existing Approval Queue is a UI aggregation of lead reversal requests,
assignment proposals, and import batches. Its navigation badge counts only
those sources. Deal rollback requests and cash requisitions provide useful
request/review transaction patterns, but there is no staging table, endpoint,
queue section, badge count, or request lifecycle for customer payment entries.
"AP already exists" is therefore true at the queue-shell level, not at the
payment-approval data-model level.

The current Herentials child and summary invoices are owned by a
`sales_manager`, not a `sales_rep`. Under the stated bypass rule, a future
payment entered by an admin or sales manager would post directly while still
recording the actor. This historical record does not exercise the proposed
sales-rep approval path.

### Required workflow contract

`Partially-Paid` must become a derived financial state, not a freely editable
status. The product UI may retain that dropdown choice as an entry point, but
choosing it must open the payment-capture form. The final stored status must be
calculated from committed payment totals:

- paid amount <= 0: no paid/partial status is implied;
- 0 < paid amount < invoice total: `Partially-Paid`;
- paid amount >= invoice total: `Paid`;
- cancelled remains an explicit non-financial lifecycle action governed
  separately.

The server, not the browser, must enforce positive finite amounts, currency,
payment date rules, invoice ownership, non-summary target, current outstanding,
and `amount <= current outstanding`. It must recheck these rules at approval
time because other payments can be posted while a request waits.

For a sales-rep actor:

1. Capture amount, payment date, method, reference, and notes against an owned
   non-summary invoice.
2. Derive `requested_by_id` from the authenticated token.
3. Create a pending payment-entry request only. Do not create a Payment or
   change any financial balance/status yet.
4. Show that request in a dedicated Payment Entries section of Approval Queue
   and include it in the approval badge.
5. On manager approval, lock and re-read both request and invoice, reject a
   stale/duplicate/over-balance request, create the Payment, allocate it,
   recalculate the child and summary invoice, update the installment projection,
   and mark the request approved in one database transaction.
6. On rejection, record reviewer, timestamp, and review note without making any
   financial mutation.

For an admin or sales-manager actor, use the same payment fields and server
validation but post immediately in one transaction. Save the authenticated
actor on the Payment itself. Do not require or allow the UI to choose who
entered it.

A pending request may show a clearly labelled projected balance, but it must
not reduce actual outstanding, collections, pipeline, invoice status, or
reports. Concurrent pending requests must not be allowed to over-commit the
same outstanding balance; approval must always recheck rather than trusting a
submission-time snapshot.

### Minimum audit model

Claude should independently validate the exact schema design, but the minimum
durable evidence is:

- Payment: `recorded_by_id`, `recorded_at`, and a link to the approved request
  when applicable.
- Payment-entry request: invoice ID, submitted monetary and payment fields,
  invoice owner snapshot, outstanding/currency snapshot, `requested_by_id`,
  request timestamp, status, reviewer ID, review timestamp, review note, and
  resulting payment ID.
- Activity log: request creation, approval/rejection, payment creation, and any
  later correction/reversal, with before/after monetary values.
- Database foreign keys and indexes for invoice, requester, reviewer, status,
  and resulting payment.

The application currently permits admin and sales_manager to update and delete
payments. A trustworthy ledger should retain who changed a payment and why;
hard deletion must not erase the original entry or audit chain. Claude must
include this in the risk assessment even if reversal governance is scheduled
as a later delivery.

### Transaction and projection invariants

- Payment creation, allocation, invoice recalculation, summary recalculation,
  installment update, request approval, and audit write must commit or roll
  back together. The current payment path is not atomic across those actions.
- FIFO must have one server-owned execution path. The client currently calls a
  manual allocation endpoint after the server already attempts auto-allocation,
  creating a redundant and role-dependent second attempt.
- A paid installment can never contribute to active outstanding or active days
  overdue.
- All invoice, pipeline, school, dashboard, collection, and export views must
  consume one documented balance and effective-due-date policy.
- Summary invoices must roll up child payments without accepting direct cash.
- An approved amount that completes the balance must produce `Paid`, even if
  the user originally opened the form through `Partially-Paid`.
- No workflow may infer currency from a display fallback. Herentials is ZAR and
  must be labelled and calculated as ZAR.

### Roles requiring a product decision

The explicit bypass list is `admin` and `sales_manager`. The codebase also has
`manager` and `admin_support`; `admin_support` currently inherits `admin` at the
role guard. Implementation must not silently grant either role direct-payment
or approval authority. Mr Dube or the product owner must decide and document:

- whether `manager` can review payment requests, post directly, or view only;
- whether `admin_support` should truly inherit the admin payment bypass;
- whether a sales manager may approve their own request if role or ownership
  changes;
- whether notes and/or a reference are mandatory for every payment;
- how payment mistakes are reversed without deleting audit history.

### Acceptance scenarios Claude must add to its investigation

1. Sales rep submits a valid partial amount on their own invoice: request is
   pending and every financial total remains unchanged.
2. Sales rep targets another owner's invoice: server rejects without exposing
   the foreign record.
3. Manager approves a still-valid request: exactly one Payment is created and
   all dependent balances/statuses change atomically.
4. Manager rejects: no Payment or financial mutation occurs; reviewer and note
   remain visible.
5. Another payment reduces the balance before approval: stale request cannot
   overpay and produces no partial commit.
6. Submitted amount clears the balance: resulting status is Paid, not forced
   Partially-Paid.
7. Admin and sales manager post directly: no pending request, but the Payment
   shows the authenticated recorder.
8. Refresh/retry/double-click cannot create duplicate requests or payments.
9. Herentials reconciliation produces 13,000.00 paid and 26,000.00 outstanding,
   with paid installment 1 absent from active overdue totals.
10. Pipeline, invoice list/detail, school, dashboard, collections report, and
    exports agree on the same Herentials balance and ZAR currency.
11. The two Wanezi deal-linked invoices show ZAR 23,400.00 total, ZAR 7,800.00
    verified paid, and ZAR 15,600.00 outstanding; INV-2026-0062 cannot display
    Paid or disappear from collections while it has no payment evidence.
12. INV-2026-0075 is shown separately as an unresolved Draft/superseded-document
    candidate and is not silently merged with confirmed deal-linked
    collections.

Claude must classify this Investigation 3 evidence using the same statuses as
F01-F14 and include a separate disposition for: Herentials stale installment
projection, active overdue counting, currency display, actor audit gap, and
missing payment-approval persistence. It must also separately classify the
Wanezi Paid/Unpaid contradiction, pipeline undercount, duplicate school-master
links, and unresolved Draft invoice.

## Code surface to inspect

Claude must read the complete relevant implementation, not only matching
snippets.

### Server — invoice authority

- `crm-v2-server/src/invoices/invoices.controller.ts`
- `crm-v2-server/src/invoices/invoices.service.ts`
- `crm-v2-server/src/invoices/invoices.module.ts`
- `crm-v2-server/src/invoices/entities/invoice.entity.ts`
- `crm-v2-server/src/invoices/guards/can-access-invoice.guard.ts`
- Everything under `crm-v2-server/src/invoices/dto/`
- Everything under `crm-v2-server/src/invoices/constants/`
- `crm-v2-server/src/document-items/entities/document-item.entity.ts`

### Server — money flow and dependencies

- Everything under `crm-v2-server/src/payments/`
- Everything under `crm-v2-server/src/payment-terms/`
- Relevant quote calculation, update, acceptance, and conversion paths under
  `crm-v2-server/src/quotes/`
- Relevant deal summary/value/close paths under `crm-v2-server/src/deals/`
- `crm-v2-server/src/document-generator/document-generator.service.ts`
- Relevant settings entity/service/seed behavior under
  `crm-v2-server/src/settings/`
- `crm-v2-server/src/dashboard/dashboard.service.ts`
- `crm-v2-server/src/reports/reports-read.service.ts`
- `crm-v2-server/src/reports/report-export.service.ts`
- `crm-v2-server/src/schools/schools.service.ts`
- Invoice/deal cleanup in `crm-v2-server/src/leads/leads.service.ts`
- Activity-log implementation used by invoice/payment mutations.
- All migrations affecting invoices, quote currency, payment terms,
  installments, payments, allocations, foreign keys, and indexes.

### Client — invoice entry and presentation

- Everything under `crm-v2-client/src/api/invoices/`
- `crm-v2-client/src/pages/invoices/create-invoice-page.tsx`
- `crm-v2-client/src/pages/invoices/invoices-page.tsx`
- `crm-v2-client/src/pages/invoices/invoice-schedule-page.tsx`
- Everything under `crm-v2-client/src/components/invoices/`
- `crm-v2-client/src/components/document-items.tsx`
- `crm-v2-client/src/components/finance/payment-terms-calculator-modal.tsx`
- Quote preview/create components using the shared document-item model.
- `crm-v2-client/src/hooks/use-currency.ts`
- Settings provider logic supplying currency.
- Deal and school pages that display invoices, payments, schedules, pipeline
  totals, or collections.

### Tests and deployed artifacts

- All server/client tests mentioning Invoice, Payment, Installment, Allocation,
  Quote conversion, Pipeline Summary, Dashboard, Reports, or School Stats.
- The compiled invoice/payment/payment-term/dashboard/report services inside
  the currently running staging API container.
- The currently served staging client JavaScript bundle.
- The applied staging migration list and actual constraints/indexes from
  PostgreSQL.

## Read-only reconciliation checklist for Claude

Claude's investigation must cover at least these checks:

1. Confirm staging database identity and read-only transaction state.
2. Record deployed API/client build identity.
3. Header totals versus line-item sums.
4. Server fixed-discount formula versus client percentage formula.
5. Invoice `amount_paid` versus payment sums.
6. Payment status, invoice status, paid date, and remaining balance invariants.
7. Summary totals/paid values versus children.
8. Applied-term totals versus installments and child invoices.
9. Installment paid/balance/status versus allocation rows and dates.
10. Payment allocated/unallocated tracking versus genuine allocations.
11. Duplicate invoice numbers and deleted-number reuse.
12. Duplicate master invoices per quote, excluding installment children.
13. Quote/deal/school/person/owner linkage consistency.
14. Invoice, quote, deal, payment, PDF, and global-setting currency behavior.
15. Empty, negative, over-discounted, overpaid, future-dated, and orphan rows.
16. Invoice list count/value versus statistics count/value.
17. Payment-date cash versus paid-invoice-date cash.
18. Outstanding and overdue results across every consumer.
19. Cancelled, Draft, Sent, Partial, Paid, summary, and child inclusion rules.
20. Permissions and role attribution for rep, manager, sales manager, admin,
    and admin-support where applicable.
21. Hard-delete, foreign-key cascade, audit-log, file, and number-reuse effects.
22. Transaction boundaries and partial-failure outcomes.
23. Current tests that would fail if each confirmed defect were fixed or
    reintroduced.

Use counts and non-sensitive business identifiers such as invoice/quote
numbers. Do not copy customer contact details into the report.

## Questions Claude must answer

1. Can Mr Dube treat an invoice PDF generated today on staging as having the
   correct amount and correct currency? Answer separately for amount and
   currency.
2. Which field/table is authoritative for cash received?
3. Which field/table is authoritative for outstanding balance?
4. Is invoice status derived evidence or a manually editable label?
5. What exactly does Total Invoices count?
6. What exactly does Collection Rate measure?
7. Can the current deployed code still create two master invoices for one
   quote? List every path.
8. Will the next invoice number reuse a deleted number?
9. Can a payment be recorded successfully while schedule allocation fails?
10. Can a report show different debt than the invoice list for the same rows?
11. Which staging inconsistencies are historical only, and which remain
    reproducible in current code?
12. What is the safest repair order that preserves evidence and avoids
    fabricating financial history?
13. For Herentials and Wanezi specifically, what should each deal-linked card
    show for total, verified paid, outstanding, payment state, and overdue?
14. Which persisted entity and transaction boundary should implement a
    sales-rep payment request, manager review, and resulting immutable audit
    trail without changing balances before approval?

## Required Claude report format

Claude must replace only the placeholder under `Claude investigation report`.
Do not rewrite or delete the Codex evidence above.

The report must contain:

1. `STATUS`: `DONE` or `BLOCKED`.
2. Audit timestamp and exact staging build/database identity.
3. One-paragraph verdict suitable for Mr Dube.
4. A finding-by-finding disposition for F01 through F14.
5. A separate Investigation 3 disposition covering Herentials, Wanezi, partial
   payment capture, role-based approval, and actor attribution.
6. Exact staging counts and raw values independently observed.
7. A source-of-truth matrix for invoice value, currency, paid cash,
   outstanding balance, overdue state, and installment allocation.
8. Separate lists for existing staging data defects and current-code risks.
9. Any Codex claim Claude disproved or corrected.
10. A data-safe remediation sequence with migration/backfill/rollback concerns.
11. Records requiring human evidence before correction.
12. Test gaps and the minimum regression matrix.
13. Confirmation that production was untouched and no writes, code changes,
    Git operations, or deployments occurred.

Do not implement fixes. End with a short section titled `Approval needed before
implementation` describing the decisions Mr Dube or the manager must make.

---

## Claude investigation report

STATUS: `DONE` — code-truth (F01–F14 + Investigation 3) and staging DATA
reconciliation both complete. All findings verified read-only against
`digilearn_crm_staging`; no Codex claim disproved (two adjustments noted).
Production untouched; no writes/code/git/deploy changes; only this report section
edited.

### Audit identity (independently observed 2026-08-14)

- Deployed staging CLIENT bundle: `assets/index-Cuxfe7_o.js` — **byte-for-byte
  the same filename Codex recorded**, so this pass audits the same staging
  client build Codex did.
- Deployed staging API health probe (`/api/v2`): 404 on the bare prefix
  (expected; routes are namespaced), API reachable.
- Local audit baseline: committed `HEAD = 6f53578`, read via `git show HEAD:…`.
  The working tree has 59 uncommitted files (operator actively coding) and was
  deliberately NOT used as the audit source.
- **Scope limitation:** I cannot cryptographically confirm the deployed *server*
  container SHA-256 Codex cited without SSH into the VPS, which the permission
  layer blocks. I audited committed `HEAD`; the client bundle match gives high
  confidence the server is at/near this commit, but this is stated, not proven.

### DATA-reconciliation access — BLOCKED (exact missing access)

Every finding requiring staging-row confirmation (`CONFIRMED` / `HISTORICAL
DATA ONLY` verdicts, exact counts/raw values, Herentials & Wanezi row
reconciliation) is **BLOCKED**: `pg-staging` has no public port and is only
reachable via `ssh → docker exec` on the VPS; SSH is blocked for the
investigating agent, and routing SQL through the operator's shell would print
results in the terminal, which this brief forbids. Per the brief's own rule I
mark this BLOCKED rather than fall back to production (production was never
touched). Terminal-safe unblock: operator runs the read-only SQL
(`BEGIN READ ONLY` on `digilearn_crm_staging`) and redirects output to a
gitignored local file for me to read.

### Code-truth dispositions — pass 1 (verified against committed `invoices.service.ts` + `invoice.entity.ts`)

- **F01 (currency absent) — CURRENT CODE RISK, CONFIRMED (code).** `invoice.entity.ts`
  has zero currency references. Neither `create()` nor `convertFromQuote()` sets
  a currency. `generateAndSendInvoice()` formats the emailed/PDF total with
  `appSettingsService.getSetting('currency')` falling back to `'USD'`
  (`toLocaleString('en-ZA', { currency: currency?.value ?? 'USD' })`). A
  ZAR-context invoice is therefore rendered with the global/fallback code, and a
  later setting change retroactively re-labels issued invoices. Data split by
  linked-quote currency is DB-pending.
- **F02 (stats not ledger-true) — CONFIRMED (code).** `getInvoiceStats` groups
  every invoice row with **no `parent_invoice_id IS NULL` filter**, so counts and
  `totalValue` include summary masters *and* payable children (double count).
  `outstandingValue` sums full `i.total` by status, not `GREATEST(total-amount_paid,0)`.
  The Paid card uses `SUM(total)` where `status='Paid'` — invoice status treated
  as proof of collection, partial cash omitted. Period is `created_at`, not
  payment date. `collectionRate` = paid *count* / collectible *count*, not cash.
  (One partial correction: the overdue sub-metric alone uses
  `SUM(total-amount_paid)` and `COALESCE(grace_due_date,due_date)`.)
- **F03 (Paid without payment) — CURRENT CODE RISK, CONFIRMED (code).**
  `updateStatus()` assigns `invoice.status = status` with no payment
  reconciliation. `update()` does `Object.assign(invoice, dto)`, so if
  `UpdateInvoiceDto` exposes `status` the generic PUT is a second unreconciled
  path (DTO check pending). `recalculatePaymentStatus()` would fix it but is not
  invoked by these routes. INV-2026-0062 repair withheld per brief.
- **F04 (Sent ≠ delivered) — CURRENT CODE RISK, CONFIRMED (code).**
  `updateStatus('Sent')` persists status **before** `generateAndSendInvoice()`,
  which is wrapped in a try/catch that only logs on failure — no revert, no
  re-throw. A missing `client_email` skips the email entirely and the invoice
  stays `Sent`. No authoritative delivery/attempt record distinguishes issued /
  PDF-generated / email-attempted / delivered.
- **F07 (duplicate master invoices) — CURRENT CODE RISK, CONFIRMED (code).**
  `create()` accepts `quote_id` and never checks for an existing master invoice
  on that quote (its advisory lock guards only a second *Accepted quote per
  deal*, a different invariant). `convertFromQuote()` checks for an existing
  invoice **only inside `if (quote.status === 'Accepted')`** — a Draft/Sent quote
  converts with no such check. Both paths can mint a second master for one quote.
  DB uniqueness on master `quote_id`: none seen on the entity (migration check
  pending). The five historical duplicate groups are DB-pending.
- **F08 (deleted numbers reused) — CURRENT CODE RISK, CONFIRMED (code).**
  `generateInvoiceNumber()` takes `MAX(substring…)::int + 1` over **currently
  existing** rows only; deleted numbers are not reserved, so the next number
  reuses the lowest gap above the current max. `remove()` hard-deletes and runs
  `documentItem.delete → invoice.remove → logDelete` **with no enclosing
  transaction**, so a mid-sequence failure can orphan items or lose the audit
  row. Cascade specifics (payments, SET NULL on children) are entity/migration-
  pending.
- **F09 (discount semantics) — CURRENT CODE RISK, CONFIRMED (server half).**
  `calculateItemTotals()` computes `total = subtotal − discount + tax`, i.e.
  discount is a **fixed amount**. If the client sends a percentage in the same
  field, server and client disagree. All staging items currently have zero
  discount (DB-pending), so this is latent, not an existing mispricing. Client
  formula confirmation pending.
- **F10 (edits break dependents) — CURRENT CODE RISK, CONFIRMED (code).**
  `addItem/updateItem/removeItem` call only `recalculateInvoiceTotals()` (header
  only); they do not rebuild applied terms, installments, summary children,
  payment status, or block Paid/Cancelled/Sent/summary/payment-plan invoices.
  `update()` re-writes `deal.value = invoice.total`; changing `payment_term_id`
  does not rebuild a schedule; changing `due_date` does not touch
  `grace_due_date` (only `create()` sets grace = due). Invoice create/convert
  overwrite `deal.value` with the invoice total.
- **F13 (divergent consumers) — PARTIAL (code).** Confirmed the invoice-page
  divergence: `findAll` default excludes children (`parent_invoice_id IS NULL`)
  while `getInvoiceStats` includes them. Reports/dashboard/schools/collections/
  pipeline consumers not yet read this pass.

### Code-truth dispositions — pass 2 (payments, DTOs, reporting consumers)

- **F03 second path — CONFIRMED (code).** `UpdateInvoiceDto = PartialType(OmitType(
  CreateInvoiceDto, ['items']))` — `OmitType` drops only `items`, so `status`
  survives. The generic `PUT /invoices/:id` → `update()` `Object.assign(invoice,
  dto)` can therefore set `status='Paid'` with no payment reconciliation, a
  second backdoor beside `updateStatus()`.
- **F05 (installment/allocation contradiction) — CURRENT CODE RISK + HISTORICAL
  (code half).** `PaymentsService.create()` calls `allocatePaymentFIFO` **inside
  a try/catch that only logs on failure** (best-effort). So a payment can commit
  with **no allocation rows** if allocation throws — reproducible in current
  code, matching the observed 0 allocation rows. `allocated_amount` /
  `unallocated_amount` are tracking columns on `payments` written by the
  allocator, so when allocation is skipped they diverge from reality. The 28/29
  mismatch counts and the historical-vs-reproducible split are DB-pending
  (needs `payment_allocations` row counts).
- **F11 (validation) — CONFIRMED (code).** `CreateInvoiceDto.items` is
  `@IsArray()@ValidateNested()` with **no `@ArrayMinSize(1)`** → empty item list
  passes. `discount`/`tax_rate` have `@Min(0)` and **no `@Max`/no subtotal
  ceiling**. `CreatePaymentDto.amount` is `@Min(0.01)` positive-only with **no
  outstanding-balance ceiling**, and `PaymentsService.create()` adds none →
  over-payment is possible via direct API. No entity-level CHECK constraints on
  totals/paid/status. (`CreatePaymentDto` also carries both `method` and an
  unused `payment_method` — minor.)
- **F06 (overdue predicates) — CONFIRMED (code); ≥3 incompatible definitions:**
  (a) invoice stats + invoice list use `COALESCE(grace_due_date, due_date) <
  NOW()` (grace-aware); (b) `dashboard.service` executive `overdueQuery` uses
  `inv.due_date < :now` (ignores grace) **and** restricts to statuses
  `Sent/Partially-Paid/Overdue` (omits past-due Draft); (c) `reports-read`
  aging + `report-export` age by `due_date` off installment
  `amount − paid_amount`. No writer ever sets invoice/installment status
  `Overdue`, so status-based overdue is always empty.
- **F13 (divergent consumers) — CONFIRMED (code).** `reports-read` "cash
  collected" = `SUM(invoice.amount_paid)` where `paid_date ∈ window` — and since
  `recalculatePaymentStatus` sets `paid_date = null` for Partially-Paid, **all
  partial cash is excluded**, not just misattributed. Its "outstanding" sums
  `total − amount_paid` across non-cancelled with no summary/child exclusion
  (double-count risk). `dashboard` scopes by **deal.assigned_to**, so
  manager-created invoices with a null `deal_id` or owner≠assignee drop out of
  role-filtered widgets. `schools.service` outstanding filters status
  `Sent/Overdue/Partially-Paid`. `report-export` collections hard-code `$` in
  headers. Net: invoice value, cash, outstanding, overdue and currency each have
  multiple non-agreeing definitions across list/stats/reports/dashboard/schools/
  export.

### Investigation-3 disposition (payment approval, actor, atomicity) — CONFIRMED (code)

- **No payment-approval data model or workflow exists.** `PaymentsService.create()`
  saves the Payment and posts immediately — no pending/request stage, no queue
  entry, no reviewer. The `payments` entity has **no** `recorded_by_id` /
  `entered_by_id` / `requested_by_id` / `approved_by_id`; the acting `userId` is
  used only for the after-the-fact ActivityLog, never stored on the Payment. So
  the required "sales-rep submits → manager approves → then post" contract is
  entirely unbuilt; a sales-rep payment (if the controller admits the role) posts
  live.
- **Not atomic (F11/Q9 = YES).** `create()` runs `save payment → recalc invoice
  → recalc parent → allocateFIFO(try/catch) → logCreate` as **separate,
  non-transactional** operations. A payment is recorded successfully even when
  allocation fails. `update()`/`remove()` (reverse-allocations → save/remove →
  recalc) are likewise non-atomic, and Payment FK is `onDelete: CASCADE`
  (hard delete erases the row; admin/sales_manager may update/delete). The
  redundant client second-allocation call is controller/client-pending.
- **Partially-Paid as a free label** is the invoice-side F03 path (generic
  status endpoint sets it with no Payment) — already confirmed above.

Together these confirm Investigation-3's core: `Partially-Paid`/`Paid` are
manually editable labels that can contradict the payment ledger, actor
attribution on the Payment is absent, and no approval persistence exists. The
Herentials/Wanezi **row reconciliation** (stale installment projection, the
INV-2026-0062 Paid-without-payment record, duplicate Wanezi school masters,
INV-2026-0075 draft) is DB-pending — the *display chain* that produces the
wrong pipeline number (`reports-read#getAgingReport` → `view-deal-details`
summing installment balances) is code-confirmed.

### Code-truth dispositions — pass 3 (PDF, client, allocation, tests)

- **F01 PDF — CONFIRMED, with correction.** Codex framed the PDF generator as
  formatting with the global setting. More precisely: `document-generator` **is
  currency-aware** — it has `formatCurrency(amount, currency)` and the **quote**
  PDF prints `Currency: {quote.currency}` and passes `quote.currency` into the
  items table. The **invoice** PDF prints no currency line and has no per-invoice
  currency to pass, so it falls back. So the defect is narrower and cheaper to
  fix than "the generator ignores currency": the generator already supports it;
  **invoices simply have no currency field to give it** (mirror the quote work).
- **F09 client — CONFIRMED.** `document-items.tsx`: `discount = (subtotal *
  discRate) / 100`, header `Disc %`. Server treats the same field as a fixed
  amount (pass 1). The PDF prints the stored value via `formatCurrency` (as
  money) while the client form shows it as a percent — same stored number, two
  meanings. Latent (all staging items currently zero-discount, DB-pending).
- **Redundant FIFO — CONFIRMED (path exists).** Client `useAllocatePayment()`
  posts `POST /payment-terms/allocate/:paymentId`; the server already
  auto-allocates inside `PaymentsService.create()`. The endpoint + hook are a
  second, role-dependent allocation path; whether `AddPaymentModal` fires it
  after create is the exact trigger (client-flow-pending, but the redundant
  path is present).
- **F14 tests — CONFIRMED.** Repository test inventory under invoice/payment/
  installment/allocation: only `payments.service.spec.ts` and
  `installment-calculation.service.spec.ts`. **No `invoices.service.spec.ts`** —
  no behavioral coverage for invoice create/item calc, %-discount, currency,
  quote conversion / duplicate prevention, status↔payment invariants, split
  summary/child stats, deletion/number permanence, or consumer agreement.

### Source-of-truth matrix (from code; "raw" = currency-blind)

| Consumer | Rows counted | Balance formula | Overdue predicate | Currency |
|---|---|---|---|---|
| Invoice list (`findAll`) | masters only (children hidden unless `include_children`) | `total − amount_paid` (client) | `COALESCE(grace,due) < NOW()` | global/USD fallback |
| Invoice **stats** (`getInvoiceStats`) | **all rows** (masters+children) | outstanding = full `SUM(total)` by status; overdue sub-metric = `SUM(total−amount_paid)` | `COALESCE(grace,due)` (overdue metric only) | none |
| Dashboard exec/collections | invoices via **deal.assigned_to** join | `SUM(total − amount_paid)` | **`due_date < NOW()`** (no grace), status∈{Sent,Partial,Overdue} | none |
| Reports (`reports-read`) | non-cancelled, no summary/child filter | outstanding `SUM(total−amount_paid)`; cash = `amount_paid` where `paid_date∈window` (**excludes partials**) | installment `due_date` | none |
| Collections export | Unpaid/Partial, includes summaries+children, no Cancelled exclusion | `total − amount_paid` | `due_date` | hard-coded `$` |
| Schools | status∈{Sent,Overdue,Partially-Paid} | (full total; summary+child eligible — DB/line-pending) | none explicit | none |
| Pipeline | invoices with `deal_id`, excl. summaries | `total − amount_paid`, status∈{Sent,Partial,Overdue} | n/a (sales SLA is separate) | deal currency exists but display mixes |

No two rows agree on all four columns — the structural basis of F02/F06/F13.

### Answers to the 14 questions (code basis; data noted where required)

1. **Trust today's staging invoice PDF?** *Amount* — yes for a single-currency
   invoice with zero line discount (header=Σitems verified by code); **no** the
   moment a percentage discount is entered (server stores it as a fixed amount,
   F09). *Currency* — **no**: no invoice currency; PDF uses global/USD fallback (F01).
2. **Authoritative cash received:** the `payments` table (`SUM(amount)`), not
   `invoice.amount_paid`/status. Reports' `paid_date`-window method omits partial cash.
3. **Authoritative outstanding:** `GREATEST(invoice.total − amount_paid, 0)` on
   **non-summary** rows. Installment `balance` is stale (F05) and must not be trusted.
4. **Invoice status:** a **manually editable label** (F03 via both `updateStatus`
   and `PUT`), not derived evidence; `payment_status`/`amount_paid` are the derived truth.
5. **"Total Invoices" counts:** every invoice **row** incl. summaries+children
   (F02) — neither visible masters (36) nor payable documents (54).
6. **"Collection Rate":** paid invoice **count** ÷ collectible **count** — not a
   cash ratio.
7. **Two masters for one quote — still possible?** Yes. Paths: (a) manual
   `create()` with `quote_id` (no existing-invoice check); (b) `convertFromQuote()`
   on a **Draft/Sent** quote (existing-invoice check only under `Accepted`). No DB
   uniqueness on master `quote_id` (entity; migration-pending).
8. **Next number reuses a deleted one?** Yes — `MAX+1` over existing rows only;
   deleted numbers unreserved (F08). Exact next value is DB-pending.
9. **Payment recorded while allocation fails?** Yes — allocation is best-effort
   try/catch after a non-transactional save (F05/F11).
10. **Report debt ≠ invoice-list debt for same rows?** Yes — different row sets,
    balance formulas, and overdue predicates (matrix above).
11. **Historical vs reproducible:** *reproducible in current code* — F01, F03,
    F04, F06, F07, F08, F09, F10, F11, missing payment approval/actor, non-atomic
    money path, allocation-skip. *Historical-only pending DB confirmation* —
    existing 0 allocation rows, the 5 duplicate-master groups, INV-2026-0062
    Paid-without-payment, stale Herentials installments.
12. **Safest repair order:** (a) add immutable invoice `currency` (backfill from
    linked quote/deal; leave unknown NULL — never infer); (b) make status
    payment-derived + close the PUT/PATCH backdoors; (c) rebuild allocations from
    existing payments (no new payments) under backup; (d) unify one balance +
    effective-due-date policy across consumers; (e) reserve invoice numbers;
    (f) add the payment-approval model. Each behind tests, staging-first.
13. **Herentials/Wanezi cards should show:** Total, Verified Payments (from
    `payments`), Outstanding = `max(total−verified, 0)`, payment-state derived,
    document-state (non-financial), overdue only when outstanding>0 on the agreed
    due date — Herentials ZAR 39,000 / 13,000 / 26,000 with installment 1 paid &
    not overdue; Wanezi two deal-invoices ZAR 23,400 / 7,800 / 15,600, INV-0062
    never "Paid" without evidence, INV-0075 shown as a separate unresolved Draft.
    Row repair is DB-pending and needs human evidence.
14. **Where to implement rep-payment approval:** a new `payment_entry_request`
    entity (invoice id, monetary/date fields, owner+outstanding+currency
    snapshot, `requested_by_id`, timestamps, status, reviewer id/time/note,
    resulting `payment_id`) **plus** `recorded_by_id`/`recorded_at` on `payments`;
    approval executes payment creation+allocation+recalc+request-close in **one
    transaction** that re-locks and re-checks the balance.

### Remediation, human-evidence, and test gaps

- **Needs human evidence before any correction:** the 5 duplicate-master quote
  groups (payments exist), INV-2026-0062 (no payment row — manager decision),
  the Wanezi duplicate school masters + INV-2026-0075 draft, and every
  installment-allocation reconstruction (must derive from existing payments, never
  a new payment). All DB-side; none touched.
- **Minimum regression matrix (F14):** invoice create/item calc; %-vs-fixed
  discount; currency preservation on issue/convert/PDF; quote→invoice duplicate
  prevention (both paths); status↔payment invariants incl. the PUT backdoor;
  summary/child stat exclusion; number permanence after delete; payment
  create/allocate/recalc atomicity + failure rollback; the 12 acceptance
  scenarios; consumer-agreement (list=stats=dashboard=reports=schools=export).

### Data reconciliation — staging, read-only (2026-08-14)

Observed in a `READ ONLY` transaction on `digilearn_crm_staging`
(`transaction_read_only = on`), rolled back, output limited to
counts/aggregates/invoice numbers. Staging drifted **+1 invoice / +1 payment**
since Codex's same-day audit (one new USD standalone master +3,900, one new
payment +2,000); no structural change. Every data-dependent finding reproduced.

Exact counts: 68 invoice rows = 37 masters (13 summary + 24 standalone) + 31
children; 55 payable non-summary. Raw sums: all-rows 820,258.50; payable
521,229.25; masters 521,229.25; summary 299,029.25; payments 30 / 179,200.00.
Integrity: header = Σitems (0 mismatches); non-summary `amount_paid` = Σpayments
(0 mismatches).

- **F01 — CONFIRMED (data).** Master invoices by linked-quote currency: **ZAR 20**
  (287,965), USD 10 (124,400), null/unresolved 7 (108,864.25). Twenty ZAR-context
  invoices carry no invoice currency and render with the USD/global fallback.
- **F02 — CONFIRMED (data).** `masters_total == payable_total` (521,229.25); the
  all-rows total (820,258.50) = payable + the full summary block (299,029.25) —
  so `getInvoiceStats` (which filters neither) double-counts by the summary total.
- **F05 — CONFIRMED (data); still reproducing, not merely historical.** 30
  payments, `payments.allocated_amount` column sums **175,100** yet
  `payment_allocations` has **0 rows (0.00)** — the tracking columns are fiction.
  The newest payment (2,000) is stored fully **unallocated**, so the
  allocation-skip is happening on current writes, not just legacy rows.
- **F06 — CONFIRMED (data).** The same "overdue" question returns **30**
  (grace-aware, all rows) / **12** (dashboard: `due_date`+status set) / **0**
  (status column) — three incompatible answers.
- **F07 — CONFIRMED (data).** Exactly **5 quotes with 2 master invoices each**
  (0004/0030, 0009/0028, 0010/0021, 0063/0064, 0067/0068).
- **F08 — CONFIRMED (data); reuse has already occurred.** Max is now
  `INV-2026-0078` with **10 numbers missing below it**; `0078` appears in Codex's
  deletion log, so a previously-deleted number is live again.
- **F03 — CONFIRMED (data).** `INV-2026-0062`: status **Paid**, payment_status
  **Unpaid**, amount_paid **0**, **0** payment rows.
- **Investigation 3 — Herentials — CONFIRMED (data).** Summary INV-0058
  39,000 / paid 13,000 (rolled from INV-0059's two payments) → ledger outstanding
  **26,000**. But all three installments — including fully-paid **INV-0059** — are
  `pending`, balance 13,000, so the schedule projects **39,000** outstanding and a
  false overdue on the paid installment (due 2026-06-16). Ledger-true = 39,000 /
  13,000 / 26,000.
- **Investigation 3 — Wanezi — CONFIRMED (data).** Deal-linked INV-0062
  (Paid-label, 0 payments) + INV-0076 (Partial, 7,800 / 1 payment): total 23,400,
  verified paid 7,800, outstanding **15,600**. INV-0075 is a separate **dealless
  Draft** 15,600 (unresolved, human-evidence needed) — not confirmed collectible.

No Codex claim was disproved; the only adjustments are the +1/+1 drift and the
narrower F01-PDF framing (the generator is currency-aware; invoices simply lack
the field). Production was never accessed; the query ran read-only on staging and
rolled back.

### Approval needed before implementation

1. Confirm the terminal-safe read-only staging channel so the DATA half
   (`BLOCKED`) can be reconciled and this report reach `DONE`.
2. Product decisions the code cannot settle: whether `manager` and
   `admin_support` get direct-payment/approval authority (currently
   `admin_support` aliases to `admin`); whether a sales manager may approve their
   own request; whether note/reference are mandatory; how payment corrections are
   reversed without erasing audit; and the single agreed effective-due-date &
   balance policy every consumer must adopt.
3. Nothing here is authorization to implement — this is investigation only.

STATUS (final): `DONE` — the full investigation (F01–F14 + Investigation 3) is
complete: code-truth verified against committed `HEAD` (deployed client bundle
matched) and every data-dependent finding independently reproduced read-only on
`digilearn_crm_staging` (transaction_read_only=on, rolled back). No Codex claim
was disproved; adjustments limited to the +1/+1 staging drift and the narrower
F01-PDF framing. Production was not accessed. No code, Git, deployment, schema, or
data change was made. Only this report section of `INVOICES.md` was edited.
