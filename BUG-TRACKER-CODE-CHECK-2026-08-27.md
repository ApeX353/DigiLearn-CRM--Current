# Open bugs checked against the deployed code — 27 August 2026

**Tracker data:** the 25 August production dump, restored locally as `nash_ref`.
**Code:** `dube-aug2324`, which is what production runs (identical to
`apex/production` bar two README files).

The gap matters: the tracker snapshot predates the 26 August deploy, so several
bugs are marked open against code that has since shipped. That is the main
finding here.

Production carries **43 unresolved** bug reports — 25 `open`, 7 `in_progress`,
11 `backlog`.

---

## A. Fixed in the deployed code — verify on prod, then close (4)

### A1 · Approval bypass: reps could disqualify via the raw status endpoint
*high · 18 Aug · open*

The bug's own text says "FIX SHIPPED, PENDING DEPLOY: server commit 5142631".
That deploy happened on 26 August. The guard is in the running code —
`leads.controller.ts:612` returns 403 when a non-manager sends
`status=Disqualified` on `PATCH /leads/:id/status`, leaving every other
transition untouched.

**Verify:** as a sales rep, call the raw endpoint with `Disqualified`. Expect 403.
Then disqualify properly through the dialog and confirm a `lead_reversal_requests`
row appears — the bug's evidence was that **zero** tactical rows had ever been
written against 234 disqualified leads.

**Raise before closing:** the guard admits `admin` and `sales_manager` only.
**`admin_support` is not on the list**, so that role cannot disqualify through this
path either. If admin_support is meant to have full triage, this is a second bug
in the making rather than a fix.

### A2 · Disqualified leads: reasons recorded but shown nowhere
*medium · 18 Aug · open*

The bug notes an implementation "ready UNCOMMITTED in the working tree". It is now
committed and deployed: the summary endpoint exists, the breakdown strip renders on
`leads-management-page.tsx:615` (`{r.reason} ×{r.count}`), and the lead page shows
`Why: {lead.reason}` at `view-lead-page.tsx:649`.

**Verify:** open the Disqualified tab as a manager and confirm the aggregate
breakdown appears, and that a lead page shows its reason.

### A3 · [CSV2] CSV import never checks for duplicates already in the CRM
*critical · 23 Jul · in_progress*

Implemented in `leads-xlsx-import.service.ts`: step 2 is an explicit
"Dedup-check against existing schools/leads and within the batch"
(`flagDuplicates`), and anything flagged defaults to `skip` rather than `approve`.
The batch summary carries a `duplicate_count`.

**Verify:** import a sheet containing a lead already in the CRM, plus the same row
twice within the file. Both should arrive pre-marked skip, with the count shown.

### A4 · Deploy pipeline builds from the wrong ref — 9a04225 missing from staging and live
*high · 23 Aug · open*

**The content is now live.** `9a04225` ("Close-the-loop: cheaper honesty") touched
three client files; its distinctive `bulkIds` bulk-completion feature is present in
the deployed client — declared in `use-activity-completion-store.ts:44` and used
eight times in `activity-completion-dialog.tsx`.

Worth noting *how* this was checked: the commit hash is **not** an ancestor of the
deployed branch, so an ancestry check says "missing". It came across as ported
content on a different lineage. Patch content is the truth here, ancestry is not —
which is precisely the confusion that produced this bug report in the first place.

**Verify:** exercise bulk activity completion in the UI, then close.

---

## B. Partly done — restate the bug, do not close (5)

### B1 · [QUOTE4] Deal currency is ZAR but the business sells in USD; quotes carry no currency
*medium · 27 Jul · open*

Split verdict:

- **Deals — fixed going forward.** Production now holds **13 USD** deals against
  **29 ZAR**, so new deals are taking the configured currency. The 29 historical
  ZAR rows have not been relabelled.
- **Quotes — untouched.** The `quotes` table still has **no currency column at
  all**. That half of the bug has not been started.

**Restate as:** relabel 29 historical deals, and add a currency to quotes.

### B2 · [ACT5] 2,364 activities stuck open with no date
*high · 28 Jul · in_progress*

The headline figures are stale by roughly an order of magnitude. Measured on the
25 August dump, **before** the deploy that carried migrations 1781/1782:

| | Bug (28 Jul) | 25 Aug dump |
|---|---|---|
| Open undated activities | 2,364 | **272** |
| Leads affected | 898 of 1,497 | **198** |

**Re-measure on prod now** — the two backfill migrations landed on 26 August and
should have cut it further. Then either close it or restate it with real numbers.
Leaving a "2,364" headline on a 272-item problem distorts every planning
conversation it appears in.

### B3 · [DUP3] The same lead can be saved twice — no guard on the create form
*high · 24 Jul · in_progress*

Detection exists, blocking does not. There is a `DuplicateDetectionService`, but
`leads.service.ts:530` surfaces the near-duplicate **after the lead is committed**
("after the lead is committed, surface any near-duplicate"). The bug asked for a
guard on the create form.

