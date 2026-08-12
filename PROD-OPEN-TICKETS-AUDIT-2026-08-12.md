# Production open-ticket audit — 2026-08-12

## Scope and evidence

The production UI was reported to show **22 Open** tickets on 12 August 2026.
The authenticated ticket endpoint correctly returned `401 Unauthorized` to this
audit environment, and no signed-in browser session was available. Therefore:

- the **count (22)** comes from the live UI report;
- the candidate membership below is reconstructed from the repository's
  11 August tracker audit and its earlier production export;
- no production ticket, lead, import batch, approval proposal, or other record
  was changed;
- verdicts compare the ticket's acceptance claim with the current branch and
  read-only evidence from the public production bundle/endpoints.

Do not bulk-close from this document. First export the current Open view or run
the authenticated API query and match the IDs. The verdicts are suitable for
triage after that identity check.

## Result

| Verdict | Count | Meaning |
|---|---:|---|
| Delivered / stale | 2 | The active workflow already implements the ticket. Verify once in prod, then close. |
| Partly delivered / ticket is stale as written | 11 | Some acceptance points shipped; other work remains. Split or rewrite before continuing. |
| Genuine open work | 6 | The claimed gap is still present in current code. |
| Decision or clarification needed | 3 | The record is real, but is not yet an actionable defect. |
| Fake | 0 | No candidate is invented or unsupported. |

## Ticket-by-ticket verdict

| Ticket | Verdict | Code evidence and recommended tracker action |
|---|---|---|
| **METRICS1** | Partly delivered | Qualification totals now count distinct leads and the average is converted to a 1–5 scale (`dashboard.service.ts`). Daily-contact reporting now counts completed activities and scopes targets to sales roles (`activity-discipline.service.ts`). The ticket also bundles separate quote, currency, activity-data, and unchecked dashboard claims. **Split it; close the two delivered metric defects.** |
| **HYG1** | Genuine | `lead-hygiene.ts:lastTouchOk` still applies one fixed 72-hour rule to every non-terminal lead, with no stage-aware cadence. **Keep open.** |
| **HYG2** | Partly delivered | Hygiene has four bands and includes qualification, but the implemented Poor band is `<60`, not the requested `0–40`, and HYG1's fixed recency rule remains. **Rewrite into grading-policy and calculation-defect tickets.** |
| **C8** | Genuine | Quote create/update and invoice create/update still assign the latest document total to `deal.value`. **Keep open; define whether deal value is manager-owned, latest-document, or derived.** |
| **N3** | Genuine, low-value path | `discipline-metrics.service.ts` still uses `subject ILIKE '%demo%'` and `'%proposal%'`. A newer dashboard service is better structured, but the named service remains. **Keep as tech debt or remove the unused endpoint; do not call it fake.** |
| **QUOTE4** | Partly stale / rewrite | The title's “every deal is ZAR” is no longer true: new deals default to USD. However, `Quote` and `CreateQuoteDto` still have no currency field, so quote totals remain currency-less records. **Rewrite to the remaining quote-currency defect.** |
| **QUOTE5** | Decision needed | `po_received` exists but code cannot prove whether staff should be required to use it or whether Accepted can legitimately occur without a PO. **Move to investigation/product decision, not defect closure.** |
| **QUOTE6** | Partly delivered | New quotes advance linked deals and can atomically create/link a deal for a resolvable dealless lead. The historical orphan backfill remains, and the expiry job only marks the quote Expired—it deliberately does not mark its deal Lost. **Split future prevention, historical repair, and expiry policy.** |
| **QUOTE1** | Partly delivered | Editing an Accepted quote reverts it to Draft, and conversion checks for an existing invoice rather than rejecting every Accepted quote. There is still no one-Accepted-quote-per-deal invariant. **Close parts 1–2 after prod verification; keep part 3 separately.** |
| **IMPORT2** | Partly delivered | The XLSX importer recognizes contact/head/principal and phone aliases, but `createApprovedRows` passes them only into the contact. New-school creation still does not populate `school.principal_name` or the school's display phone, and the 368-row repair remains. **Split prevention from the audited data backfill.** |
| **CON1** | Delivered / stale | `contacts.secondary_phone` exists in the entity/migration, DTOs, lead forms, People tab, lead glance, and XLSX importer. The public production bundle contains `secondary_phone`. **Verify a create/edit/read round trip, then close.** |
| **CSV6** | Delivered for the active importer | The active XLSX import recognizes `Phone 2`, `Mobile2`, secondary/alternate phone aliases and persists `secondary_phone`. The old browser CSV modal still omits it, but that modal has no live opening action in the Leads page. **Close against the active import path or create a separate legacy-CSV removal ticket.** |
| **CSV4** | Partly delivered | There is now a server-side XLSX endpoint and manager approval gate. Approval still creates rows one by one, catches per-row failures, and provides no approved-batch rollback. **Rewrite to atomicity/reconciliation/undo; the “no server endpoint” claim is stale.** |
| **CSV7** | Genuine feature | The approval gate exists, but both UI and API still limit importing to admin/sales-manager; sales reps cannot import. **Keep open as a feature, not a bug.** |
| **ESC1** | Genuine feature | The repository contains lead escalation only and explicitly reserves a future deal-escalation path. No `DealEscalation` model/API/UI exists. **Keep open as a feature.** |
| **REA1** | Partly delivered | Rep-requested reassignment requires a reason and manager approval. A manager's direct `/leads/:id/assign` action records from/to in the activity log but accepts no reason. **Rewrite to cover direct manager reassignment only.** |
| **QSYNC1** | Partly delivered | Quote creation now links/creates and advances a deal, but there is no two-week “needs disqualify” automation and no dedicated quote entry in the deal activity feed. **Split those remaining two requirements.** |
| **STAKE1** | Genuine feature | Stakeholders can be written directly; there is no staged stakeholder-change entity, manager verification flow, or before/after approval UI. **Keep open as a feature.** |
| **DUP3** | Acceptance decision needed | Current create UI intercepts a detected duplicate and requires an explicit confirmation, then permits creation. This matches the shipped “confirm-to-proceed” design but not a hard uniqueness prohibition. **Decide warn-and-confirm versus hard block, then close or rewrite.** |
| **DUP6** | Partly delivered | Merge operations now log who/when, add visible survivor/loser notes, and retain the loser, but no unmerge/undo API or UI exists. **Rewrite to undo only; close the trail portion after verification.** |
| **HEAD1** | Clarification needed | The ticket itself says the meeting wording is unclear. Current code validates minimum viable data for qualification, but there is no testable definition of “check the head when updating a lead.” **Move to needs-clarification; do not treat it as a confirmed defect.** |
| **INV2** | Partly delivered | Invoices have `due_date`, a create-page default of 30 days, overdue queries, and payment-term schedules. “More options” is unspecified. **Close the payment-deadline portion after verification and replace the remainder with named finance requirements.** |

