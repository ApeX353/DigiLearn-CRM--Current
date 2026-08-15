# DigiLearn CRM — full test findings

**Date:** 15 Aug 2026 · **Tester:** Claude (Prince Banda's staging session)
**Environment:** staging.digilearncrm.work · api-staging.digilearncrm.work/api/v2
**Repo:** branch `port-dube-github`, working tree dirty (40+ modified files, uncommitted)

This is the single consolidated record of three test passes run on 15 Aug 2026:

1. **System sweep** — syntax, runtime, logic, performance, resource
2. **Role journeys** — the system worked as a sales rep, a sales manager, and the product owner
   (every Settings control traced end to end)
3. **End to end** — the money chain from quote to cash, the outbound delivery paths, and auth

Findings are marked **[LIVE]** where reproduced against staging with real numbers, and **[CODE]**
where found by reading source but not exercised against the running system.

Everything was read-only. The only non-`GET` issued in the entire exercise was one
`PATCH /leads/<nonexistent-uuid>/assign` against a deliberately fake id, to prove it answers 404
rather than 500. Nothing was created, changed or deleted.

> ### Where this stands (breakpoint, 15 Aug 2026)
>
> This document is complete and usable as it stands.
>
> A verification workflow (`wf_3271c9ce-78a`) was run against it and **stopped early at 24 agents**.
> Its 17 returned results are reconciled into **§0** — six new criticals and fourteen corrections to
> this document — and the three "verified clean" claims it disproved are now annotated in place.
> The full raw salvage, including ~50 further medium/low findings not yet merged, is in
> **`WORKFLOW-SALVAGE-2026-08-15.md`**.
>
> **Still to do:** merge the remaining medium/low findings from that salvage file, and confirm the
> four items marked **[UNVERIFIED]** in §0 — their verifier was killed before reporting. Start with
> **C6** (the Settings envelope bug): it is cheap to check and, if true, changes how the whole of §6
> reads.
>
> **Nothing here has been committed.** This file is untracked and the working tree was already dirty
> before testing began.

---

## How this was tested, and the one gap

I was signed in as **Prince Banda**, whose account holds **two** roles — `admin_support` **and**
`sales_manager`. I could not sign in as a plain sales rep or a plain manager: no CRM user passwords
exist in `CREDENTIALS.local.md` (it holds infrastructure secrets only), and entering a password into
a login form is something I don't do. So role journeys were traced through the **code** — client
component → API call → DTO → service → DB write → response → what renders — and the browser was
used for every screen that account can reach.

For this class of bug the code route is the more thorough one anyway: most of what follows is
invisible from the UI (a switch that saves but is never read, a guard that never fires, a payment
that never reaches the ledger). **If you want live per-role confirmation**, sign one rep and one
manager in and I'll re-run the journeys against those sessions.

Two screens I deliberately did **not** exercise: PDF generation (§7.1 — it may crash the API
container) and the Duplicates "Scan"/"Rebuild" buttons (§6.5, §11.8 — they mutate data).

---

# PART I — THE SHORT VERSION

## Ship-blockers, in order

1. **§2.1 Manual lead assignment will 500 on every call once this branch deploys.** One undeclared
   variable. Committed at HEAD, not yet live.
2. **§3.1 $90,400 of received cash is invisible to Collections and aging** — payments never credit
   the instalment rows. Live, now, on real data.
3. **§2.2 A sales rep can approve their own disqualification, reassignment and reopen requests** —
   the approval workflow is UI-only enforcement.
4. **§2.3 Approving a "reopen/undo status" request hard-deletes the lead's invoices and
   cascade-deletes its payments.** There is a live pending request of this kind on staging.
5. **§7.1 Invoice and quote PDFs are generated with no line items and no totals**, and the failure
   mode risks terminating the API process.

## The five-minute picture

**What's healthy.** Both TypeScript builds pass clean — no syntax or type errors anywhere. Invoice
arithmetic reconciles exactly across all 38 invoices. Instalment splitting is exact, including the
awkward remainders. Cash Collected reconciles to the cent. Password reset is genuinely well built.
Session revocation is immediate. The socket gateway is properly authenticated.

**What's broken.** The damage clusters in three places: **allocation and lifecycle** (payments not
reaching instalments; delete/cancel destroying or resurrecting records), **cross-screen definition
drift** (five different answers to "how much are we owed", four to "how many leads", two to
"how many SLA breaches"), and **enforcement that only exists in the browser** (approvals, policy
switches, the forced password change).

**The recurring root cause** is a success signal that doesn't mean success: `sendEmail` returns
`{success:false}` instead of throwing, `catch {}` swallows guards, `finally` marks failures as done,
and toasts report "saved" for writes the server discarded.

---

# PART II — FINDINGS

## 0. Verification round — new criticals and corrections to this report

A whole-system verification workflow (run `wf_3271c9ce-78a`) ran 10 independent dimension audits,
each told to read this report first and find only what it **missed** or got **wrong**, then put every
finding through an adversarial verifier. It was stopped early at 24 agents; **17 returned results —
65 findings, 46 verified (44 CONFIRMED, 2 PLAUSIBLE, 0 refuted), 14 of them challenging this
document.** Full salvage in `WORKFLOW-SALVAGE-2026-08-15.md`.

Findings marked **[UNVERIFIED]** below were raised but their verifier was killed before reporting —
treat the mechanism as sound but the reachability as unconfirmed.

### 0.1 Six new criticals

**C1. `PATCH /leads/:id/status` bypasses the entire governance workflow, and takes an unvalidated raw
string.** `leads.controller.ts:533-561` is `@Roles('admin','sales_manager','sales_rep')` with
`@Body('status') status: string` — a primitive body key, so the global ValidationPipe has **no DTO to
validate against and no enum check runs**. The only content guard in `updateStatus`
(`leads.service.ts:2119`) is `if (status === 'Disqualified') throw` at `:2125`. A sales_rep who owns a
Converted lead can `PATCH {"status":"Qualified"}` → 200: the lead leaves Converted with no reversal
request, no manager approval and no audit, and `converted_at` is left set (only ever written at
`:2197`, never cleared). This defeats §2.2 and §2.4 from a different direction — and unlike those, it
needs no CASL trick at all. **CONFIRMED.**

**C2. A `status_reversal` request targeting `Disqualified` deletes the lead's whole commercial
history and then throws, leaving the request pending forever.** `createReversalRequest` validates by
rejecting only `dto.status === 'Converted'` (`leads.service.ts:1399-1403`), but `Disqualified` is a
valid `LEAD_STATUSES` member, so the request is stored. On approval, `removeLeadDealsAndDependents()`
runs first and hard-deletes deals, quotes, invoices and (by CASCADE) payments — then `updateStatus`
throws 400 *"status-only updates cannot disqualify a lead"*. The deletes have committed; the request
stays `pending`; the manager clicks Approve again. **This sharpens §2.3**, which treated the ordering
as hypothetical ("If `updateStatus` throws afterwards") and never identified that there is a
DTO-valid, reachable input that makes it throw on **every** approval. **CONFIRMED.**

**C3. `PATCH /deals/:id/close` marks a deal Won with zero evidence and never moves it out of its open
stage.** `closeDeal` (`deals.service.ts:856-899`) validates exactly two things: that the deal is
ONGOING (`:867`) and that a `lost_reason` accompanies a `lost` close (`:873`). It never calls
`assertStageGateEvidence`, so the WON evidence gate at `:1965-1975` (accepted quotation or PO) is
skipped entirely. A deal in stage "Needs Assessment" with no quote, no PO and no invoice closes as won
with `current_status` unchanged and **no `deal_stage_history` row**. `GET /deals/summary` then counts
it in `won_deals` while the pipeline board still shows it mid-funnel. **CONFIRMED.**

**C4. `POST /activities` with `status:"completed"` bypasses both completion gates.** `create()`
(`activities.service.ts:465-542`) runs one guard, `assertOpenActivityHasDate` at `:470`, which returns
immediately for `status === COMPLETED` (`:370-375`). `assertNextStepCompliance` is never invoked from
`create()` — its only call site in the whole server is `updateStatus` at `:1412` — and the outcome is
equally unguarded (`:517-522` writes `completion_outcome ?? null`). So the rep's single most common
action, logging a call from the Create Activity modal, closes with no outcome and no next step, while
the identical completion routed through `PATCH /activities/:id/status` is rejected 400. This is the
hole underneath §6.2 and §4.13. **[UNVERIFIED]**

**C5. Applying a multi-invoice payment term to an invoice that already has payments zeroes
`amount_paid` and strands the cash.** `applyPaymentTermToDocument` writes
`amount_paid: strategy === 'multiple_invoices' ? 0 : invoice.amount_paid` plus
`payment_status:'Unpaid'`, `is_summary_invoice:true` (`payment-terms.service.ts:340-352`) — while the
`payments` rows are untouched and still point at the now-summary invoice. A $10,000 invoice with
$4,000 already received becomes a summary with `amount_paid 0`, three unpaid Draft children, and a
$4,000 payment attached to a parent that no longer accounts for it. **This is a concrete, confirmed
mechanism for the $90,400 gap in §3.1 and the stranded $2,100 in §3.2.** **CONFIRMED.**

**C6. Every admin Settings tab reads the API envelope instead of the settings map, so all 31 controls
render code defaults and each Save silently reverts stored values.** `GET /settings` returns
`{success, data:{key:value}}` (`settings.controller.ts:44-48`); the client does
`.then(res => res.data)` (`use-settings.ts:35-36`), which **is** the envelope, and there is no
unwrapping interceptor (`axios.ts:81-82`). So every lookup like
`settings["compliance.thresholds.stale_lead_days"]` is `undefined` and the form falls back to its
hardcoded default. An admin who sets the stale-lead threshold to 3, returns the next day, sees 14,
changes one unrelated field and saves — **writes 14 back over the 3**. If confirmed this reframes
much of §6: those controls may be wired server-side but unusable from the UI. **[UNVERIFIED — verify
this one first; it is cheap to check and changes the reading of the whole Settings section.]**

### 0.2 Corrections to this report

| § | What this report says | Correction |
|---|---|---|
| §4.12 | `sla_breached` is cleared "only by `transitionStatus`" | Wrong. It is also cleared at `lead-auto-router.service.ts:406, :546, :630, :880`, and for deals at `deals.service.ts:2248` and `sla-scheduler.service.ts:641`. §4.12 also contradicts §5.13 of this same report. |
| §12.5 | 6 Converted / 24 Disqualified leads carry stale `sla_breached` — cause given vaguely as "stale flags" | The mechanism for the Disqualified half is named: `mergeLeads` retires the loser with a **raw repository save** (`leads.service.ts:2725`), bypassing `transitionStatus`, so the retired lead keeps `sla_breached=true` and its SLA due date. |
| §5.6 | The rollback **review** route is gated by the same helper that 404s a manager on another rep's deal | Wrong, and worse than reported. `deal-rollback-requests.controller.ts:42-55` calls `reviewRollbackRequest` with **no ability, no `scopeUserId`, no `assertDealAccess`** — a sales_manager can approve a rollback on a deal the API refuses to let them read. |
| §5.4 | The R1 orphan-row pattern affects `DuplicateSuspicion` | It is the **third** instance: `LeadReversalRequest` — the governance queue itself — has the identical hole at `leads.service.ts:1319`. |
| §4.3 | The disqualify branch is unreachable because `note` is reset to `""` at `:311` | Misread. `:311` is `setNote(recordedCallSummary)`; the reset to `""` is at `:362`, and the effect at `:300-339` has no `alreadyCompleted` guard. So for any call with a recorded summary the ≥10-char test **passes** — and the call summary is submitted as the disqualification evidence **without the rep ever seeing it**. That is a worse defect than the one reported. **[UNVERIFIED]** |
| §3.10 | The nameless Collections rows come from invoices deleted per §3.7 | Wrong. `reports-read.service.ts:287` filters `invoice.id IS NOT NULL`, so instalments whose invoice is gone are excluded entirely. The real cause is the `?? ''` / `?? '—'` fallback at `:395-397`, which keys the customer summary on an **empty string**, merging unrelated debtors into one row. |
| §13 | "the socket gateway is properly authenticated" / "session revocation is immediate" | True only of the HTTP path. `notifications.gateway.ts:66` never re-validates the connection against session revocation or `is_active`, so a logged-out or disabled user keeps receiving realtime notifications on an open socket. |
| §9.10 | `resetPassword()` omissions are LOW | It also **fails to clear the lockout state**, so "forgot password" cannot recover a locked-out account — the exact user most likely to need it. |
| §12.1 | The pipeline `undefined`/`$NaN` is "skew, not a repo defect" | It is independently a client defect too: `pipeline-stages-page.tsx:156` uses `summary?.data \|\| {defaults}`, an all-or-nothing fallback that any non-null **partial** payload bypasses, feeding missing keys straight into `String()` and `formatCurrency()`. |
| §4.14 | PersonPicker auto-commit at `person-picker.tsx:125-136` | Those lines no longer contain the effect in the dirty tree. The merge now sits at `:90-118` and the auto-commit moved to a new effect guarded only by `!singleValue` — so it also fires permanently on every genuinely single-person record, not just during the load race. **[PLAUSIBLE]** |
| §13 | "`ComplianceSettingsService` caching is bounded and correct" | Bounded, yes; correct, no. `invalidateCache()` (`:307-309`) is documented as being called by the settings controller after a write, and **that call site does not exist** — `SettingsController` never injects the service. **[UNVERIFIED]** |
| §10.2 | The auth tax is "the flat tax behind the 7.1 s `/auth/refresh` and 6.5 s `/settings/public`" | Misattributed. Both routes are `@Public()` (`auth.controller.ts:188`, `settings.controller.ts:67`) and `jwt-auth.guard.ts:17-24` returns before `super.canActivate()`, so neither runs the per-request auth queries. The §10.2 mechanism is real for authenticated routes; the two timings need another explanation. **[UNVERIFIED]** |
| §11.2 | The proposals query is correct-but-unpaginated | Pagination claim confirmed, but the R1 soft-delete guard those lines advertise is **dead code** — `.where()` at `:298` discards the `.andWhere()` at `:294`, so it never reaches the SQL. |

---

## 1. Syntax and build — clean

| Check | Result |
|---|---|
| `crm-v2-server` — `tsc --noEmit` | **PASS** (exit 0) |
| `crm-v2-client` — `tsc --noEmit -p tsconfig.app.json` | **PASS** (exit 0) |
| `crm-v2-client` — `npm run build` | **PASS**, 4,069 modules |

No syntax or type errors in either project. The ESLint debt recorded in `CODEBASE-SKELETON.md`
§16.4 is unchanged and not repeated here.

---

## 2. Ship-blockers

### 2.1 [CODE] `PATCH /leads/:id/assign` will 500 on every call once this branch deploys
`crm-v2-server/src/leads/leads.controller.ts:577`, inside `assignLead()`:

```ts
if (status === 'Disqualified') {
```

`status` is not a parameter, local or import of that method — a copy-paste of the guard that belongs
in `bulkUpdate` (where `status` *is* destructured, `:606`). It compiles only because `tsconfig` sets
`target: ES2023` with no `lib`, so TypeScript picks up the DOM's `declare var status: string`. Under
Node there is no such global:

```
$ node -e "if (status === 'x') {}"
ReferenceError: status is not defined
```

**Important correction.** I tested this live and it does **not** currently fail:
`PATCH /leads/<nonexistent-uuid>/assign` returns a clean **404**. Three separate audits called it
"broken on every call"; the live system says otherwise. The reason is deployment skew — the line
landed **12 Aug 2026** in commit `5df724b` (LEAD-GOV1), and the deployed staging API is older than
that (§12.1). It is a **latent** blocker: committed at HEAD, not yet live, and it breaks manual lead
assignment the moment staging is redeployed.

