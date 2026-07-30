# Auto-assign / Import — Live Test Findings & Spec

**Test:** 2026-07-30, Kim (sales_manager) on **staging** — imported the NASH
schools xls, ran auto-assign, reviewed the approval queue.
**Status of this doc:** everything below is **captured, nothing built.** It's
the decision-ready spec. Items needing a human decision are flagged
**[DECISION]**; the rest are agreed. Build order is at the bottom.

---

## 0. Headline

The flow works end-to-end, but the test surfaced one data incident and a set
of design gaps. The single biggest theme: **imports and auto-assign both push
data into the live CRM too eagerly** — a failed-looking import still saved its
rows, and the engine assigned across territory lines. The fix is to make the
**approval queue a true gate**: nothing becomes a live lead until a human
approves it, with duplication and territory checks in the way.

---

## 1. The incident (resolved)

**Double import.** The NASH import ran twice — the first attempt *looked* like
it failed on Kim's screen, but the server had already saved every row; her
retry added a second copy. Result: **736 leads (366 duplicated), 366 schools,
367 contacts**. Schools and contacts weren't doubled (the import reuses them by
school); only **leads** doubled.

**Resolution (done today):** full teardown, soft-delete, reversible —
manifest `ops/manifests/staging-doubleimport-teardown-2026-07-30.json`.
Staging is back to the clean baseline (~1,696 schools / ~1,723 leads).

**Root cause:** the import is **slow and not idempotent**. A slow run reads as
a failure client-side, and there's no dedupe, so a retry duplicates. The
approval-queue design (§2) removes this class of bug entirely.

---

## 2. Import → "Sourced Leads" → Approval Queue  *(the core rework)*

The central change. Imports must never land straight in the CRM.