**Restate as:** decide whether detection-after-save is enough, or whether create
should block the way deals now do under recording rule 6.

### B4 · [AUD-H03] Two-factor codes are predictable and can be guessed without limit
*high · 28 Jul · open*

Two claims, different verdicts:

- **"Predictable" — looks addressed.** `two-factor.service.ts` uses
  `randomBytes`/`randomInt` from `crypto`, not `Math.random`.
- **"Without limit" — stands.** There is no attempt counter, throttle, lockout or
  rate limit anywhere in that service. Codes can still be brute-forced.

**Split into two bugs** so the fixed half can close and the open half keeps its
severity.

### B5 · Ruvheneko: invoice details unavailable · can't convert to deal
*medium · 17 & 19 Aug · open*

The underlying data mess was cleaned on 25 August: of four Ruvheneko records, three
are soft-deleted and one survives, with 2 deals and 5 invoices intact.

**Both need a UI retest** — the symptoms may simply be gone.

One thing that will confuse the retest: "convert to deal" previously failed with
**400**. Under recording rule 6 (shipped 26 Aug) a school with an open deal now
returns **409** with a confirm prompt. A 409 is the new correct behaviour, not the
old bug.

---

## C. Confirmed still open, no fix in the code (4)

### C1 · [WANEZI1] Wanezi High School exists four times
*high · 28 Jul · open*

Nothing has been done. All four school records are still live:

| Name | City | Province |
|---|---|---|
| Wanezi High School. | Insiza | Matebeleland South |
| Wanezi High School. | Gwanda | Matebeleland South |
| Wanezi High School | Wanezi | Matebeleland North |
| Wanezi High Scool | Unknown | Harare |

All four Njabulo Mathwasa contacts are still there too, across three of those
records, with his number stored four ways.

This is not an isolated case — it is one instance of a pattern I measured
separately this week: **98 schools held under 202 live records, 104 of them
redundant**. Wanezi should be fixed as part of that merge, not on its own.

### C2 · [R9] RBAC permission toggles do not actually enforce
*medium · 22 Jul · open*

Confirmed, and the severity looks understated. The `rbac` module contains a
controller, a service and DTOs — **and no guard**. Every enforced route in the
server uses `RolesGuard` (37 usages). So the permission toggles an admin sets in
the UI write to a model that nothing consults at request time.

**Raise the severity.** An access control that appears to work and does not is
worse than one that is visibly absent.

### C3 · [AUD-H02] "You must change your password" can simply be ignored
*high · 28 Jul · open*

Confirmed in `auth.service.ts:251-267`. When a password change is required, login
still issues **full tokens** and merely adds `requires_password_change: true` to
the response. The session is completely valid; a client that ignores the flag —
or any direct API caller — carries on as normal.

### C4 · Deploy current main, then run the won-deal stage backfill
*medium · 25 Aug · open*

Half done, and the other half **cannot run yet**.

- Part 1, deploy: done on 26 August.
- Part 2, the backfill: `backfill-won-deal-stages.js` has no target. The Sales
  Pipeline has **no Won, Lost or Commissioned stage**, and that is what
  `getTerminalStageKind` matches on. 28 won and 3 lost deals are still parked on
  non-terminal stages.

**Blocked on a decision:** add the two terminal stages first. Same blocker as
section 1b of the scrum pack.

Also worth correcting on the ticket: it names migrations **1772 / 1773 / 1774**.
On our lineage those were renumbered to **1781 / 1782 / 1785**, and 1784 was cut
out into `db-ops/cancel-duplicate-march-invoices.sql`. Anyone verifying by number
will look for migrations that do not exist.

---

## D. Not checked in this pass (30)

Read the code for the items above only. The rest need either functional testing or
infrastructure access, and I have not verified them either way:

- **Infrastructure:** plain-HTTP login, cookie `Secure`/`SameSite` depending on
  `NODE_ENV`, AUD-M10 test databases self-synchronising.
- **Needs a functional test, not a code read:** AUD-H06 (admin_support shortcut),
  AUD-H07 (calendar/video pages — the controllers do exist:
  `calendar-sync`, `scheduling`, `video-integrations`), AUD-H08, AUD-H09, AUD-H10,
  METRICS1, HYG1, HYG2, C8, N3, IMPORT2, QUOTE1, QUOTE5, QUOTE6.
- **The 11 backlog items** — feature requests rather than defects.

---

## What to do at standup

1. **Close four** after a quick verification each: A1–A4. That is nearly a tenth of
   the open list, sitting there only because the tracker predates the deploy.
2. **Fix the two figures that mislead:** ACT5 says 2,364 when it is nearer 272, and
   the backfill ticket names migrations that were renumbered.
3. **Two decisions needed:** terminal pipeline stages (unblocks C4), and whether
   `admin_support` belongs in the disqualification guard (A1).
4. **Raise R9's severity** and fold WANEZI1 into the wider 104-record school merge.
5. **Split AUD-H03** so the fixed half can close.