Impact when it lands: the Assign dialog is the **only** assignment path in the client
(`assign-leads-dialog.tsx`, mounted at `leads-management-page.tsx:864` and `view-lead-page.tsx:838`).
A manager could not hand-assign or reassign a single lead. `Promise.allSettled` means a 20-lead
assignment fails 20 times under one generic toast.

One residual unknown: the container runs **Bun** (`CMD ["bun", "dist/main"]`), not Node, and Bun
isn't installed here so I could not execute it under the real runtime. Bun does not define a global
`status` either (that is a browser `window` property), so the expectation is the same — confirm with
one call after the next deploy.

*Same dialog:* the `sales_rep` filter on the assignee dropdown is commented out
(`assign-leads-dialog.tsx:59-67`), so it offers finance, admin_support and admin accounts as lead
owners, and `limit: 100` silently caps the staff list.

### 2.2 [CODE] A sales rep can approve their own disqualification, reassignment and reopen requests
This defeats the entire manager approval workflow, including the LEAD-GOV1 control.

`RolesGuard.canActivate` short-circuits: when a handler carries `@CheckPermission`, the CASL branch
runs and **returns at `auth/guards/roles.guard.ts:116` before the `@Roles` block at line 120 is ever
read**.

- `leads/lead-reversal-requests.controller.ts:66-67` carries **both** `@Roles('admin','sales_manager')`
  **and** `@CheckPermission('update','Lead')` — so the `@Roles` line is dead metadata.
- `sales_rep` is seeded `update:Lead` with conditions (`database/seeds/seed-roles-permissions.ts:147`).
  `ability.can('update','Lead')` against a bare subject *type* ignores conditions and returns true,
  and the fallback `hasAnyAllowRule` (`roles.guard.ts:102-108`) deliberately returns true when the
  only matching rule is conditional.
- `LeadsService.reviewReversalRequest` (`leads.service.ts:1690-1812`) then performs **no** role check
  and **no** self-approval check — only `status !== 'pending'`.

**Repro:** as `sales_rep`, raise a disqualification request on your own lead, read its id from
`GET /lead-reversal-requests/mine`, then `POST /lead-reversal-requests/{id}/approve
{"decision":"approved"}` → **200**. The lead is disqualified and leaves the manager's queue marked
approved by the rep. The controller's `findOne(request.lead_id, ability)` passes because the rep owns
the lead.

**The identical defect exists on deal rollback review** — `deals/deal-rollback-requests.controller.ts:43-44`
+ `deals.service.ts:1078-1190` (which checks only `status !== 'pending'`, not even ownership).

Both close with the same two-line change: evaluate `@Roles` **and** the permission, rather than
returning early at `roles.guard.ts:116`.

### 2.3 [CODE] Approving a "reopen/undo status" request hard-deletes invoices and cascade-deletes payments
`leads.service.ts:1752-1763` — on `status_reversal` approval, `removeLeadDealsAndDependents()` runs
**before** the request row is saved and **outside any shared transaction**. That method
(`:1814-1875`) issues hard `DELETE`s against `document_items`, `applied_payment_terms`, `invoices`,
`quotes` and `deals`. The Payment→Invoice FK is `ON DELETE CASCADE`
(`payments/entities/payment.entity.ts:64`), so **recorded payments vanish with the invoice**.

The UI warning (`approval-queue-page.tsx:1782`) mentions only "removes its dependent deals" — not
quotes, invoices or payments. No soft-delete, no undo. If `updateStatus` throws afterwards, the
deletes have already committed while the request stays `pending`, so the manager clicks Approve
again.

**[LIVE] There is a pending request of exactly this kind on staging right now** — "Interactive
Boards", currently Converted, raised by Tanya G, 58 days old. Do not approve it until this is fixed.

### 2.4 [CODE] No segregation of duties on approvals
`cash-requisitions.service.ts:341-350` has `assertNotSubmitter()`, called from `managerApprove`
(`:358`), `financeApprove` (`:410`) and `markPaid` (`:464`). There is **no equivalent** in
`leads.service.ts:1690` or `deals.service.ts:1078` — `request.requested_by_id` is never compared to
the approving `userId`. A `sales_manager` can raise a `tactical_disqualify` or `reassignment` request
on any lead and immediately approve it, producing an audit trail that reads "manager-reviewed".

Requisitions have the same hole one level up: `admin` sits in **both** `MANAGER_APPROVER_ROLES` and
`FINANCE_APPROVER_ROLES` (`cash-requisitions.service.ts:57-64`), and nothing compares
`finance_actioned_by_id` to `manager_actioned_by_id`. Three clicks on one screen take a requisition
SUBMITTED → MANAGER_APPROVED → FINANCE_APPROVED → PAID under one name. There is also **no amount
threshold anywhere** — a USD 250,000 line approves exactly like a USD 12 fuel claim.

---

## 3. Money and finance

### 3.1 [LIVE] $90,400 of received cash is invisible to every instalment-based screen
Of the 13 invoices on staging carrying an instalment schedule, **8 have received payments their
schedule does not reflect at all**:

| Invoice | Status | Total | Invoice says paid | Schedule says paid | Instalment statuses |
|---|---|---|---|---|---|
| INV-2026-0058 | Partially-Paid | 39,000 | **13,000** | 0.00 | all `pending` |
| INV-2026-0054 | Partially-Paid | 23,400 | **7,800** | 0.00 | all `pending` |
| INV-2026-0050 | Partially-Paid | 15,600 | **8,000** | 0.00 | all `pending` |
| INV-2026-0047 | Partially-Paid | 31,200 | **15,600** | 0.00 | all `pending` |
| INV-2026-0042 | Partially-Paid | 31,200 | **7,000** | 0.00 | all `pending` |
| INV-2026-0037 | Partially-Paid | 22,765 | **7,800** | 0.00 | all `pending` |
| *(+2 more)* | | | | | |
| **Total** | | | **90,400** | **0.00** | |

The Collections screen confirms it visually — **all 34 instalment rows show `Paid $0.00`**, including
invoices the Invoices page reports as Partially-Paid.

**Consequence:** Collections, the aging buckets, "Upcoming Instalments" and every 90+ day figure are
computed as if $90,400 of banked money was never received. Anyone chasing the 90+ bucket will call
schools that have already paid.

Invoice-level accounting is fine — `invoice.amount_paid` updates correctly, which is why the invoice
list, the Paid/Partially-Paid statuses and Cash Collected all reconcile. The break is specifically
that **payment allocation never credits the instalment rows**. §3.6 is the prime suspect.

### 3.2 [LIVE] One payment is accounted for nowhere at all
Across 32 payments totalling $202,600: allocated **$175,100**, unallocated **$25,400**, **sum
$200,500** — **$2,100 unaccounted for**.

The culprit is one payment against **INV-2026-0072**: `amount = 2,100.00`, `allocated_amount = 0.00`,
`unallocated_amount = 0.00`. The invariant *allocated + unallocated = amount* is broken — the money is
recorded as received and tracked in neither bucket. Separately, 4 payments totalling **$27,500** have
`allocated_amount = 0`.

### 3.3 [LIVE] Five different answers to "how much are we owed"

| Screen | Figure |
|---|---|
| Reports → Finance → Outstanding | **$550,658.50** |
| Collections → Total Outstanding | **$299,329.25** |
| Dashboard → Collections Due | **$124,800.33** |
| Dashboard → Overdue exposure | **$117,200.33** |
| Computed from the invoice table (total − paid, excl. Draft/Cancelled) | **~$202,665** |

The Reports figure is provably impossible: **$550,658.50 exceeds $544,629.25, the total value of
every invoice ever issued**, before subtracting the $202,600 already collected.

I traced why. `GET /reports/finance` returns **54 outstanding rows when only 38 invoices exist**:

- **25 rows have no matching invoice in the Invoices list** — they are *child* invoices of instalment
  splits. The list endpoint excludes them (`invoices.service.ts:333`, `parent_invoice_id IS NULL`) but
  the report does not, so **summary parents and their children are both counted**.
- **12 rows are Draft invoices** — never issued, counted as receivables.
- **1 row is a fully Paid invoice.**

Collections is internally consistent (its five buckets sum exactly to its own total) but uses a
different basis again.

### 3.4 [LIVE] The finance report shows negative amounts due
The server already nets the figure (`reports-read.service.ts:223-226`,
`amountDue = max(0, total - amount_paid)`) and the client subtracts payments a second time
(`view-reports-page.tsx:392-396`). **6 rows render negative** and 5 render `$0.00` despite carrying a
balance. On screen right now:

```
INV-2026-0002  Adelaide Council Secondary School   -$2,900.00  Partial
INV-2026-0004  Corpus Christ High School                $0.00  Partial
INV-2026-0014  Chiredzi Government Primary School    -$100.00  Partial
```

The list's true total is $550,658.50; as rendered it sums to **$399,358.50** — matching neither the
truth nor the server's own (already wrong) figure.

### 3.5 [CODE] `discount` is a percentage on the client and an absolute amount on the server
- Client editor: `document-items.tsx:76` — `const discount = (subtotal * discRate) / 100;`
- Client preview: `invoice-preview-modal.tsx:79` (same `/100`), `:320` renders it with a `%` suffix.
- Server: `invoices.service.ts:1004-1005` — `itemTax = (itemSubtotal - itemDiscount) * rate/100`,
  `itemTotal = itemSubtotal - itemDiscount + itemTax`. Same in `updateItem` (`:847-852`) and quotes
  (`quotes.service.ts:873`, `:955`).
- Server PDF: `document-generator.service.ts:270` prints `item.discount` as money.

**Scenario:** 2 × $500.00, tax 15%, rep types `10` in a box labelled `%`. The screen shows discount
$100.00 and a line total of $1,035.00. The server stores discount $10.00 and bills **$1,138.50**. The
customer's PDF prints "Disc. $10.00". The error is `subtotal × (d/100) − d` — on a $50,000 line at
"15%" that is **$7,492.50**. `document-items.tsx:212` compounds it by seeding the field from
`product.discount`, which the catalogue holds as a percent.

**[LIVE] Good news: this has not bitten yet.** Zero of the 38 invoices on staging use a discount, and
zero use tax. Those paths have never been exercised on real data — a landmine, not existing
corruption. Fix it before anyone raises a discounted quote.

### 3.6 [CODE] Editing or deleting a payment runs outside any transaction, through a different allocator
`payments.service.ts:607-655` (`update`) and `:657-683` (`remove`) are plain sequential awaits — no
`dataSource.transaction`, no row lock. `create` (`:80-83`) *is* fully transactional.

Two allocators exist and disagree: the create path (`payments.service.ts:363-415`) selects on
`balance > 0` and marks `paid` when `balance <= 0`; the edit path (`payment-terms.service.ts:782-793`)
selects on `status IN ('pending','partially_paid') AND balance > 0` and marks `paid` only when
`balance === 0`.

**Scenario:** a $4,000 payment on a 3 × $3,333.33 schedule is edited to $2,000. The reversal credits
instalments back, then the process fails before re-allocation runs. The payment says $2,000, its
`allocated_amount` says 0, the instalments say nothing is paid, and `invoice.amount_paid` is still
$4,000. Nothing rolls back. **Prime suspect for §3.1 and §3.2.**

### 3.7 [CODE] Deleting an invoice hard-deletes its payment history
`invoices.service.ts:587-604` — `remove()` deletes document items then `invoiceRepository.remove()`.
No check for payments, no status check, no reversal. With the CASCADE FK, a $10,000 invoice with
three payments totalling $8,000 loses all three payment rows and their allocations. $8,000 of banked
cash disappears from Cash Collected and the finance reports. The activity log records only that the
invoice was deleted — the payments are not logged. Unrecoverable from the app.

Compounding: `installments.invoice_id`, `parent_invoice_id` and `applied_payment_terms.document_id`
are plain uuid columns with **no FK**, so schedules and applied-term snapshots survive as orphans.
**[LIVE]** This is the most likely origin of the three ownerless instalments in §3.10.

### 3.8 [CODE] Cancelling an invoice doesn't touch its money, and deleting a payment un-cancels it
`invoices.service.ts:965-972` — in `recalculatePaymentStatus`, the `totalPaid === 0` branch writes
`invoice.status = 'Sent'` **unconditionally**. Same at `payments.service.ts:450-455`.

**Scenario:** $10,000 invoice, $4,000 received, then cancelled. The $4,000 stays in `payments`, so
Cash Collected (`dashboard.service.ts:325-328`) still counts it — neither joins invoice status.
Finance deletes that payment to tidy up → `totalPaid === 0` → **status flips Cancelled → Sent**. The
cancelled invoice is live again in Collections and the Overdue KPI at $10,000.

The summary-invoice branch of the same function (`:934-937`) writes `'Draft'` for the identical
condition — two different answers in one function.

### 3.9 [CODE] The instalment schedule is never regenerated when the invoice changes
`invoices.service.ts:811` (`addItem`), `:856` (`updateItem`), `:890` (`removeItem`) all call
`recalculateInvoiceTotals`, which touches only the invoice's own totals. No instalment, applied-term
or child invoice is updated, and `payment-terms.service.ts:259-263` refuses to re-apply a term — so
there is no recovery short of SQL.

**Scenario:** $10,000 invoice on a 3× term. Add a $5,000 line → invoice total $15,000, schedule still
$10,000. `assertPaymentAmount` now permits $15,000 of payments but the allocator can only place
$10,000; the last $5,000 sits unallocated forever, the invoice reads **Paid**, and the aging report
still shows a balance. `getPaymentSchedule` renders invoice total $15,000 beside applied-term total
$10,000 on the same panel.

### 3.10 [LIVE] Orphaned instalments and a float artifact
Collections lists three instalments with **no invoice number and no customer** (`— — #1/#2/#3`,
$100.00 each), and a "By Customer" row reading `— 3 $300.00`.

`GET /reports/finance` returns `amountDue: 0.32999999999992724` for INV-2026-0038 — a raw float
artifact in a money field, reaching the API response unrounded.

### 3.11 [CODE] Three incompatible definitions of "overdue"
- `dashboard.service.ts:335-338` — `due_date < now AND status IN ('Sent','Partially-Paid','Overdue')`.
  **Ignores `grace_due_date` entirely.**
- `invoices.service.ts:1149`, `:337-340` — `COALESCE(grace_due_date, due_date) < NOW() AND payment_status != 'Paid' AND status != 'Cancelled'`. Includes Draft.
- `dashboard.service.ts:611-613` — `getCollectionsDue` compares **formatted date strings** after
  `formatDate`, and silently drops every invoice with a null `due_date`.

**Scenario:** $10,000 unpaid, `due_date` 1 Aug, `grace_due_date` 31 Aug, today 15 Aug. Dashboard
Overdue KPI: counted. Invoices page Overdue KPI: not counted. Aging report: not counted.

**No code path ever writes `status = 'Overdue'`** — `invoices.service.ts:426-431` and `:480-484`
explicitly forbid it, and `recalculatePaymentStatus` only ever writes Sent/Paid/Partially-Paid. The
`'Overdue'` element in those `status IN (...)` lists is dead.

### 3.12 [CODE] Invoice KPI double-counts split invoices; the list beneath it does not
`invoices.service.ts:1122-1131` — `getInvoiceStats` groups all invoices with no
`parent_invoice_id`/`is_summary_invoice` filter, while `findAll` (`:333`) excludes children. A
$10,000 invoice split 3× shows one row of $10,000 in the list and **$20,000** in the KPI strip above
it. `deals.service.ts:602,661` remembered to exclude summaries; the invoice KPI did not. **Same
mechanism as §3.3.**