> **✅ BUILT 2026-07-30 (server `4cbccd1`, client `789c200`) — items #1, #3,
> #4 and the campaign attribution part of #2/#6a.** Imports now stage a
> PENDING `lead_import_batches` row (nothing in the CRM); each row is
> dedup-checked (existing school/lead + within-batch) and flagged; a new
> "Import approvals" tab in the Approval Queue reviews rows (include/skip)
> then Approve (creates leads, stamped with `campaign_id`) or Reject
> (discards). On `dube-upgrades`, not yet deployed. **Still to do:** the
> "Sourced Leads" *view* + mounting the Import button *inside* a campaign
> page (#2/#6a UI), the **Redirect** button (#5) and **rep tiles** (#6).

1. **Imports go to Approval first.** An imported file creates **pending**
   records only; they become real leads **only on approve**. A
   failed/retried import can't pollute the CRM — worst case it's a pending
   batch you discard.
2. **"Sourced Leads" concept.** The xls leads all came from **NASH** — a lead
   *source*. Sourced leads (imports + other channels) intake → approval queue
   → and there is a **"Sourced Leads" view** to see them.
3. **Duplication test in the queue.** Before approve, flag any lead matching
   an existing school/lead, or another lead in the same batch. Manager skips
   or merges. (This is the safety net that catches a double import.)
4. **Approval queue shows the count** — how many schools in the batch / pending.
5. **Redirect button** — per lead, manager reassigns to a rep they choose,
   on the same page. Actions: **Approve / Redirect / Reject**.
6. **Rep tiles** — clickable per-rep tiles showing count before/after the run;
   clicking filters the queue to that rep. (Engine already returns the data:
   current / will_gain / new_total.)

---

## 2b. Campaigns are the home for imports  *(Mr Dube, 2026-07-30)*

6a. **Import from *within* a campaign, and track the leads to it.** A campaign
    (e.g. **"NASH 2026"**, type CONFERENCE) is where a batch of leads is
    brought in — the import button lives inside the campaign, and every lead
    it creates is stamped with that campaign so it can be tracked/attributed.
    *Partly built already:* leads carry `source_campaign_id` and there's a
    `GET /campaigns/:id/leads` ("Leads sourced from this campaign") view. The
    work is: (a) let the import accept a `campaign_id` and set it on each lead,
    (b) surface the import inside the campaign screen, (c) feed those leads
    through the approval gate (§2) before they go live. NASH is the source;
    "NASH 2026" is the campaign that holds this intake.

---

## 3. Auto-assign engine logic

7. **✅ BUILT (49ffa5b) — Territory is a HARD filter, "Manake does not get
   Mashonaland."** Fairness only balances reps who **share** a territory; a
   lead is never routed to a rep who doesn't cover its province, and a lead
   with an uncovered/absent province is skipped for manual placement.
   `lead-auto-router.service.ts` `allocate()`; 8 tests; on `dube-upgrades`,
   not yet deployed.
8. **✅ RESOLVED by #7 — the false overflow reason text is gone.** The
   out-of-territory overflow path (which produced *"Manake's territory covers
   Mashonaland East"*) no longer exists; reasons now read *"X covers &lt;prov&gt;"*.

*(Note: the cross-territory spill looked far worse than normal because the pool
was the doubled 736-lead import with Tanya pre-loaded ~225. On clean, balanced
data it's much smaller — but the disjoint-territory logic still needs fixing.)*

---

## 4. Rep Discipline

9. **Time filters: Monthly / Weekly / Daily** across all activities.
10. **Show only the sales people: Kim, Manake, Tanya, Busi.**
11. **Exclude non-sales users — LIVE issue.** On production, **SG Sithole,
    (Nkululeko) Dube, and Prince** appear as assignees / in discipline but
    aren't sales. Filter to sales roles only. *(Extends the earlier "active
    staff only" filter to "sales only".)*

---

## 5. Review requests

12. **Third option: "Enquiry".** Beyond Approve/Reject, the manager raises an
    **Enquiry** — adds a note asking for more info → the sales rep receives it
    and must respond → the manager can **ask again** as many times as needed
    (a back-and-forth thread) before finally deciding.

---

## 6. Lead disqualification

13. **Rep must REQUEST disqualification, with a reason** — not disqualify
    directly. Manager decides.
14. **Later:** an option to hand disqualified leads to other sales reps.

---

## 7. Compliance

15. **Verify the compliance report metrics are wired up correctly.**
    *(Investigation task — confirm each number is real, per the metrics-audit
    discipline.)*

---

## 8. Bug to investigate

16. **"Conference date" — RE-DIAGNOSED via live repro (2026-07-30).** It is
    **NOT a timezone bug.** Verified as Kim: entered Aug 15 → stored
    `2026-08-15` → displayed "Aug 15"; entered Aug 15–Aug 20 → displayed
    "Aug 15 – Aug 20". Dates round-trip correctly. The real cause is the
    **date field is `mm/dd/yyyy` (US format)** — a Zimbabwe manager entering
    `dd/mm` gets month/day swapped → "incorrect dates." **Fix: locale the
    date inputs to `dd/mm/yyyy`.**
17. **Campaigns cannot be edited or deleted — NEW, found 2026-07-30.** The
    controller is create + read only (`@Post`, `@Get`s; no `@Patch`/`@Delete`,
    no soft-delete column). So a campaign with a wrong date (see #16) is
    **uncorrectable**, and mistaken/test campaigns can't be removed. Add
    **edit + delete** for campaigns. *(Left on staging from this test:
    "NASH 2026" (wanted) and "NASH 2026 date-test" (throwaway) — the latter
    needs a DB delete since there's no app delete.)*

---

## 9. Recommended build order

| # | Item | Why this order |
|---|---|---|
| **P0** | §2.1–2.3 Import → Approval gate + duplication check | Stops the whole class of double-import / unapproved-data bugs |
| **P0** | §3.7–3.8 Territory-hard + fix reason text | The logic bug Kim reported; small, high-trust |
| **P1** | §4.9–4.11 Rep discipline: sales-only + time filters | §4.11 is live-facing (wrong people showing) |
| **P1** | §2.4–2.6 Queue UX: count, redirect, rep tiles | Makes the gate usable; data already exists |
| **P1** | §5.12 Review-request "Enquiry" thread | Self-contained workflow addition |
| **P2** | §6.13 Disqualification request + reasons | Workflow; §6.14 reassignment later |
| **P2** | §2.2 Sourced-leads view · §7.15 compliance-metrics check | Depends on / follows the above |
| **Bug** | §8.16 Conference date | Needs repro first |

---

## 10. Decisions
- **§3.7 — DECIDED (Mr Dube, 2026-07-30):** territory is a **hard** filter,
  "Manake does not get Mashonaland." Fairness only balances reps who share a
  territory. No open decisions remain — the list is ready to build once
  prioritised.

_Data cleanup from the test: **done** (see §1). Nothing outstanding on staging._