## Production checks performed (read-only)

- `https://api.digilearncrm.work/api/v2/bug-reports?...` returned **401**,
  confirming ticket data is not publicly exposed.
- The production client shell was last modified on 12 August and its public
  bundle contains the active import/secondary-phone/auto-assign feature
  signatures used in this comparison.
- The API's HTTPS response includes HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, and no `X-Powered-By` header.
- `/api/v2/docs` returned **404**, so the old public-API-docs finding appears
  fixed.

### Important security correction outside the candidate 22

Both `http://crm.digilearncrm.work/` and
`http://api.digilearncrm.work/api/v2/bug-reports` answered directly over plain
HTTP instead of redirecting to HTTPS. HSTS helps browsers only after a secure
visit and does not replace an HTTP-to-HTTPS redirect. Also, the web-app HTML
response did not carry the API's security headers. Therefore:

- **“Site and API both work over plain HTTP” is not stale; keep/reopen it.**
- **“Missing security headers on the web app” needs a fresh nginx-level check;
  the current root response still lacks them.**

## Safe triage order

1. Export the authenticated Open view and confirm these 22 IDs/titles.
2. Prod-smoke-test **CON1** and **CSV6**, then close only those two.
3. Split the eleven mixed tickets so delivered work is not presented as open
   and unfinished work is not accidentally closed.
4. Reclassify CSV7, ESC1, STAKE1, HEAD1, QUOTE5, and the remaining INV2 work
   away from “bug” where appropriate.
5. Keep the approval queue and pending auto-assign/import records untouched;
   this audit requires no data migration.

## Follow-up implementation â€” eleven partial tickets

On 12 August the eleven mixed tickets were rewritten as guarded tracker
updates in `ops/tracker-partials-2026-08-12.json`. The live tracker was not
mutated because this environment has no authenticated session. The companion
`ops/apply-bug-tracker-manifest.mjs` performs an authenticated GET first and
refuses to PATCH if either the UUID or `[CODE]` title prefix has changed.

Code completed and ready for deployment verification:

- **QUOTE4** â€” new quotes store an explicit three-letter currency; linked
  historical quotes inherit the deal currency in migration
  `1781000000000-AddQuoteCurrency`. Unknown unlinked history remains NULL.
- **QUOTE1** â€” a serialized service check and database transition trigger
  reject a second quote entering Accepted for one deal without making the
  migration fail on historical duplicate data.
- **IMPORT2 prevention** â€” an approved import copies a primary Head contact's
  name into a blank `school.principal_name`; it never overwrites curated data.
  Phone remains on Contact because School has no server-side phone column.
- **REA1** â€” a direct owner change requires a reason and records it in the
  lead audit trail. The redirect/assign list still includes all active staff,
  so a manager can select themselves.
- **QSYNC1 feed portion** â€” commercial-intent registration writes a dedicated
  quote/invoice entry to the linked deal changelog.

Deliberately not guessed or run against production:

- METRICS1 and HYG2 need measured KPI/grading definitions.
- QUOTE6 needs a historical-data dry-run and an expiry/Lost policy.
- CSV4 needs exact batch provenance before undo can be safe.
- QSYNC1's two-week signal needs timing/status/notification rules.
- DUP6 needs a pre-merge snapshot design; current history is not enough for a
  trustworthy unmerge.
- INV2's remaining "more options" needs Finance to name the options.

Safety statement: no lead, pending import batch, pending auto-assignment
proposal, approval-queue row, or production ticket was changed during this
work. The existing auto-assign undo path was not modified.

Verification run:

- server TypeScript compile: pass;
- client production build: pass (existing large-chunk warning only);
- focused QUOTE1/QUOTE4/REA1 Jest suite: 5 tests pass.