Related: `outstandingValue` is gross (`SUM(i.total)`, `:1167,1183`) while `overdueValue` is net
(`SUM(i.total - i.amount_paid)`, `:1143`), so the "of which overdue" relationship the comment at
`:1138-1139` asserts can never reconcile — outstanding is overstated by exactly the cash collected.

### 3.13 [CODE] One quote can become unlimited invoices
`invoices.service.ts:208-234` — the duplicate check sits inside
`if (sourceQuote && sourceQuote.status !== 'Accepted')`. Once the first invoice marks the quote
Accepted, the whole block including the duplicate check is skipped. `convertFromQuote` (`:645-654`)
guards properly; the manual path does not. Two calls produce two live invoices for $20,000 against
one accepted quote, and `deal.value` is assigned (never accumulated) so the deal still reads $10,000.

### 3.14 [CODE] Draft invoices accept payments; negative invoices can never be closed
- `payments.service.ts:312-333` — `lockPayableInvoice` rejects only summary invoices and Cancelled. A
  **Draft** invoice (never sent, no PDF generated) accepts payment and jumps to Partially-Paid.
  Auto-generated instalment children are created as Draft (`payment-terms.service.ts:459`), so this is
  the normal state for every split invoice. **[LIVE] 12 Draft invoices are currently counted as
  receivables (§3.3).**
- `create-invoice.dto.ts:46-50` — `discount` is `@Min(0)` with no upper bound and no cross-check
  against `quantity × unit_price`. 1 × $100 with a $500 discount and 15% tax yields a line total of
  **−$460.00**; `getOutstanding` clamps to 0, so `assertPaymentAmount` then rejects **every** payment
  and the invoice can never be closed.

### 3.15 [CODE] Allocation references collide, and currency is not representable
- `payment-terms.service.ts:833` calls `generateAllocationReference()` inside the loop but persists
  only after it (`:857-859`), and the generator (`:645-663`) reads the newest row by `created_at` —
  nothing it counts has committed yet. **All allocations from one payment get the same reference.**
  The header comment at `:618-624` documents that this exact approach was already proven broken for
  invoice numbers and replaced with `MAX(...)` + advisory lock; the fix was never carried across.
- **Invoices and Payments have no currency column at all** (`invoice.entity.ts`,
  `payment.entity.ts`), while Quote (`:105`) and Deal (`:100`) do. A USD quote converts to an invoice
  that renders in whatever the CRM-wide currency setting says, and a ZAR payment of 10,000 against a
  USD 10,000 invoice marks it **Paid**. A currency mismatch is undetectable because it is not
  representable. See also §8.4.

### 3.16 [CODE] Smaller money items
- **Interest is added to invoices but never to quotes** — `payment-terms.service.ts:324` gates the
  interest line item on `document_type === 'invoice'`. A customer accepts a $10,000 quote and receives
  an $11,000 invoice.
- **Zero-value instalments never reach `paid`** — both allocators filter `balance > 0`, so a $0.01 /
  3× schedule leaves two rows `pending` forever on a fully paid invoice.
- **`installment_amount` reports the first instalment** (`installment-calculation.service.ts:115`), so
  the UI prints "3 terms @ $3,333.33" for a schedule ending 3,333.34.
- **`PATCH /invoices/:id` can move `due_date` without touching `grace_due_date`** or any instalment
  date (`invoices.service.ts:433-447`).
- **Upcoming Instalments uses stored status and gross amount** (`reports-read.service.ts:238-260`)
  while the aging report on the adjacent screen rebuilds paid/balance/status from `invoice.amount_paid`
  (`:320-365`), on the stated grounds that "installment rows are a projection, not the cash ledger".
  **Given §3.1, the aging report is right and the schedule is stale.**
- **The aging report no longer excludes Cancelled/Draft invoices** — `reports-read.service.ts:287`
  replaced the status filter with `invoice.id IS NOT NULL`. Cancelled invoices now appear with
  `days_overdue` and inflate the 90+ bucket, while `deals.service.ts:597-599` still excludes them for
  pending collections.
- **The aging FIFO can attribute one child invoice's cash to a sibling** —
  `reports-read.service.ts:313-360` seeds the paid pool once per parent group from
  `parentInvoice.amount_paid`, then allocates across all children ordered by due date only.
- **`PUT /payments/:id` never calls `assertPaymentAmount`** (`payments.service.ts:607-655`), so a
  payment can be **edited** into an overpayment (500 invoice, 50,000 recorded, status forced to Paid).
- **Approving a payment request re-applies the requester's ownership scope** —
  `payments.service.ts:143-157` passes `request.requested_by_id` as the scope user and
  `lockPayableInvoice` (`:312-323`) 404s when the invoice owner differs. If the invoice is reassigned
  between request and approval, the manager gets `404 Invoice not found`, the transaction rolls back,
  and the request is stuck pending forever.

### 3.17 [LIVE] Invoiced and paid quotes never become Accepted, then the nightly cron marks them Expired
**$131,400 has been collected against invoices whose source quote is still Draft or Expired.**

Live counts across the 32 invoices that carry a `quote_id` (all resolvable):

| Status of the quote behind the invoice | Invoices |
|---|---|
| Accepted | 12 |
| **Draft** | **9** |
| **Expired** | **11** |

Of the 20 invoices sitting on a non-Accepted quote, **16 have received money — $131,400**. Examples:

```
INV-2026-0058  paid 13,000.00  <-  QUO-2026-0036 [Expired]
INV-2026-0047  paid 15,600.00  <-  QUO-2026-0032 [Expired]
INV-2026-0050  paid  8,000.00  <-  QUO-2026-0033 [Expired]
```

**Mechanism.** The nightly sweep at `quotes.service.ts:88-98` moves any quote to `Expired` where
`status IN ('Draft','Sent') AND valid_until < now`. It deliberately leaves Accepted and Rejected
alone — that part is correct. So a quote behind a **paid** invoice can only have been marked Expired
if it was still **Draft or Sent** when the cron ran. In other words, **being invoiced and paid did
not move the quote out of Draft**, and the expiry sweep then swallowed it.

**Consequences:**
- The quote pipeline is corrupted — **36 of 63 quotes on staging read `Expired`**, including ones the
  school has already paid in full. No quote is in `Sent` or `Rejected` at all.
- There is **no audit trail from cash back to accepted commercial terms**. A customer who has paid
  $15,600 has no Accepted quote on record; the document that recorded what they agreed to is filed as
  expired.
- Quote-based conversion and win-rate reporting is measuring a fiction.

Related to §3.13 but distinct: that finding is about one quote producing many invoices; this is about
the quote status never advancing when it should.

### 3.18 [LIVE] Five quotes have each produced two top-level invoices, and two of those pairs carry money
Confirmed against staging (the list endpoint excludes child invoices, so all of these are top-level —
none is the child of the other):

```
INV-2026-0028 = 7,800.00  Paid            +  INV-2026-0009 = 7,800.00  Paid
INV-2026-0030 = 31,200.00 Partially-Paid  +  INV-2026-0004 = 31,200.00 Partially-Paid
INV-2026-0021 = 15,600.00 Draft/SUMMARY   +  INV-2026-0010 = 15,600.00 Draft/SUMMARY
INV-2026-0064 = 11,700.00 Draft/SUMMARY   +  INV-2026-0063 = 11,700.00 Draft
INV-2026-0068 =  7,800.00 Draft/SUMMARY   +  INV-2026-0067 = 15,600.00 Draft
```

The first pair is the clearest: **the same quote has two separate fully-Paid invoices of $7,800 each
— $15,600 collected against one quote.** The last pair is internally inconsistent in a different way:
a *summary* invoice for $7,800 sitting alongside a full-value $15,600 invoice on a quote whose own
total is $15,600.

**Caveat, stated honestly:** staging carries hand-made test data, so these pairs may be artefacts of
manual testing rather than proof the §3.13 defect fired in normal use. What is not in doubt is that
the code permits it (§3.13 — the duplicate check is skipped once the quote is Accepted) and that the
data now contains the exact shape that defect produces. Worth checking whether production has the
same pattern before assuming it is test residue.

### 3.19 [LIVE] 60% of invoices name a sales rep as the customer — $380,929 of billing would email the wrong person
**23 of the 38 invoices on staging carry an exact active-staff-user email as the customer email.**
All 23 are `busid@clearhue.co.zw`, which belongs to sales rep **busi danisa**.

| | |
|---|---|
| Invoices with a staff account as `client_email` | **23 of 38** |
| Value on those invoices | **$380,929.25** |
| Already paid on those invoices | **$155,600.00** |

The customer-email domain spread across all invoices is: `clearhue.co.zw` **23**, `gmail.com` 13,
`school.com` 1, `example.com` 1. `clearhue.co.zw` is DigiLearn's own staff domain — the reps are
`busid@`, `mpofunk@`, `tanyag@`, `bretk@`, `theben@`, `solomon@`.

The schools named on those invoices are real (`Chrome Secondary School`, `Errymaple Group of
schools`, `Mr W Tapera`), but the address attached to them is a rep's inbox.

**Why this matters, and why it is invisible today.** `CODEBASE-SKELETON.md` §10 states the rule
plainly: *"Internal domains, the shared admin address and exact active-user emails are not valid
customer contacts."* That rule is enforced for lead/contact identity and duplicate scoring — it is
**not** enforced on `invoices.client_email`, which is what actually receives correspondence.

Right now nothing is delivered at all, because SMTP is unconfigured (§7.2, §7.4). **The moment SMTP
is switched on, every invoice email, receipt, statement and dunning notice for $380,929 of billing
goes to one sales rep's inbox instead of to the schools** — and the schools, having received nothing,
carry on as before. Fixing the email configuration would *create* the incident rather than reveal it.

Fix the data and add the validation before wiring SMTP, not after.

### 3.20 [LIVE] Payment references are free text, so reconciliation by reference is unreliable
The Payments list shows 31 references of the form `PAY-2026-00NN` and one row whose reference is
literally **`TN 123`** ($2,000, Bishop Hlongwani, 14-08-2026). The reference column is user-supplied
and not validated against, or distinguished from, the generated sequence. Combined with §3.15 (all
allocations from one payment share a single generated reference), there is no reliable key to
reconcile a bank statement line back to an allocation.

---

## 4. The sales rep's day

### 4.1 [CODE] Any edit to an overdue activity returns 400
`activities.service.ts:376-384` (new guard) called from `:1266` (edit path). `update()` calls
`assertOpenActivityHasDate` with the **merged existing entity**, and the guard throws whenever the
planned date is in the past — regardless of what the user actually changed.

**Repro:** task "Call the bursar", `due_at = 2026-08-10`, status `scheduled`.
`PATCH /activities/:id {"description":"tried twice"}` → **400 "Planned activities must be scheduled
for a future date and time"**. Fixing a typo, adding a note or reassigning **any** overdue record is
impossible without also moving the due date. **[LIVE] there are 156 overdue follow-ups on staging.**
The old code was `if (dueAt || scheduledAt) return;` — a pure pass-through.

### 4.2 [CODE] A rep cannot log a meeting that already happened
Meetings deliberately stay `scheduled` (`create-activity-modal.tsx:243`) and
`meeting-tab-form.tsx:76` mirrors `start_time` into `due_at`. The same guard rejects it. Writing up
yesterday's school visit returns 400. The only way through is to misstate the date.

### 4.3 [CODE] The completion dialog can trap the user with no way out
At stage `"next-step"`, Cancel is hidden (`activity-completion-dialog.tsx:1323`) and
`onEscapeKeyDown`, `onInteractOutside` and `onPointerDownOutside` are all `preventDefault`ed
(`:865-867`). Two routes reach a permanently-disabled submit button inside that stage:

- **Disqualify branch:** requires a ≥10-character note (`:494-495`), but the note editor renders only
  when `!alreadyCompleted` (`:902`) and `note` is reset to `""` (`:311`) — the requirement can never
  be met.
- **Next step needs a contact the record doesn't have:** `PersonPicker` resolves contacts only from
  `leadId`/`schoolId` (`person-picker.tsx:64-73`), so a lead with no stakeholders and no primary
  contact shows "No stakeholders found" and submit stays disabled. Reached **automatically** —
  outcomes `no_response`, `unsuccessful`, `rescheduled`, `proposal_sent` and `follow_up_needed`
  auto-select a call next step.

Only a page reload escapes, and the queue is persisted to `sessionStorage`
(`use-activity-completion-store.ts:136-152`), so the same modal returns. This is the LCK1/C9 lock-in
pattern recurring.

### 4.4 [CODE] "No next step → Nurture" always fails, after already mutating the lead
`activity-completion-dialog.tsx:743-760` moves the lead to Nurture, then calls `complete()` with **no**
`next_step`, assuming Nurture satisfies the gate. The server gate (`activities.service.ts:134-168`)
exempts only `Disqualified`/`Converted` leads and won/lost deals. Nurture is not exempt → 400 every
time. The lead has *already* been moved, so each retry re-writes `follow_up_date` and the activity
never closes.

### 4.5 [CODE] Reopening a completed activity is a permanent no-op that also hides the work
`updateStatus` sets `activity.status` (`activities.service.ts:1480`) but never clears `completed_at`,
`completion_outcome` or `completion_note` (only ever written, `:1482-1486`).

- The row's done-test is `status === "completed" || !!completed_at` (`activities-page.tsx:280-281`),
  so the tick stays on and reopening looks like it did nothing.
- Every open-work query adds `completed_at IS NULL` (`activities.service.ts:995-1000`), so the
  reopened item disappears from the To-do/Overdue tabs, the lead engagement panel
  (`engagement-workspace.tsx:177`) and the pipeline next-step chip (`pipeline-kanban.tsx:85`).

Compounding, `bulkUpdateStatus` guards the outcome write with `&& !activity.completed_at` (`:1719`),
so bulk-completing a reopened activity **keeps the stale outcome** and discards the new one.

### 4.6 [CODE] Ticking a task Done writes to the child row only — the lead never advances
`tasks-tab.tsx:57-80` and `activity-task-sheet.tsx:167-175` send `PUT /activities/:id` with
`{ task: { status: "done" } }`. `update()` saves the `Task` row (`activities.service.ts:1304-1307`)
and nothing else: `Activity.status` stays `scheduled`, `completed_at` stays null, no outcome is
captured, and `updateLeadContactStatus` is never called — so `last_contacted_at` is not bumped and
New → Contacted (`:2387-2394`) does not fire. The UI reads done-ness from `activity.task?.status`
(`lib/task-helpers.ts:9`) and shows "Task completed", while the activity stays overdue everywhere
else and the SLA clock keeps running.

### 4.7 [CODE] `assigned_to_id` is silently discarded on activity create
`activities.service.ts:510-512` spreads the DTO then unconditionally overwrites `assigned_to_id` with
the auto-derived assignee. A manager creating a task for rep B on rep A's lead gets it assigned to
**rep A**, with no error.

### 4.8 [CODE] "Request Reassignment" has a required field a rep can never fill
`request-reassignment-dialog.tsx:65-69` fills the "Reassign to" select from `useStaff` →
`GET /users`, which is `@Roles('admin','sales_manager')` (`users/users.controller.ts:39-40`). A
`sales_rep` gets 403, the list is empty, and the zod schema demands a uuid (`:40`). The dialog can
never be submitted — the reassignment request is unreachable for the only role that needs it.

### 4.9 [CODE] An email's follow-up date is silently discarded
`email-tab-form.tsx:82` maps the rep's follow-up date to the parent `due_at`, and emails are created
`completed`. In `create()`, the `CALL` branch builds a follow-up task from `call.follow_up_date`
(`activities.service.ts:582-604`) and `WHATSAPP` does the same (`:672-694`) — the `EMAIL` branch
(`:608-630`) creates nothing. The rep sets "follow up 20 Aug", sees "Email sent and saved", and no
task exists.

Same class: a typed next step is dropped entirely when the activity has no lead or deal —
`:1490-1494` only enters the atomic transaction when `nextStep && (activity.lead_id || activity.deal_id)`;
otherwise `:1589-1591` saves the completion alone and returns 200.

### 4.10 [CODE] Stakeholders are append-only — Edit / Set as primary / Remove are stubs
`people-tab.tsx:221-231` — all three handlers just `toast.info("… is not available yet.")`, yet the
dropdown renders all three (`:667-678`). Server-side there is genuinely no route: only
`@Get(':id/stakeholders')` (`leads.controller.ts:332`) and `@Post(':id/stakeholders')` (`:351`). A
stakeholder added with the default `decision_role: "influencer"` (`people-tab.tsx:167`) can never be
promoted to decision maker and never deleted.

### 4.11 [CODE] Deleting your own task always 403s
`tasks-tab.tsx:82-93` calls `DELETE /activities/:id`, which is `@Roles('admin','sales_manager')`
(`activities.controller.ts:336-337`). The menu item is gated only by `isReadonly`
(`task-list-item.tsx:186-190`), never by role.

### 4.12 [CODE] A breached lead can never be un-breached by working it
`sla_breached` is set true only by the cron (`sla/sla-breach.service.ts:63-68`, reading only
`current_sla_due_date`) and false only by `transitionStatus` (`leads.service.ts:2193`). Completing a
call bumps `last_contacted_at`/`last_action_at` but never extends `current_sla_due_date`. A rep can
call a Contacted lead five times over two weeks and the red badge never clears.

### 4.13 [CODE] Bulk "Mark done" can only record failure, and bypasses the gate
The bulk outcome picker is limited to `no_response / unsuccessful / rescheduled`
(`activity-completion-dialog.tsx:202-206`, `:452`), written verbatim to every row
(`activities.service.ts:1723`). Clearing 20 genuinely successful old activities means recording them
all as failures.

And the server-side next-step gate is absent from that path entirely — `assertNextStepCompliance` has
exactly two references in the server (definition at `:134`, single-item call at `:1412`);
`BulkStatusDto` has no `next_step` field. The controller comment at `activities.controller.ts:309-311`
claims the opposite. `PATCH /activities/:id` also completes without the check (`:1277-1301`) and
**never stamps `completed_at`**, so those rows drop out of every discipline metric.

### 4.14 [CODE] Other rep-facing defects
- **A rep never sees the rep dashboard.** `dashboard-page.tsx:103-106` gates on
  `usePermission("Dashboard","read")`, which the seed grants to `sales_rep`
  (`seed-roles-permissions.ts:142`), so the `<SalesRepDashboard />` branch at `:128-130` is
  unreachable. Reps land on the Executive Dashboard's manager widget wall.
- **Global search does nothing if you are already on Leads.** `global-search.tsx:41-45` always
  navigates to `/leads?search=…`, but the page seeds its box in a lazy `useState` initializer with no
  re-sync effect (`leads-management-page.tsx:277-280`).
- **The bug-report form wipes on any accidental dismiss.** `bug-reports-page.tsx:330-335` calls
  `reset()` (13 fields) from `onOpenChange`, which Radix fires on Escape and outside-click, with no
  guard on `DialogContent` (`:344`). The body is `max-h-[85vh] overflow-y-auto`, so a stray click on
  the scroll gutter is the likely case.
- **PersonPicker silently auto-commits the wrong person.** `person-picker.tsx:125-136` — the
  auto-select effect is not guarded by `isLoading`, and the lead's primary contact resolves before the
  stakeholder list. During that window the list has length 1, so it auto-selects and the choice sticks.
- **Rich-text HTML is sent into a 2,000-character plain-text cap**
  (`activity-completion-dialog.tsx:522`, `activity-composer.tsx:301` vs `@MaxLength(2000)`). Markup
  roughly doubles the length, so a note the rep sees as ~1,000 visible characters is rejected with an
  error they cannot act on.
- **Cross-school contact accepted when the lead has no school.** `activities.service.ts:1437-1447`
  skips the school-match guard entirely when `lead.school_id` is null, then writes that contact's
  phone/email onto the follow-up.
- **Money rounded to whole units in qualification.** `QualificationNeedsDto.price/tax/discount` are
  `@IsInt()` (`create-lead-qualification.dto.ts:55-65`) though the swagger example is `'22.60'`.
- **The selected payment term is dropped on qualification save.** `lead-qualification-modal.tsx:200-203`
  holds `payment_term_id`, but the payload (`:229-245`) sends only `plan_type`.
- **`AddPaymentModal` wipes the form mid-typing** (`add-payment-modal.tsx:162-172`, `form.reset()` on
  every `initialAmount` change) and swallows every server error into one unactionable toast (`:244-246`).

---

## 5. The sales manager's day

### 5.1 [LIVE] The Compliance Report ranks the wrong reps as worst
The page states it is "sorted with the lowest outcome compliance first so the reps who need attention
surface at the top". What it shows:

| Rep | Contacts | Completed | Outcome % | Next-step % | Overdue | Stale |
|---|---|---|---|---|---|---|
| busi danisa | 0 | 0 | **0%** | **0%** | 15 | 322 |
| Tanya G | 0 | 0 | **0%** | **0%** | 14 | 520 |
| Simba Chihera | 0 | 0 | **0%** | **0%** | 0 | 264 |
| Brett K | 0 | 0 | **0%** | **0%** | 0 | 0 |
| Theben Q | 0 | 0 | **0%** | **0%** | 0 | 0 |
| kim Mpofu *(Below goal)* | 2 | 2 | 100% | 50% | **85** | 81 |
| manake dube *(Below goal)* | 1 | 3 | 100% | 67% | 3 | 264 |
| Prince Banda *(Below goal)* | 3 | 4 | 100% | 75% | 2 | 0 |

Reps who completed **nothing** are rendered as `0%` — a zero-denominator division, not a real score —
and sorted to the top, while the only rep with a genuine problem (kim Mpofu, **85 overdue
follow-ups**) is pushed to the bottom. The dashboard's own Rep Discipline table renders those same
reps as `—`, which is correct. The report's headline ordering is driven entirely by the artifact.

### 5.2 [LIVE] The dashboard contradicts its own table, and the Compliance Report
From a single dashboard load (Month to Date):

- Headline card **"COMPLETED ACTIONABLE ACTIVITIES: 7"**
- Its own Rep Discipline table, COMPLETED column: 2 + 3 + 4 = **9**
- That table's CONTACTS column: 2 + 2 + 3 = **7**

The headline "completed" figure equals the **contacts** column. The Compliance Report, same period,
reports **9** — matching the table, not the card. Next-step compliance splits the same way: **57%
(4/7)** on the dashboard versus **67%** on the Compliance Report. Per rep it also diverges — manake
dube shows **2** contacts on the dashboard and **1** on the Compliance Report. The Compliance
Report's footer explicitly claims its numbers "match the same definitions the dashboard's Activity
Discipline cards use". They do not.

**Mechanism (§5.11):** per-rep queries use `(assigned_to_id = :u OR created_by_id = :u)` while the
team KPI uses assignment only.

### 5.3 [LIVE] Reports and the dashboard disagree on cash for the same quarter
Reports → Finance: **Cash Collected $23,400.00 · This quarter**. `GET /dashboard/kpis?dateRange=qtd`:
**25,400**. Same quarter, $2,000 apart. (API returns MTD 25,400 / QTD 25,400 / YTD 202,600.)

### 5.4 [LIVE] Most of the Duplicates queue cannot be decided — records render as bare IDs
Of the 26 pending **Lead** pairs, **18 render as `2db35f55… (record unavailable)`** on both sides, and
**both** pending School pairs do too. Only 8 show real names.

Root cause: `attachRecordNames` (`duplicate-detection.service.ts:528-556`) resolves labels with
`this.leadRepo.find({ where: { id: In([...]) } })`. `Lead` is soft-deleted (`@DeleteDateColumn`,
`lead.entity.ts:264`), and TypeORM's `find()` excludes soft-deleted rows by default — so any suspicion
pointing at a deleted lead resolves to nothing, `label` is null, and the client falls back to the id
fragment (`duplicates-queue-page.tsx:268`).

**This exact bug was already fixed once, in the other queue.** `leads.service.ts:1319-1330`, comment
R1: *"retire any pending auto-assign proposals for this lead so the approval queue doesn't keep an
orphan row (which rendered as a bare 'ID') once the lead is gone."* Lead deletion supersedes
`LeadAssignmentProposal` rows and does nothing for `DuplicateSuspicion`. The queue still offers Keep
both / False positive / **Merge** on records that no longer exist.

Also visible: pairs scored **60/100** purely on "Phone matches" with completely different names —
*Mutepfe Secondary* vs *Bumhira Sec*, *Vurasha Secondary* vs *Vurasha High*. Zimbabwean schools share
numbers, so phone alone at 60 (threshold 50) generates false positives a manager clears by hand.

### 5.5 [CODE] "Keep both" is undone by the Rebuild button on the same screen
`recordSuspicion` (`duplicate-detection.service.ts:411-420`) de-dupes on
`{record_type, new_record_id, existing_record_id, status:'pending'}` only, so a pair marked
`kept_separate` is invisible to it. `rebuildLeadSuspicions` (`:452-490`) purges pending rows then
re-records the strongest candidate for every live lead, deterministically choosing the same direction
(`:476`). `scanAll` has a correct any-status/either-direction `pairKnown` helper (`:655-665`); Rebuild
has no equivalent. The page promises "reviewed pairs are not re-flagged"
(`duplicates-queue-page.tsx:143-144`).

Related: `mergeLeads` (`leads.service.ts:2654-2702`) reparents nine child entities but **not**
`LeadQualificationCriteria` — the loser's BANT checklist stays attached to the retired lead.

### 5.6 [CODE] A sales manager gets "Deal not found" on every deal they don't own
`deals.controller.ts:495-497` treats only `manage:all` / `manage:Deal` as elevated, then throws
`NotFoundException('Deal not found')` (`:506-510`). `sales_manager` is seeded
create/read/update/delete on Deal but **never `manage`** (`seed-roles-permissions.ts:104-107`) — only
`admin` and `admin_support` get it. Opening any rep's card from the pipeline board renders "Deal not
found", and the same helper gates `GET/POST /deals/:id/rollback-requests`. Combined with §2.2, the
reviewer is locked out while the requester is not.

### 5.7 [CODE] Reassigning a deal's owner reports success and changes nothing
`view-deal-details.tsx:246-255` sends `PUT /deals/:id { assigned_to }` and toasts "Deal owner
updated". `assigned_to` passes DTO validation (`create-deal.dto.ts:101-104`) so it returns 200, but
`DealsService.update` (`deals.service.ts:778-814`) builds its payload from
title/description/value/currency/probability/position/expected_close_date only and never reads
`dto.assigned_to`. The working endpoint, `PATCH /deals/:id/assignee` (`deals.controller.ts:473-485`),
has **no client caller**. The dropdown snaps back on refetch.

### 5.8 [CODE] Resolving an escalation does nothing to the lead
`lead-escalation.service.ts:57-85` writes `resolution`, `resolution_notes`, `resolved_by_id`,
`resolved_at` and nothing else — no lead repository is even injected (constructor `:25-29`). The
resolution enum (`lead-escalation.entity.ts:42-50`) offers `REASSIGN`, `PAUSE` and
`APPROVED_DISQUALIFICATION`, all implying a lead mutation that never happens. Choosing "Reassign"
moves the card to Resolved while `assigned_to`, `status`, `current_sla_due_date` and `sla_breached`
are untouched. Also `escalate()` (`:31-55`) has no open-escalation guard and `list()` hard-caps at
`take: 200` (`:113`) with no count or pagination.

### 5.9 [CODE] Bulk lead operations are dead, silent, or unscoped
`leads.controller.ts:599-649`:
- The `Disqualified` safety guard at `:626` **throws inside the `try` whose `catch {}` at `:639`
  swallows everything**. A bulk disqualify silently skips every lead and returns
  `success: true, "Bulk status completed: 0/N leads updated"`.
- No CASL ability is passed to `assignLead` / `updateStatus` / `remove`, unlike every single-lead
  route — bulk delete and bulk reassign are **unscoped**.
- `@Body()` is an inline type literal, so the global `ValidationPipe` skips it: no array check, no size
  cap, no `assigneeId` requirement.

The only bulk UI component, `components/bulk-action-bar.tsx`, is **never imported anywhere**; its
Assign button sends `{action:"assign"}` with no `assigneeId` (`:57`) and its Change Status button
hardcodes `status: "Contacted"` (`:67`).

### 5.10 [LIVE] The Product and "Specific Date" dashboard filters 400 every widget at once
`DashboardFiltersDto` (`dashboard/dto/dashboard-filters.dto.ts:15-40`) declares only `dateRange`,
`startDate`, `endDate`, `salesRepId`, `province`, and `main.ts:70` sets `forbidNonWhitelisted: true`.
The client spreads its whole filter object into every `/dashboard/*` call
(`use-dashboard.ts:62,114,140`) including `productCategory`, `customStartDate`, `customEndDate`.
`productCategory` has **zero** server readers. Confirmed live:

```
GET /dashboard/kpis?dateRange=mtd&productCategory=Board
  → 400 ["property productCategory should not exist"]
GET /dashboard/sla-compliance?dateRange=mtd&productCategory=Board
  → 400 ["property productCategory should not exist"]
GET /dashboard/kpis?dateRange=custom&customStartDate=2026-08-01
  → 400 ["property customStartDate should not exist"]
```

Choosing a product, or "Specific Date", drops every KPI, the SLA tile and the whole Manager Control
Panel into an error state simultaneously.

### 5.11 [CODE] Activity-discipline double-counts reps and ignores the Province filter
- `activity-discipline.service.ts:869-927` — per-rep `contacts`/`completed`/`withOutcome`/
  `nextStepCompliant` use `(a.assigned_to_id = :u OR a.created_by_id = :u)`, so an activity created by
  rep A and assigned to rep B lands in **both** rows. Yet `overdue` in the *same row* (`:925`) uses
  assignment only, while the team-level `overdue` KPI (`:518-522`) uses the OR form.
- **Province is silently ignored.** Applied in `getSLACompliance` (`dashboard.service.ts:1153`),
  `getLeadsByStage` (`:1115`) and `getExecutiveKPIs` (`:281`) but **nowhere** in
  `activity-discipline.service.ts` — `compute` (`:161-192`) reads only `salesRepId` and `dateRange`,
  despite the doc comment at `:27`. Filter to Bulawayo and the Manager Control Panel keeps showing
  national numbers.
- "Deals Progressed" (`:622-625`) has no `if (uid)` guard unlike its siblings.
- The client hardcodes thresholds Settings claims to own: `activity-discipline-section.tsx:251,258`
  ("14+ days"/"21+ days"), `:1004,1011` (`target={95}`/`80`), `:1147,1156` (cut-offs 70/60).

### 5.12 [CODE] Reports: amount due subtracted twice, and PDF ≠ XLSX ≠ screen
- **Double subtraction** — see §3.4.
- **PDF truncation under correct totals.** `report-export.service.ts:541` prints `items.slice(0, 15)`
  per aging bucket and `:317` prints `stage.deals.slice(0, 10)` per stage, while the totals at
  `:443-455` and `:273-277` are computed over the full set, with no "showing 15 of N" note. The XLSX
  paths print everything, so PDF and Excel of the same report disagree.
- **Different source entirely.** The on-screen aging report is built from installments and ages on
  `grace_due_date ?? due_date` (`reports-read.service.ts:302-306`); the export is built from invoices
  and ages on raw `due_date` (`report-export.service.ts:403-425`). Same title, different grand total.
  The sales export windows on `deal.created_at` while the screen windows on `actualCloseDate`.

### 5.13 [CODE] Auto-assign leaves stale SLA clocks and can reset an actively-worked lead
`automation/services/lead-auto-router.service.ts`:
- **Asymmetric SLA handling.** `approveProposal` (`:400-408`) sets the first-touch clock only
  `if (!lead.current_sla_due_date)`, but `undoApprovals` (`:543-547`) clears `current_sla_due_date` and
  `sla_breached` **unconditionally** — undoing an approval wipes a deadline the approval never set and
  clears a genuine breach flag.
- `sendProposalToNewLeads` (`:675-717`) sets `status:'New', assigned_to:null` but never clears
  `current_sla_due_date`/`sla_breached`, so the lead re-enters the pool ownerless carrying a stale,
  often already-breached deadline.
- **Neither `sendProposalToNewLeads` nor `redirectProposal` (`:601`) checks the proposal's status.** A
  rejected proposal whose lead was later assigned by hand and advanced to Qualified can be "Sent to New
  Leads" from the old row — stripping the owner and resetting the lead to New, in a non-transactional
  two-step write.
- Neither `approveProposal` nor `redirectProposal` is transactional or row-locked.
- **"Approve all" has no confirmation dialog** and operates on `pending`, not the rep-filtered
  `filteredPending` the table renders (`approval-queue-page.tsx:565-591`, `:698-699`, `:1120`) —
  clicking it while filtered to one rep approves the **entire** queue. **[LIVE] there are 224 pending
  proposals on staging.**

### 5.13a [LIVE] Auto-assign can only ever route to 2 of the 4 sales reps
Recipients are active `sales_rep`s **with a territory**. The live user list is:

| User | Roles | Territory |
|---|---|---|
| tanyag@clearhue.co.zw | sales_rep | Mash East/West/Central, Manicaland, Harare |
| manakedube@clearhue.co.zw | sales_rep | Midlands, Matebeleland South, Bulawayo, Masvingo |
| theben@clearhue.co.zw | sales_rep | **none** |
| bretk@clearhue.co.zw | sales_rep | **none** |
| busid@clearhue.co.zw | **sales_manager** | Mash East/West/Central, Manicaland, Harare |
| solomon@clearhue.co.zw | manager | none |
| prince@me.com | sales_manager + admin_support | none |
| nkululeko@clearhue.co.zw | manager + admin | none |
| doobsie81@gmail.com | sales_rep | none (INACTIVE) |

So **Theben Q and Brett K can never receive an auto-assigned lead** — they have no territory, and the
"no covering rep / blank province falls back to the lightest eligible workload" rule only redistributes
among reps who already qualify. The whole distribution engine, and its fairness maths, operates over a
pool of two people. Nothing on the Auto-assign screen says so.

Note also that `busid@clearhue.co.zw` is a **sales_manager** holding a full territory identical to
Tanya's, yet appears in the Compliance Report and Rep Discipline tables as though they were a rep
(§5.1 lists them with 15 overdue and 322 stale leads). Worth deciding whether that account is meant to
carry a book at all.

### 5.14 [CODE] Approval decisions notify nobody
`leads.service.ts` contains **zero** references to any notification service. `raiseEnquiry`
(`:1642-1662`), `respondToEnquiry` (`:1668-1688`) and `reviewReversalRequest` (`:1690-1812`) write only
activity logs. "Ask for info" sets `awaiting_rep_response = true` and stops — the rep finds out only if
they happen to open the Leads page where `my-enquiries-banner.tsx` is mounted. The auto-assign path
*does* notify (`lead-auto-router.service.ts:427-436`).

### 5.15 [CODE] Requisitions: rejection is a dead end, and your own requests block your inbox
`RequisitionStatus` (`cash-requisitions.entity.ts:23-30`) has no path out of `REJECTED`; `update()`
(`:226-228`) and `submit()` (`:270-274`) refuse anything but DRAFT — while the DTO's own example
rejection reason is *"resubmit with receipts"* (`dto/cash-requisition.dto.ts:155`). The approvals inbox
(`:519-537`) never excludes the caller's own requisitions, so a manager's own request sits there with
an Approve button that always 403s, permanently inflating the tab badge.

### 5.16 [CODE] Bug-tracker triage cannot clear fields
The client sends `undefined` (`bug-reports-page.tsx:602-612`), the key is dropped from the JSON, and
the server's `!== undefined` guards (`bug-reports.service.ts:309-315`) leave the old values — under a
"Ticket updated" toast. Priority, component and the resolution note can be set but never cleared.

---

## 6. Product owner — Settings, end to end

Rule applied: *a control that saves but changes no behaviour is a bug; a control that works on only
some paths is a bug.*

Server catalogue: `settings/compliance-settings.service.ts:28-216` (21 keys). Client mirror:
`components/admin/compliance-controls-content.tsx:52-100` (21 keys) — **the two lists match exactly,
no drift.**

### 6.1 Compliance & Controls (`compliance.*`)

| key | type | default | status | evidence | consequence |
|---|---|---|---|---|---|
| `targets.daily_contacts_per_rep` | num | 40 | **WIRED** | `activity-discipline.service.ts:272`, `compliance-report.service.ts:108`, `dashboard.service.ts:179` | works; `0` breaks the card (§6.5) |
| `targets.daily_contacts_per_manager` | num | 10 | **WIRED** | `activity-discipline.service.ts:274`, `dashboard.service.ts:476` | works |
| `thresholds.stale_lead_days` | num | 14 | **WIRED** | `activity-discipline.service.ts:718,943`, `compliance-report.service.ts:109` | works |
| `thresholds.stale_deal_days` | num | 21 | **WIRED** | `activity-discipline.service.ts:721`, `dashboard.service.ts:912`, `sla-scheduler.service.ts:600` | works (fallback when a stage has no `sla_days`) |
| `targets.monthly_revenue` | num | 100000 | **WIRED** | `dashboard.service.ts:360,1001` | works |
| `thresholds.expected_win_rate` | num | 0.25 | **WIRED, unit-fragile** | `dashboard.service.ts:363,1004` | §6.5 |
| `thresholds.high_value_deal` | num | 20000 | **PARTIAL** | `dashboard.service.ts:887` only | deals widget only; nothing applies it to **leads**, which is what Targets Config claims |
| `thresholds.qualification_score` | num | 80 | **WIRED** | `lead-qualification.service.ts:43`, `dashboard.service.ts:378` | works |
| `targets.outcome_compliance_pct` | num | 95 | **WIRED (reporting only)** | `activity-discipline.service.ts:538`, `compliance-report.service.ts:106` | colours a bar; blocks nothing |
| `targets.next_step_compliance_pct` | num | 80 | **WIRED (reporting only)** | `activity-discipline.service.ts:541`, `compliance-report.service.ts:107` | same |
| `policy.allow_self_reassign` | bool | false | **PARTIAL** | `leads.service.ts:1077` | guards one route; any other path mutating `assigned_to` is ungated |
| `policy.auto_assign_enabled` | bool | false | **PARTIAL** | `lead-auto-router.service.ts:121` | gates the **cron only** — §6.6 |
| `policy.auto_assign_include_managers` | bool | false | **WIRED** | `lead-auto-router.service.ts:155` | works |
| `policy.manager_lead_cap` | num | 50 | **WIRED** | `lead-auto-router.service.ts:158` | works |
| `policy.tactical_disqualify_requires_approval` | bool | true | **DEAD** | *no reads found* | no behaviour; hardcoded `checked disabled` yet still POSTed on every save |
| `policy.enforce_outcome_on_completion` | bool | false | **DEAD in effect** | `activities.service.ts:1288` only | §6.3 |
| `policy.enforce_next_step_on_completion` | bool | false | **DEAD** | *no reads found* | §6.2 |
| `policy.require_activity_due_date` | bool | true | **WIRED** | `activities.service.ts:387` | works; the past-date rejection at `:377-383` runs *before* the switch, so turning it off still won't allow back-dated open activities (undocumented) |
| `policy.sla_prebreach_nudge_hours` | num | 4 | **WIRED** | `sla-scheduler.service.ts:484` | works; `<= 0` no-ops |
| `policy.enforce_commercial_intent_for_deal` | bool | false | **WIRED** | `deals.service.ts:139` | works; role bypass evaluated before the read |
| `policy.demo_followup_sla_hours` | num | 48 | **WIRED** | `sla-scheduler.service.ts:61` | works; `<= 0` disables |

### 6.2 The worst one: `enforce_next_step_on_completion` is dead and the behaviour is permanently ON
Turn "Reps must book a next step" **off** and nothing changes. `assertNextStepCompliance`
(`activities.service.ts:134-167`) reads no setting; `updateStatus` calls it unconditionally
(`:1409-1413`). Every rep completing any call/email/meeting/WhatsApp/task on an active lead or deal is
blocked — **including admins and sales managers**, whom both the on-screen label
(`compliance-controls-content.tsx:1102-1106`) and the seeded description
(`compliance-settings.service.ts:175`) promise will "always bypass". Line 147 literally discards the
role list: `void userRoles;`.

And the rule an admin cannot switch off is trivially side-stepped — bulk completion skips the gate
entirely (§4.13).

### 6.3 `enforce_outcome_on_completion` is dead in effect
Turn it **on** expecting bulk completions to demand an outcome — bulk already demanded one
unconditionally (`:1675-1680`). Turn it **off** expecting reps to close without one — the
single-status path still rejects them (`:1385-1389`). The only path it controls is
`PUT /activities/:id` (`:1287-1293`), which is not what the UI uses. The key's own description,
claiming it "upgrades enforcement to bulk completions", is false.

### 6.4 Saving `currency` produces a non-public row, so the screen and the customer's PDF disagree
Set currency to `ZAR`; the card says "Currency above is live" (`settings-page.tsx:337-339`). The bulk
save sends only `{key, value, data_type}` (`:213`) — **no `is_public`** — and nothing seeds a
`currency` row, so `upsertSetting` takes the create branch and writes `is_public: dto.is_public || false`
(`settings.service.ts:129`). `GET /settings/public` filters `is_public: true` (`:70-81`), so
`useCurrency` never sees it and returns the hardcoded `USD` fallback (`use-currency.ts:3`) across **23
client files**. Server-generated PDFs and invoice emails *do* use ZAR
(`document-generator.service.ts:362`, `invoices.service.ts:540`).

**The screen says $ and the invoice the school receives says R.** There is no UI anywhere to set
`is_public`. **[LIVE]** This is the likely explanation for the dashboard's "Top Performing Products ·
R27,300" tile while every other tile shows `$`.

### 6.5 Numbers are accepted that break the product, because nothing validates them
`POST /settings/bulk` takes `@Body('settings') settings: SetSettingDto[]` where `SetSettingDto` is a
**TypeScript interface, not a class** (`settings.service.ts:10-17`) — so the global ValidationPipe has
no metatype and performs **zero validation**: no type check, no range check, no key whitelist.
`getNumber` only rejects negatives and non-finite values (`compliance-settings.service.ts:276`).

- `expected_win_rate = 25` (the obvious reading of "25%"): only the UI divides by 100
  (`compliance-controls-content.tsx:417`). `requiredPipeline = 100000 / 25 = $4,000` instead of
  `$400,000` (`dashboard.service.ts:365-366`) — Pipeline Coverage reports ~100× healthy on two
  dashboards, and the tab renders it as "2500%".
- `expected_win_rate = 0` → required pipeline forced to 0 → Pipeline Coverage reads 0% forever.
- `stale_lead_days = 0` → `INTERVAL '0 days'` (`activity-discipline.service.ts:730`) → **every**
  non-terminal lead lands on the At-Risk list at once.
- `daily_contacts_per_rep = 0` → `toPositiveFiniteNumber` rejects 0, the fallbacks miss, and the
  function returns the raw value anyway (`dashboard.service.ts:210`) → the KPI emits `denom: 0,
  target: 0` and the client divides by zero.

None are recoverable by reading the UI, which shows the value you typed and looks right.

### 6.6 `auto_assign_enabled` gates the cron but not the button
Switch auto-assign **off** to stop distribution during a clean-up: the 15-minute cron stops
(`lead-auto-router.service.ts:118-125`), but any admin or sales_manager pressing **"Run auto-assign"**
still generates a full batch — `runDistribution` (`:149`) never reads the switch, and
`automation.controller.ts:45-63` has no gate of its own. The service doc-comment at `:112-117` asserts
otherwise.

### 6.7 No audit trail, and concurrent editors silently overwrite each other
`settings.module.ts` imports no logging service, `settings.service.ts` writes nothing to
`activity_logs`/`audit_logs`, there is no interceptor, and there is no `updated_by` column. When the
stale-lead threshold changes from 14 to 3 and every board turns red, there is no record of who, when,
or what it was.

Worse: the Compliance tab **POSTs all 21 keys on every save**
(`compliance-controls-content.tsx:373-557`). Two admins with the tab open overwrite each other's
unrelated changes — last-write-wins across the whole form, no ETag, no dirty-field filtering.

### 6.8 Deleting a setting key orphans it permanently
`DELETE /settings/:key` sets `is_active = false` (`settings.service.ts:172`). Every reader filters
`is_active: true`, so the key vanishes and code falls back to its hardcoded default. The boot seeder's
existence check uses the same filtered read (`compliance-settings.service.ts:240`), but `upsertSetting`
finds the row by key **without** the filter (`settings.service.ts:109`) and never restores
`is_active`. After one accidental delete that key is invisible forever, and **saving it from the UI
writes to a row nobody reads** — a save that reports success and does nothing. Recovery needs
`POST /settings/:key/restore`, which no UI exposes.

### 6.9 General & Targets tabs are mostly decorative
| key | status | note |
|---|---|---|
| `company_name`, `company_website`, `company_email`, `company_phone` | **DEAD** | saved, never rendered; UI labels the card "🚧 WIP" |
| `timezone` | **DEAD** | no reads (and see §12.2) |
| `defaults.daily_leads_target` | **PARTIAL (unreachable)** | `dashboard.service.ts:202` fires only if the compliance value fails `> 0` — never in practice |
| `defaults.monthly_revenue_target`, `defaults.expected_win_rate`, `defaults.high_value_threshold` | **DEAD** | zero server readers |

**Reverse gap:** `default_fiscal_year` is read by `payments.service.ts:844,853` and drives
payment/collections reporting — with **no editor anywhere**.

**Phantom API:** `settings/README.md` documents `PUT /settings`, `POST /settings/logo`,
`DELETE /settings/logo`, `POST /settings/reset` and `site_name`/`social_media`/`business_hours`
columns. **None exist.** `dto/update-settings.dto.ts` is the orphan DTO, imported by nothing. There is
no branding/logo upload feature in the product.

**Notifications tab** is not `app_settings` — it writes per-user `notification_preferences`. Email and
WhatsApp switches are correctly `disabled`; the **Min Severity dropdown writes only the `in-app`
channel** (`settings-page.tsx:420-421`) despite sitting at row level.

### 6.10 [LIVE] Who can open Settings disagrees with who can write them
Live: Prince Banda (`admin_support` + `sales_manager`) is shown a **Settings** link in the sidebar that
leads to **"Access Denied — Settings are managed by an administrator."**

The current repo would allow him — `settings-page.tsx:98` gates on `hasAnyRole(["admin","admin_support"])`
— so this specific denial is deployment skew (§12.1). The nav/gate inconsistency is real either way.

Underneath, three layers still disagree:
- **Server:** every settings route is `@Roles('admin')` (`settings.controller.ts:35,51,88,…`), with
  `admin_support → admin` aliased in the guard.
- **Inside the Compliance tab**, `FeatureGuard` uses `hasAnyRole`, which is **literal string matching
  with no alias** (`use-rbac-store.ts:115-120`). So `admin_support` — the full-triage role — **cannot
  see** the Auto-assign switch (`allowedRoles={["admin"]}`, line 1135) or Include-managers / Manager
  cap (line 1165), even though the server accepts their writes.
- `sales_manager`, named in that second guard, **can never reach the tab at all** — dead code.

---

## 7. Delivery paths and integrations

The deployed environments have **no SMTP and no BLOB token** (`CREDENTIALS.local.md`). Findings are
split by whether that is the cause.

### 7.1 [CODE] Invoice and quote PDFs are generated with no line items and no totals — regardless of config
`document-generator.service.ts:262` uses
`items.forEach(async (item, i) => { ... await this.formatCurrency(...) ... })` — an async callback
never awaited, and `formatCurrency` (`:358-368`) awaits a DB settings read. `drawTotals` is `async`
(`:294`) but called **without `await`** at `:77` (invoice) and `:151` (quote), while `doc.end()` runs
synchronously at `:100`/`:177`.

The emitted PDF contains the header, the client block, the table header row and the literal label
"Subtotal:" — **no item rows, no prices, no totals.** The post-`end()` writes then reject inside
un-awaited promises; under Node's default `--unhandled-rejections=throw` that **terminates the API
process**.

> I did **not** trigger this on staging — deliberately, because it may kill the API container. Verify
> it locally, not on a shared environment.

### 7.2 [CODE] "Send" on an invoice or quote reports success while producing and delivering nothing
`invoices.service.ts:488-501` sets `status = 'Sent'`, logs, then calls `generateAndSendInvoice`, where
`put()` from `@vercel/blob` (`:524`) throws immediately without `BLOB_READ_WRITE_TOKEN` — and the whole
body is wrapped in `try { } catch { this.logger.error(...) }` (`:580+`). Same shape in
`quotes.service.ts:657/695/752-757`.

The API returns 200, the row shows **Sent**, no PDF is stored, no `ManagedFile` row exists, no email
leaves, and the client is never told. *(Broken now because BLOB is unset — once BLOB is set, the email
step no-ops for the same reason.)*

### 7.3 [CODE] Logging a completed email activity is impossible right now
`activities.service.ts:2173-2189` takes the `userEmailSender` branch **unconditionally**, and
`resolveSender` throws `ForbiddenException('No active email account configured…')`
(`user-email-accounts.service.ts:247`). Nothing catches it — the `try/catch` at `:2210` covers only the
other branch — and the call sits **inside** the `dataSource.transaction` at `:627`.

The whole activity is rolled back and the rep sees "Could not create activity". Since no rep has a
personal SMTP account configured, a rep **cannot even log an email they already sent by hand from
Outlook**. The same rollback destroys the CRM record of the touch whenever a configured SMTP host is
unreachable.

### 7.4 [CODE] Password reset is a dead end that reports success
`notifications.service.ts:77-83` **returns** `{success:false}` rather than throwing when no provider is
registered (`notifications.module.ts:88` builds an SMTP provider only when `SMTP_HOST` is set).
`auth.service.ts:405-423` wraps the call in a `try/catch` that only `console.error`s — and the catch
never fires, because nothing throws.

"Forgot password" returns 200 / "check your email", no mail is sent, nothing is logged at error level,
and the token expires in an hour. **A locked-out user has no self-service recovery on staging or
production.**

**This same swallow-by-return-value is the recurring root cause across §7.3, §7.4 and §7.6.**

### 7.5 [CODE] The email-sequence queue is a one-strike dead letter
`email-sequence.service.ts:157-163` — any failure, including "no provider", sets `status: 'failed'`
permanently. `email-queue.entity.ts:14-19` has **no attempt counter, no retry time, no dead-letter
handling**. The first tick after SMTP goes missing burns every due nurture step to `failed`, 50 per
tick, and **none are retried when SMTP is finally configured**. No notification, no badge.

### 7.6 [CODE] SLA escalations are stamped "escalated" even when no manager was reached
`sla-scheduler.service.ts:277-310` — the per-manager `try/catch` correctly stops one failure aborting
the loop, but `last_escalated_at = now` is then set **unconditionally**. The lead is marked escalated,
no email arrives, and the escalation window suppresses re-escalation.

### 7.7 [CODE] The calendar integration is unimplemented, and hides it
- `google-calendar.adapter.ts:59,70,80,88,96` and the Microsoft equivalent all
  `throw new NotImplementedException`. `getAuthorizeUrl:38-39` substitutes `client_id: 'unset'`.
  "Connect calendar" cannot succeed; `calendar-sync.service.ts:188-217` swallows the exception as a
  `warn`, so meetings created in the CRM silently never reach anyone's calendar.
- `calendar-sync.service.ts:292-295` sets `cancelled_externally = true` in a **`finally`**, so a failed
  cancellation is recorded as cancelled. The customer's calendar entry survives, the CRM says
  withdrawn, and no retry is possible because the link is filtered out of later queries.
- `calendar-sync.service.ts:318-327` — the 30-minute reconciler counts `delta.events` and **throws them
  away**, then saves a fresh `last_sync_at`. The UI reports "last synced" while nothing syncs.

### 7.8 [CODE] Public bookings send the prospect nothing
`scheduling.controller.ts:135` → `scheduling.service.ts:611-630`. There is no notifications service in
the scheduling module at all — no confirmation email, no ICS, no reminder. An external prospect books,
sees an on-page confirmation, receives nothing, and the rep's slot is consumed. The `@Public` hold
endpoint (`:114`) is anonymous and relies solely on the global throttler to stop a script parking holds
across a rep's whole horizon.

### 7.9 [CODE] A failed WhatsApp send still advances the lead's engagement clock
`whatsapp-send.service.ts:93-96` updates `last_contacted_at` and `last_action_at` **outside** the
`apiResult.success` check, while the activity is stamped CANCELLED and the message FAILED. With
`WHATSAPP_API_URL/KEY/PHONE_ID` unset every send fails — yet the lead's recency, temperature and SLA
clock all reset, dropping it off idle-lead and follow-up worklists on the strength of a message that
was never sent. **This corrupts data and outlives the missing config.**

### 7.10 [CODE] File upload has no authorization, and `file_url` is unvalidated
- `file-manager.controller.ts:58-71` — `onBeforeGenerateToken` contains only the commented-out
  placeholder `// Add your authentication/validation here`, returns an empty payload, sets no
  `maximumSizeInBytes`, and does not constrain `pathname`. The client sends the raw filename as the blob
  path. Since quotes and invoices write to the deterministic paths `quotes/<quote_number>.pdf` and
  `invoices/<invoice_number>.pdf`, a rep can **overwrite a customer-facing invoice PDF at a guessable
  path**.
- `create-file.dto.ts:26-30` — `file_url` is `@IsString @MaxLength(500)` with no `@IsUrl` and no host
  allow-list; `entity_id` is not even `@IsUUID`, and `file-manager.service.ts:73-95` never checks the
  parent record exists or that the caller may write to it. A rep can attach a link to any external URL
  onto any record id they can guess — a clean internal phishing primitive.
- `file-manager.service.ts:236-248` deletes only the DB row; the controller's own `// TODO` at
  `:162-163` confirms the blob is never deleted, so every "deleted" document stays publicly retrievable
  forever.

### 7.11 [CODE] Two smaller delivery issues
- **WhatsApp ingest silently drops rows under a `success: true` response** —
  `whatsapp-ingest.service.ts:108-113` counts a failed message in none of `created/skipped/missingLead`,
  and `automation.controller.ts:242-243` returns success regardless. The endpoint is properly
  authenticated and field-validated, but `ingest-whatsapp.dto.ts:44-47` has **no `@ArrayMaxSize`** and
  each message opens its own transaction in a serial loop.
- **Notification dedupe starves new recipients** — `user-notifications.service.ts:102-107` returns the
  existing notification on a dedupe-key hit **before** creating `UserNotification` rows, so a second
  call with the same key but a different user list delivers to nobody.

*Verified sound: the socket gateway is properly authenticated with no fallback secret and per-user
rooms; notification failures are correctly isolated and never roll back the business transaction they
sit in.*

---

## 8. RBAC

### 8.1 [CODE] A user holding two roles loses all owner scoping
`auth/strategies/jwt.strategy.ts:83-89` collapses `user.roles[]` to a single string:
`admin|admin_support → 'admin'`, else `sales_manager`, **else `roleNames[0]`**. Roughly 40 endpoints
derive their scope from exactly `role === 'sales_rep'` (across deals, leads, invoices, quotes,
payments, activities controllers).

A user seeded `['manager','sales_rep']` resolves to `role='manager'` → `scopeUserId = undefined` on
every one of those routes → they read and mutate **every** deal, lead, invoice, quote and activity in
the org. Similarly `['sales_rep','sales_manager']` resolves to `sales_manager` and posts payments
directly instead of entering the approval queue (`payments.service.ts:61-67`).

**[LIVE] Two of the 11 users on staging hold multiple roles** — `prince@me.com`
[`sales_manager`, `admin_support`] and `nkululeko@clearhue.co.zw` [`manager`, `admin`]. **Both
currently resolve safely**, because each contains an admin-family role and the collapse maps
`admin|admin_support → 'admin'` before reaching the `roleNames[0]` fallback. So the defect is armed
but not currently firing.

The dangerous combination is any multi-role user **without** an admin-family role — e.g.
`['manager','sales_rep']` or `['finance','sales_rep']`. Nothing prevents an admin from creating one
from the Users screen, and the moment they do, that user silently reads and mutates every record in
the org. Fix it before someone assigns a second role, not after.

The same module is internally inconsistent: `activities.controller.ts:223,269,313` correctly use
`userRoles.includes('sales_rep')` while `:65,95,125,191` use the collapsed string.

### 8.2 [CODE] Contacts, activities and schools reads are ungated
- `contacts.controller.ts:51-56` (`GET /contacts`) and `:57-68` (`GET /contacts/:id`) carry **no
  `@Roles` and no `@CheckPermission`**; `roles.guard.ts:139-140` falls through to `return true`. Every
  authenticated principal reads the whole contact book. `PUT /contacts/:id` (`:71-77`) allows
  `sales_rep` and `contacts.service.ts:139-155` `Object.assign`s the DTO with **zero** ownership check
  — rep A can rewrite the phone/email of rep B's school head.
- `activities.controller.ts:82,111,176` (list, summary, detail) have no `@Roles` while every sibling
  write route does. A `finance` user gets every call note and completion note in the org.
- `schools.controller.ts:69,85,99,167` likewise — including `PATCH /:id/city`, where the only check
  distinguishes "already set" from "empty", so any principal can write the city of any city-less school
  and it is logged under their name.

*Correction to an earlier claim:* the activities **write** paths ARE correctly owner-scoped —
`create`, `update`, `updateStatus` and `bulkUpdateStatus` all thread and enforce `scopeUserId`. The
real gap is the read side and §8.1.

### 8.3 [CODE] The quote and invoice ownership guards fail open
`invoices/guards/can-access-invoice.guard.ts:39-43` and `quotes/guards/can-access-quote.guard.ts:38-43`
re-throw only `ForbiddenException` and otherwise `return true`. These guards are the **sole** ownership
enforcement for `PUT /invoices/:id`, `PATCH /invoices/:id/status`, the item routes and the quote
equivalents — the services on those paths take no `scopeUserId`. Any error inside `findOne` converts a
denial into a grant.

### 8.4 [CODE] The `manager` role is locked out of most of a manager's day
`manager` and `sales_manager` are both genuinely seeded; `RolesGuard` aliases only
`admin_support → admin`. `manager` is treated as an oversight role in bug triage, requisition approval,
payments, report reads and discipline scoping — but is excluded from the entire Approval Queue, all 10
auto-assign endpoints, the Compliance Report, and all three report exports (while the nav offers them
and the hook swallows the 403 as "Failed to export report"). It is also excluded from
`POST /sla/check-deal-breaches` and `GET /sla/deal-breaches` even though `pipeline-stages-page.tsx:73-78`
includes `manager` in `canRunSlaCheck` — so `dealBreaches` stays `undefined` and the **stage-SLA breach
banner never renders for a `manager`**.

Auto-assign never routes to them either: `ROUTABLE_ROLES = ['sales_rep']`
(`automation.constants.ts:28`) and the manager cohort matches `'sales_manager'` only — so
`auto_assign_include_managers` does nothing for a `manager`.

Also: `deals.controller.ts:164` is `@Roles('admin','sales_manager','sales_rep','viewer')` — `manager`
is missing and **`viewer` is a role that does not exist in the seed at all**.

### 8.5 [CODE] Seeded CASL conditions for `LeadActivity` are wrong and currently dead
`seed-roles-permissions.ts:149` conditions `create LeadActivity` on `{"leadId":"${id}"}` — comparing a
**lead id to a user id**, which can never be true. Lines 150-151 use `createdBy`. Nothing consumes them
today, but neither key appears in any `CONDITION_KEY_MAP`, and `ability-scope.service.ts:340-345`
passes unknown keys straight through as `alias.rawKey`. The first person to add
`@CheckPermission('read','LeadActivity')` gets `activity.createdBy` in SQL — the 500 class this
codebase has already been bitten by.

### 8.6 [CODE] `admin_support` cannot disqualify a lead
`leads.service.ts:1035-1043` checks only `admin` and `sales_manager`. Per this repo's own RBAC notes
`admin_support` has full triage authority, and the sibling check in `activities.service.ts` does list
it. The 403 message also misdescribes the caller's role.

---

## 9. Auth and session

Severity judged for a small internal CRM behind a login. Most need the attacker to already hold
credentials or a stolen token — stated per finding.

### 9.0 Two standing claims corrected
**The refresh/logout lookup is NOT broken.** `CODEBASE-FINDINGS.local.md` records that `hashToken()`
uses argon2 (salted, non-deterministic) while refresh and logout look sessions up by equality, so the
lookup "can't match". That is **out of date**. `auth.service.ts:699-712` now uses keyed SHA-256, which
is deterministic, so the equality lookups at `:275-285` and `:330-334` match every time. The comment at
`:700-706` describes the argon2 problem in the past tense. This matches what I saw live — a dozen
successful `GET /auth/refresh` calls on the same cookie over several hours. **That line in
`CODEBASE-FINDINGS.local.md` should be struck.**

**The Swagger docs are wrong about token lifetimes.** `auth.controller.ts:195` claims "15 minutes / 30
days". The real values are 7 days and 15 days.

### 9.1 Access tokens live 7 days — HIGH (needs a stolen token)
`.env` sets `JWT_EXPIRATION=7`, interpreted as **days** (`auth.service.ts:310-313`, `:539-542`), and
`expires_in` = `days * 24 * 60 * 60` = 604800 (`:318`, `:547`). The `expires_in: 604800` I saw live
describes the **access** token; the refresh session is separately 15 days. Any leaked bearer token is
good for a week.

**Materially mitigated:** `jwt.strategy.ts:40-46` re-reads the session row and `:58-60` re-reads
`user.is_active` on **every request**, so logout, logout-all or disabling the user kills a token within
one request. The residual risk is theft nobody notices.

### 9.2 Refresh tokens are never rotated — HIGH (needs a stolen refresh cookie)
`refreshToken()` returns the caller's own token back verbatim (`auth.service.ts:317`) and never
regenerates `refresh_token_hash`. A stolen refresh cookie stays redeemable for the full 15-day session,
in parallel with the legitimate user, and **reuse can never be detected**. The cookie is `httpOnly` and
path-scoped, so this needs XSS-with-a-refresh-call, a stolen cookie jar, or §9.8.

*Note:* `logout()` (`:329-342`) revokes correctly but **no HTTP path calls it** — the controller uses
`logoutBySessionId()` (`auth.controller.ts:253-257`), which also works. Logout genuinely revokes;
`logout()` is dead code worth deleting.

### 9.3 The forced password change is client-side only — HIGH (policy bypass)
The server computes `requires_password_change` and the 90-day expiry at login
(`auth.service.ts:252-254`, `:264-266`) and then issues a **fully privileged 7-day access token
anyway**. The only consumer is a React redirect (`use-auth.ts:81-84`). No guard, interceptor or
middleware re-checks either flag on protected routes. Anyone calling the API directly with the token
from that same login response has full normal access indefinitely. **The 90-day rotation policy is
cosmetic**, as is the seeded admin's first-login change (`seeds/seed-admin-user.ts:77`).

### 9.4 Provisioned staff passwords come from `Math.random()` — MEDIUM-HIGH (the only pre-auth finding)
`users.service.ts:142-150` — `generateTemporaryPassword()` builds a 12-character password with
`Math.floor(Math.random() * chars.length)`, used at `:112` for every admin-created account without an
explicit password. V8's `Math.random` is a seeded xorshift128+ PRNG, not a CSPRNG. Combined with §9.3
(the temp password is never actually forced to change server-side) and a guessable email, this is the
one finding that does **not** require pre-existing credentials. One-line fix: use
`randomInt`/`randomBytes`, as `two-factor.service.ts:278` already does.

### 9.5 Every rate limit is keyed on attacker-controlled headers — MEDIUM (pre-auth)
`common/guards/throttler-behind-proxy.guard.ts:21-28` keys the throttler on `cf-connecting-ip` → first
`x-forwarded-for` → `req.ip`, reading the headers raw because `trust proxy` is deliberately off. Anyone
who can reach the origin directly rotates the value per request and defeats **every** throttle: login
10/min, reset-request 5/min, reset-submit 10/min, global 300/min. The per-user lockout still caps
password guessing, so practical damage is reset-email spam, request flooding and unlimited 2FA guessing.
**Worth confirming the Contabo origin is only reachable via Cloudflare** — the DNS records are currently
DNS-only (grey), not proxied.

### 9.6 Wrong 2FA codes do not count toward lockout — MEDIUM (needs a valid password)
Lockout is per-user, gated at `auth.service.ts:196-206` and incremented in `handleFailedLogin()`
(`:558-575`) — called **only** on a bad password (`:214-217`). The 2FA failure path (`:229-239`) throws
without touching the counter. TOTP is 6 digits with `window: 1` (3 codes valid at once), so ~3-in-10⁶
per attempt — not practically brute-forceable, but the control is missing. Backup codes are
`randomBytes(4)` = **32 bits** (`two-factor.service.ts:77`, `:244`), argon2-hashed, but verified in an
unmetered loop (`:184-201`).

### 9.7 TOTP secrets are stored in plaintext — MEDIUM (needs DB read access)
`two-factor.service.ts:83` writes `totp.secret.base32` straight to the column, and
`entities/account-security.entity.ts:39-40` labels it `// Encrypted TOTP secret` — **the comment is
false**. Any DB dump or backup yields working second factors for every 2FA user, permanently. The
project already has an AES-256-GCM helper (`user-email/services/credentials-cipher.service.ts`).

### 9.8 `localhost:5173` is CORS-allowed with credentials in production — MEDIUM
`main.ts:56-64` unconditionally appends `http://localhost:5173` and `http://127.0.0.1:5173` to the
allowlist regardless of `NODE_ENV`, with `credentials: true`. Since the refresh cookie is
`SameSite=None; Secure` in production (`auth.controller.ts:45-46`), a page served from the victim's own
`localhost:5173` — an attacker-controlled dev server, a local app, a malicious npm dev dependency — can
issue a credentialed `GET /api/v2/auth/refresh` and **read a fresh access token out of the response
body**. Gate those two origins behind `!isProduction`.

### 9.9 Config hygiene — LOW-MEDIUM
- **The email-credential cipher key silently derives from the JWT secret.**
  `credentials-cipher.service.ts:26-35`: if `USER_EMAIL_CREDENTIALS_KEY` is unset it logs a warning and
  derives the AES key from `JWT_SECRET_TOKEN` (or the literal `'crm-dev-key'`). A `logger.warn` will
  not stop a production deploy, and it collapses two trust domains. It should throw in production, as
  `JWT_SECRET_TOKEN` does.
- `JWT_SECRET_TOKEN` is correctly mandatory (hard throw at `auth.module.ts:29-35` and
  `jwt.strategy.ts:24-29`), which makes the `'dev-fallback-pepper'` literal at `auth.service.ts:710`
  **unreachable**. Remove it before it becomes real.
- **A single static API key grants permanent, unrevocable admin.** `api-key.guard.ts:50-66`
  synthesises `{action:'manage', subject:'all'}` with `sessionId: 'api-key-session'`, and
  `jwt-auth.guard.ts:26-30` short-circuits JWT validation. That identity has no session row, so it is
  immune to lockout, 2FA, logout-all and the `is_active` check — the only kill switch is unsetting the
  env var and redeploying. The comparison is correctly constant-time. Treat `CRM_API_KEY` as a
  permanent root credential.

### 9.10 Password reset leaves the old expiry in place — LOW
`resetPassword()` (`auth.service.ts:444-449`) updates the hash and `password_changed_at` but never
clears `requires_password_change` nor re-stamps `password_expires_at` — unlike `changePassword()`
(`:492-495`). A user who resets an expired password still has an expired one, which then lets
`changePassword` be called with **no current password** (`:470-483`). `resetPassword` also never checks
`user.is_active`.

---

## 10. Performance

Measured on staging (2,089 leads / 1,822 active / 744 breached / 5,546 notifications):

| Endpoint | Time |
|---|---|
| `GET /auth/refresh` | **7.1 s** |
| `GET /settings/public` | 6.5 s |
| `GET /schools` | 3.1 s |
| `GET /dashboard/kpis` | 2.6 s |
| `GET /activities` | 2.4 s |
| One dashboard load | **24 API calls**, each with a CORS preflight |

### 10.1 The `leads` table has effectively no indexes — biggest single win
`lead.entity.ts:24-25` declares one index (`lead_name`); migrations confirm only that plus
`IDX_leads_product_id`. Every hot filter — `deleted_at`, `assigned_to`, `status`, `sla_breached`,
`current_sla_due_date`, `school_id`, `last_action_at` — is a sequential scan of all 2,089 rows, on every
SLA cron tick (15/30/60/120 min), the auto-router, and every dashboard load. `activities` is otherwise
well indexed but has **no index on `completed_at`**, the filter in every discipline query.

Adding `(deleted_at, status)`, `(assigned_to)`, `(sla_breached, deleted_at)`, `(current_sla_due_date)`
and `activities(status, completed_at)` is one migration, no code change, and it lifts §10.3, §10.5 and
§10.6 at once.

### 10.2 Every authenticated request pays 2 SELECTs + 1 WRITE
`jwt.strategy.ts:50-77`, with `JwtAuthGuard` global (`app.module.ts:128-131`): a session lookup, a user
lookup hydrating the **entire** `roles → rolePermissions → permission` graph, and an
`UPDATE auth_sessions SET last_activity_at`. One dashboard load = **72 extra queries and 24 concurrent
writes to the same session row**, against a pool of 10. The writes serialise on one row lock. This is
the flat tax behind the 7.1 s `/auth/refresh` and 6.5 s on a public endpoint that reads ten rows.

### 10.3 `/dashboard/sla-compliance` materialises 1,822 entities to render a percentage
`dashboard.service.ts:1136-1199`: `leftJoinAndSelect('l.school')` + `getMany()` with no `take`, then all
bucketing in JavaScript, then **all 717 breached leads returned in the payload** (79 KB) to a widget
that draws a compliance gauge. Three grouped counts replace the method.

### 10.4 Connection-pool starvation from nested `Promise.all` fan-out
`activity-discipline.service.ts:161-180` fires six computations concurrently; `computeRepRows`
(`:817-857`) takes up to 50 users and runs `repRow` for all in parallel, each issuing ~11 queries —
**up to 550 concurrent queries against a pool of 10**. `compliance-report.service.ts:132-139` is worse:
`take(200)` × 6 = up to 1,200. While one runs it holds every connection. With
`connectionTimeoutMillis: 10000` other requests start failing acquisition.

### 10.5 `GET /schools` sorts by a correlated double-EXISTS subquery — the 3.1 s
`schools.service.ts:211-240`. `IDLE_SQL` (an `EXISTS … AND NOT EXISTS …` over `leads` and `activities`)
is the **primary sort key** at `:225`, forcing Postgres to evaluate both correlated subqueries for every
school in the table. `paginate()` then runs `COUNT(*)` over the same builder, and `:236-240` evaluates
it a **third** time.

### 10.6 SLA crons: unbounded scans, N+1, serial SMTP in the loop, no overlap guard
`sla-scheduler.service.ts:189-330` (hourly escalation): unbounded `getMany()` per SLA config
(`:218-225`); a `findOne` on `lead_sla_history` **per lead** (`:230`) — ~744 queries per pass;
`getAdminAndManagerUsers()` re-queried **inside** the per-lead loop (`:280`); `sendEmailWithTemplate`
awaited **serially per manager per lead** (`:281-308`), each reading and compiling two templates off
disk then awaiting SMTP.

**No `@Cron` in the codebase has an overlap guard**, and three crons share `0 */30 * * * *`. The hourly
pass can exceed an hour, at which point instances overlap and race on `last_escalated_at`. The
30-minute demo-follow-up sweep (`:84-153`) has **no date bound at all** — it rescans every demo delivery
ever completed, with a `getCount()` per row.

### 10.7 Other performance items
- **Nightly temperature sweep ≈ 11,000 sequential queries.** `lead-temperature.service.ts:164-193`
  loops every non-terminal lead, 6 queries each: 1,822 × 6 at 02:00. The same path runs on every
  activity create (`activities.service.ts:773`).
- **`POST /duplicates/scan` is a synchronous full sweep on the request path.**
  `duplicate-detection.service.ts:670-780` loads every lead, school and contact, ~3 queries per record
  — **6,000+ queries in one awaited HTTP request**. `POST /duplicates/rebuild` runs the same shape as an
  unawaited `void` with no concurrency limit.
- **Whole tables pulled into Node to compute a SUM** — `dashboard.service.ts:284-288`, `:303-307` (deals
  **with school joined** only to `.reduce()`; note `:322` does it correctly with `SUM()`); `:593`; 
  `:1057-1080` (every won deal, then a `.find()` inside a `forEach` — O(n²)); `:1513`;
  `reports-read.service.ts:121` and `:143-156`.
- **Batch approve is ~2,200 sequential round-trips with no transaction.**
  `lead-auto-router.service.ts:460-475` loops ids serially, ~10 statements each. "Approve all" over the
  224 pending proposals is minutes inside one HTTP request, and a mid-way failure leaves it half-applied.
- **Client bundle: 2.83 MB in a single chunk.** `npm run build` → `dist/assets/index-*.js` **2,826 kB
  (765 kB gzip)** plus 187 kB CSS, 4,069 modules. `App.tsx:10-56` statically imports all 47 pages; no
  `React.lazy`/`import()` anywhere.
- **No CORS preflight cache.** `main.ts:61-64` never sets `Access-Control-Max-Age`, so Chrome
  re-preflights every ~5 s — 24 extra round-trips per dashboard load.
- **CSV export silently drops 1,089 of 2,089 leads** — `leads.controller.ts:260-263` hardcodes
  `limit: '1000'` and builds the whole CSV as one in-memory string.

---

## 11. Resource

### 11.1 `user_notifications` has zero indexes and no retention
`user-notification.entity.ts` declares no `@Index` at all; `userId` and `isRead` are both unindexed (the
`@ManyToOne` FK does not create an index in Postgres). So the unread-count poll is a full scan —
**5,546 rows for this user alone [LIVE]**, polled every 30 s by every open tab; `markAllAsRead` is an
unindexed `UPDATE` that locks and rewrites all 5,546 rows in one statement; and the list query sorts by
`notification.createdAt` on the joined table with no index on it.

A composite `(userId, isRead)` index plus a prune job is the fix. The backlog is itself a symptom of
§10.6 fanning out with no retention — `sla-scheduler.service.ts:682-684` uses an **hourly** dedupe key,
so every breached deal mints a fresh notification row per manager per hour, forever.

### 11.2 [LIVE] `GET /automation/assignment-proposals` is unpaginated — 447 KB today
`lead-auto-router.service.ts:283-301` chains four eager joins and ends in `.getMany()` with no
`take`/`skip`. Measured live: **224 rows → 447 KB** in one response, growing with every import batch. It
also serialises two full `User` entities per row into a manager's browser.

### 11.3 App-wide 5-second polls that fetch 500 rows to render an integer
`approval-nav-badge.tsx:37-50` is mounted in the sidebar on **every** route.
`useAssignmentProposals("pending")` sets `refetchInterval: 5000` (`api/assignment-proposals/index.ts:62`),
and `useAllLeadReversalRequests` pulls `limit: 500` fully-joined rows only to read `.length`. A second
ungated 5 s poll sits at `:126`. ~24 background requests/minute per open tab, each paying the §10.2 tax.

### 11.4 A write-scan endpoint modelled as a `useQuery`
`use-sla.ts:51-83` wraps `POST /sla/check-lead-breaches` — which performs ~5 writes per newly breached
lead — in a TanStack `useQuery`, invoked on mount of the leads page (`leads-management-page.tsx:363`).
`refetchOnReconnect` is never configured, so the default `true` applies and **every network blip
re-triggers a write scan**. The QueryClient is memory-only, so the 1-hour `staleTime` buys nothing
across reloads.

### 11.5 Long-held transactions on the request path
`activities.service.ts:1687-1775` — bulk completion holds one transaction open across N×3 sequential
round-trips, then at `:1775` fires `Promise.all` of `findOne` **per activity, each loading 19
relations** including to-many `attachments` and `comments`. A 100-item bulk completion holds 1 of 10
connections for ~300 sequential round-trips, then issues 100 concurrent multi-join queries.
`schools.service.ts:56-130` has the same shape on create.

---

## 12. Environment and deployment

### 12.0 [LIVE] ⚠️ MAJOR CORRECTION — staging and prod deploy from GitHub, not from this repo

**The local monorepo is not the deployed codebase.** `git cat-file` confirms **zero shared commits**
in either direction between local `port-dube-github` and `github.com/DigiLearnzw/crm-v2-{client,server}`.
GitHub `master` has 46 commits from `initial: existing codebase` (7 Apr 2026); none of the local
commits (`6f53578`, `5df724b`, `b546866`, `112c11a`) exist there, and none of GitHub's exist here.

Three markers confirm **staging runs the GitHub lineage**, not an old build of this repo:

| Marker | GitHub `master` | Staging behaviour |
|---|---|---|
| `active` filter in `QueryLeadDto` | absent | rejects it — `400 property active should not exist` ✓ |
| `open_deals` / `pending_collections` in deals summary | absent | returns only 5 fields ✓ |
| `activity-discipline.service.ts` | present | returns the window ✓ |

**What this means for §12.1 below:** the *observations* are correct, but the **diagnosis was wrong**.
It is not "an older build of the same repo"; it is a **different repository**. The local tree has
never been deployed anywhere.

**What it does NOT change:** 9 of the 10 highest-severity server findings in this report are
**present in the deployed GitHub lineage** — verified by grep against `master`: the discount
unit mismatch, `recalculatePaymentStatus` writing `'Sent'` unconditionally, the `RolesGuard` early
return, the PDF `forEach(async`, the `multiple_invoices` `amount_paid: 0` reset, `sendEmail`
returning `success:false`, `Math.random()` temp passwords, and `localhost:5173` in CORS. Only the
throttler-header finding (§9.5) differs. The two codebases are close in size (448 vs 481 server
source files).

**So the report still applies to what is running** — but treat every `file:line` citation as
approximate for the deployed lineage, and re-locate before fixing.

**One piece of good news:** the §2.1 ship-blocker **does not exist in GitHub `master`**. Its
`assignLead` (`src/leads/leads.controller.ts:426-437`) is clean and already uses `ParseUUIDPipe`.
That blocker is confined to the local branch, which is not deployed.

### 12.0a [LIVE] Deploy state as at 15 Aug 2026 — recorded for pre-prod verification

**Two most recent commits on each GitHub repo:**

| Repo | Commit | Date | Subject |
|---|---|---|---|
| client `main` | **`e2b066c`** | 15 Aug | A mistyped lead URL is a 400 and a clear message, not a 500 |
| client `main` | `d7cbe13` | 14 Aug | The CRM records the sale; the rep records the work |
| server `master` | **`4b75f2a`** | 15 Aug | A mistyped lead URL is a 400 and a clear message, not a 500 |
| server `master` | `262ef61` | 15 Aug | Fractional probability and position bounce at the door, not in Postgres |

**What is actually deployed** (bundle fingerprinting + live behaviour probes):

| Environment | Asset / probe | Position |
|---|---|---|
| **prod client** | `index-DMz1QdDn.js` | ~11 Aug. Has `ff14c11`'s nurture string; **lacks** `4577762`'s "Product interest" → roughly **4–5 commits behind `main`** |
| **staging client** | `index-Cuxfe7_o.js` | ~11–13 Aug. Has `4577762`; **lacks** `d7cbe13` and `e2b066c` → roughly **2–3 commits behind `main`** |
| **staging server** | `GET /leads/not-a-uuid` → **500** | **lacks `4b75f2a`** (which makes it a 400) → behind `master` |
| **prod server** | not determined | needs production credentials to probe an authenticated route; **not obtained, deliberately** |

**Neither of the two most recent commits is live anywhere.** Prod and staging are on different
client builds, so they are not in step with each other either.

Recorded so that after the staging deploy you can verify the promoted build carries `e2b066c` /
`4b75f2a` before any production sign-off. The cheapest post-deploy check is the one those commits
were written for: `GET /leads/not-a-uuid` must answer **400**, not 500.

### 12.1 [LIVE] The staging API is running an older build than the staging client
**Proof:** `GET /leads?active=true` returns `400 {"message":["property active should not exist"]}`,
though `active` is committed at `query-lead.dto.ts:27` and destructured at `leads.service.ts:624`.

Consequences seen live:

- **The "Active Leads" tab is broken** — renders "Failed to load leads. Please try again." and an empty
  table. It is one of the eight primary lead views.
- **The Lead Conversion widget reports all zeros** — `0.0% · 0 of 368 leads converted · Active 0 ·
  Disqualified 0 · Avg. Days to Convert 0 days`. Ground truth: 32 Converted, 235 Disqualified, 1,822
  active, 2,089 total. The uncommitted diff to `dashboard.service.ts:1256-1281` adds `converted`,
  `disqualified`, `active`, `conversionRate` and `avgDaysToConvert` under the comment *"Client-facing
  contract used by LeadConversionWidget"*; the deployed API does not send them.
- **The Pipeline board header is broken**: `OPEN DEALS: undefined`, `PENDING COLLECTIONS: $NaN`,
  `OVERDUE: undefined`, `AVG HEALTH: 32.25%` with subtitle `undefined/undefined`. The deployed
  `GET /deals/summary` returns only `pipeline_id, total_deals, pipeline_value,
  deals_with_overdue_invoices, avg_deal_health`; the client reads `open_deals` (line 338),
  `pending_collections` (344) and `health_scored_deals` (383). **The repo server does return all of
  them** (`deals.service.ts:508-515, 700-711`) — skew, not a repo defect.
- **Settings "Access Denied" for `admin_support`** (§6.10).

**So the next staging deploy fixes four visible bugs and introduces one critical (§2.1). Fix §2.1
first, then deploy.**

`CODEBASE-SKELETON.md` §12 already warns about exactly this ("verify the deployed build").

### 12.2 [LIVE] Every date window is computed in UTC, not Zimbabwe time
The dashboard header reads **"Month to Date · Aug 1 – Aug 16, 2026"**. Today is 15 Aug. Yesterday it
read "Aug 1 – Aug 15". It is always one day in the future. Confirmed from the API:

```json
"window": { "start": "2026-08-01T00:00:00.000Z",
            "end":   "2026-08-15T23:59:59.999Z", "range": "mtd" }
```

`start` landing exactly on `T00:00:00.000Z` proves the container's local time **is** UTC — there is no
`TZ` set anywhere in `crm-v2-server/captain-definition` and the base image is `oven/bun:1` (Debian,
UTC). `activity-discipline.service.ts:1068-1077` builds the window with `setHours(0,0,0,0)` /
`setHours(23,59,59,999)`, i.e. in container-local = UTC time.

1. **Cosmetic:** the client formats that UTC instant in CAT (UTC+2), so 23:59 UTC renders as 01:59 the
   next day.
2. **Real:** the business runs on CAT. "Today" on every dashboard is 02:00 today to 01:59 tomorrow,
   local. Work logged before 02:00 counts against the previous day, and month/quarter/year boundaries
   are shifted two hours. Daily-target and SLA figures are measured against the wrong day at the edges.

Fix in one place: derive the window in a fixed `Africa/Harare` zone, or set `TZ` on the container
deliberately.

### 12.3 [LIVE] There is no 404 route — any unmatched URL is a blank white page
Confirmed twice. `App.tsx` has no `path="*"` and no `NotFound` element. An unmatched path renders
**nothing** — no app shell, no sidebar, no message, no way back except browser Back. Console shows only
`No routes matched location "…"`. Any stale bookmark, old notification link or mistyped URL lands the
user on a blank screen with no indication the app is running.

### 12.4 [LIVE] Four different lead totals on one dashboard

| Where | Total | Source |
|---|---|---|
| Leads by Stage donut | **2,089** | stage counts sum to 2,089 |
| Leads page, All Leads tab | **2,089** | `GET /leads` → `meta.totalItems` |
| LEAD QUALIFICATION KPI tile | **4,630** | `dashboard/kpis` |
| Qualification Status widget | **5,366** | `dashboard/qualification-overview` |
| Lead Conversion widget | **368** | `dashboard/lead-conversion` |

**2,089 is the truth.** Two of the others are impossible — they exceed the number of lead rows that
exist. In the deployed code both qualification figures are counted from `lead_qualification_criteria`,
not from `leads`: `COUNT(DISTINCT q.lead_id)` → 4,630 and `COUNT(*)` → 5,366. Since only 2,089 leads
exist, roughly **2,500 qualification rows point at leads that are soft-deleted or gone**. They survive
because the query does `leftJoin('q.lead','lead').where('lead.deleted_at IS NULL')` — on a *left* join
an unmatched row has `lead.deleted_at = NULL`, so the predicate is true and the orphan is counted.

User-visible damage: the tile reads **"52 / 4630 · 1% qualified"** when the truth is 52 / 2,089 =
**2.5%**. Two average scores are shown for the same metric on the same page (1.0% on the tile, 1.9% in
Qualification Insights).

The uncommitted working tree already rewrites both queries to drive from `leads`, which fixes this.
**It is not deployed and not committed.**

### 12.5 [LIVE] Two different SLA breach counts on the same page
Banner and SLA Compliance widget: **717 breached** (of 1,822 active). Intervention block "Leads SLA
Breached" and the Leads page banner: **744**. 744 is `COUNT(leads WHERE sla_breached = true)`; 717 is
recomputed from SLA dates over active leads only.

Part of the gap is stale flags on closed leads: **6 Converted** and **24 Disqualified** leads still
carry `sla_breached = true`, so the Leads page raises SLA alerts on closed business.

Also: SLA Compliance shows `On Track 1105 · At Risk 0 · Breached 717`, and 1105 + 717 = 1822 = the
total — **the at-risk bucket is provably unreachable** with the current bucketing
(`dashboard.service.ts:1160-1190`).

### 12.6 [LIVE] Two cosmetic but visible issues
- **Currency symbol is wrong on Top Performing Products** — every money figure on the dashboard is `$`
  except that widget, which renders **"7 units sold • R27,300"**. See §6.4 for the likely cause.
- **Float artifacts in money** — `Actual Pipeline $150,000.2`, `Need $249,999.8 more`, deal value
  `$72,000.2`, and `-$1 lost` under Demo Booked.

---

## 13. Verified clean — don't spend time here

Honest positives, verified live unless noted:

- **Both TypeScript builds pass** and the client production build succeeds.
- **Invoice arithmetic is correct.** Across all 38 invoices, `subtotal + tax − discount == total` holds
  exactly — **0 mismatches**. No overpayments, and no invoice whose status contradicts its paid/total
  relationship.
- **Instalment splitting is correct.** All 13 schedules sum **exactly** to their invoice total — every
  delta 0.00, including $22,764.25 → 7,588.08 / 7,588.08 / 7,588.09 and $22,765 → 7,588.33 / 7,588.33 /
  7,588.34. Remainder handling is sound.
- **Cash Collected reconciles** — the sum of all 32 payments is $202,600, matching the dashboard YTD to
  the cent.
- **Collections is internally consistent** — its five aging buckets sum exactly to its own total, and
  day-count bucketing is correct at the boundaries.
- All money columns come back as **strings** (TypeORM decimals); I checked for string-concatenation
  leakage in the aggregates and found none.
- **Password reset is the best-built part of the codebase** — 256-bit token, SHA-256-hashed, 1-hour
  expiry, single-use, non-enumerating, and it revokes every session on success.
- **Session revocation is immediate — on the HTTP path only.** The per-request session and `is_active`
  re-read is what keeps §9.1 and §9.2 from being critical for REST calls. ⚠️ **Corrected by the
  verification round (§0.2):** it does **not** hold for the WebSocket channel — `notifications.gateway.ts:66`
  never re-validates an open connection, so a logged-out or disabled user keeps receiving realtime
  notifications until they disconnect.
- **No secret, token, password or 2FA code is written to logs** anywhere in the auth path.
- **The socket gateway authenticates on connect** with no fallback secret and per-user rooms; the hook
  tears down correctly; no listener or timer leak was found in the client. ⚠️ It authenticates
  **once, at connect** — see the revocation caveat above.
- **Notification failures are correctly isolated** and never roll back the business transaction.
- Leads and activities are genuinely server-paginated; there is no unvirtualised 2,089-row render.
- QueryClient defaults are sane (`staleTime: 60_000`, `refetchOnWindowFocus: false`, `retry: 1`); the
  gap is `refetchOnReconnect` only (§11.4).
- `synchronize` is correctly `false` in production. `ComplianceSettingsService` caching is **bounded**
  (~20 keys, 30 s TTL) — ⚠️ but **not correct**: the verification round (§0.2) found its
  `invalidateCache()` hook has no caller anywhere, so a settings write is not propagated early as its
  own doc-comment claims. The 30 s TTL is the only propagation mechanism.
- **The activities write paths ARE correctly owner-scoped** (§8.2).
- Bug-tracker triage roles are the one place where the controller allowlist and the service constant
  genuinely match — the model the others should copy.

**So the arithmetic engine is in good shape.** The damage is in allocation, cross-screen definitions,
and lifecycle — not in the maths.

---

## 14. Ruled out — so nobody re-chases them

- **`leads.service.ts:1324` is not a syntax error.** It renders as `\ R1: …` through grep but the file
  genuinely contains `// R1: …`.
- **`PATCH /leads/:id/assign` is not currently broken on staging** — it returns a correct 404. See §2.1
  for why, and why it still matters.
- **The argon2 refresh/logout claim in `CODEBASE-FINDINGS.local.md` is out of date** — it is keyed
  SHA-256 now and works. Strike that line.
- **13 "summary invoices with 0 children" was my own artifact** — the list endpoint excludes children
  by design. The children exist; they are the 25 unmatched rows in §3.3.
- **My `/escalations` and `/settings` blank pages were my own wrong URLs** (the real routes are
  `/management/escalations` and `/admin/settings`, and both work). Reported only as evidence for §12.3.
- Lead/activity read scoping for reps, the disqualify-direct block (`leads.service.ts:2125`), `sort_by`
  whitelisting (not interpolation), and stakeholder/decision-role enum alignment all check out.
- `dashboard.service.ts:421` dropping the `/100*5` rescale is a **fix**, not a bug.
- Both new migrations (`1782…AddLeadProduct`, `1783…AddPaymentEntryApprovals`) are correctly guarded and
  cover every column their entities declare.

---

## 15. Priority

1. **§2.1** — one-line fix, before any deploy. Then redeploy staging (it also clears §12.1's four
   visible bugs) and re-verify.
2. **§3.1 / §3.2** — reconcile the instalment ledger. $90,400 of received cash is invisible to
   Collections and aging, and $2,100 is in no bucket at all. Find the allocation break (§3.6 is the
   prime suspect), fix it, then backfill. Until then Collections cannot be used to chase debtors.
3. **§2.2 + §2.4** — the approval workflow is advisory. Two lines in `roles.guard.ts` plus an
   `assertNotSubmitter` equivalent.
4. **§2.3 / §3.7 / §3.8** — stop reopen-approval and invoice deletion destroying payments, and stop a
   payment deletion resurrecting a cancelled invoice. There is a live pending request of this kind on
   staging.
5. **§7.1** — the PDF generator. Customers receive documents with no line items or totals, and it risks
   taking the API process down. Test locally, not on staging.
6. **One index migration** — `leads` (§10.1) and `user_notifications` (§11.1). No code change, biggest
   measurable win.
7. **§4.1 + §4.3** — the two user-trapping defects. Both block routine work today.
8. **§6.2 / §6.3 / §6.5** — wire the two dead policy switches or take them off the screen, and make
   `SetSettingDto` a class so values are validated.
9. **§3.5** — the discount unit mismatch, before anyone raises a discounted quote. Nothing is corrupted
   yet.
10. **§9.3 + §9.1 + §9.4 + §9.8** — enforce the password-change flag server-side, shorten the 7-day
    access token, swap `Math.random()` for `randomInt`, and gate the localhost CORS origins. §9.4 is the
    only pre-auth finding in the whole exercise and is one line.
11. **§12.2** — decide the timezone once, in one place, and write it down.
12. **§3.3 / §3.11 / §12.4 / §12.5** — pick one definition per metric so one number means one thing.
13. **§8.1** — replace the collapsed `role` string with `userRoles.includes('sales_rep')` at the ~40
    call sites, matching what `activities.controller.ts:223` already does.
14. **§5.4 / §5.5** — apply the R1 treatment to `DuplicateSuspicion` on lead delete, and give Rebuild
    the `pairKnown` check Scan already has.
15. **§7.3 / §7.4** — the email swallow. Make `sendEmail` throw, or make every caller check `.success`.

Also worth doing cheaply: strike the outdated argon2 claim from `CODEBASE-FINDINGS.local.md` (§9.0),
correct the token lifetimes in the Swagger description (`auth.controller.ts:195`), and delete the
phantom settings README (§6.9) — all three actively mislead whoever reads them next.
