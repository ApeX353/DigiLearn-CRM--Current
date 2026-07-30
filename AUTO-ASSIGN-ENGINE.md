# Lead distribution (auto-assign) engine — build spec

> **STATUS 29 July: rebuilt to Kim's answers; ready for staging.** Engine
> stays OFF on prod until sign-off. Kim's clarifications, now implemented:
>
> 1. **Distribution is to SALES REPS only.** Managers are NOT auto-assign
>    recipients — they approve proposals and handle reassignment. Fairness
>    (≤50 gap) is measured **rep-vs-rep** (Manake ↔ Tanya), never
>    rep-vs-manager. (This replaces the earlier "both balanced within
>    cohort" reading that put a manager at +190 on the first staging run.)
> 2. **The engine only ADDS leads — it never strips an existing book.**
>    "Bringing a rep down" (e.g. moving Byo-province leads off Tanya to a
>    new Byo rep — Simba's idea) is a **manager reassignment** decision,
>    settled as a manual manager action considering all factors. Not the
>    engine's job.
> 3. **No cap — a batch-size chooser instead:** 50 / 100 / 250 / 500 /
>    All. Slow is fine; it checks each lead's factors one by one. Final
>    tuning to be discussed once Kim sees it on staging.
>
> **The pool is today's NEW leads.** On prod the schools already exist;
> the leads for them have not been made yet. Those newly-created,
> unassigned, no-activity leads are exactly what the engine distributes
> (matches `getDistributablePool`). Import the leads, then run.


**From the 29 July 2026 meeting.** This is the authority for the AUTO1 /
AUTO2 / AUTO3 tickets. The engine's server side is already built
(propose → manager approves → assign; routed by territory then load) on
branch `dube-upgrades`; this doc records the refined rules to finish it.
It stays **OFF in production** until built and signed off.

## What it distributes

- **Only NEW leads with NO activity yet.** A lead that has any activity
  has already been picked up — leave it alone.
- **Never count disqualified leads** in any total.
- **Once a lead has any activity → it shows under Contacted** (this is
  existing behaviour: first contact activity flips New → Contacted).

### Real numbers on production (29 July)

| | count |
|---|---|
| Unassigned (all) | **465** |
| Unassigned **and New** (the distributable pool) | **408** |
| Assigned (all) | 1,288 |
| Disqualified (excluded) | 234 |

So the engine's working set is the ~408 unassigned New leads, not all
465 — the difference is unassigned leads that already carry activity.

## Before distributing, gauge first

1. How many leads each **sales rep and sales manager** already holds.
2. How many leads are **New and available** for distribution.
3. **Where** the leads are (school province / location).

## How a manager uses it

1. Manager imports leads → they land under **Approved**, then under
   **New** (filter = New).
2. **Auto-assignment is a button.** Tapping it runs the distribution and
   sends the result to the **Approval Queue** — nothing is assigned yet.
3. The Approval Queue is **openable and readable per person**:
   e.g. "Manake will gain 37 leads", before anything commits.
4. The manager approves → only then are the schools/leads assigned.

## Priority rules (in order)

> **UPDATED 30 July (Mr Dube): territory is a HARD filter — "Manake does not
> get Mashonaland."** This supersedes the earlier "fairness first" ordering.
> Fairness no longer overrides territory. (Implemented in
> `lead-auto-router.service.ts` `allocate()`; unit-tested.)

1. **Territory first, and it is HARD.** A lead goes ONLY to a rep whose
   territory covers its school province. It is never routed out of territory
   to balance load. The two groups cover all 10 provinces with no overlap:
   - **Manake (rep)** → Midlands, Matabeleland South, Bulawayo, Masvingo,
     Matabeleland North. (Kim manages this region but does not receive
     auto-assigned leads.)
   - **Tanya (rep)** → all Mashonaland (East, West, Central), Manicaland,
     Harare. (Busi manages this region.)
2. **Fairness only within a shared territory.** When more than one rep covers
   a province, the lightest-loaded of them gets the lead. With the current
   disjoint groups each province has exactly one rep, so each rep simply gets
   all of their province's leads.
3. **No coverage → skip.** A lead whose province no rep covers (or that has no
   province) is left unassigned for a manager to place by hand — never forced
   onto the wrong rep.
4. **The reassignment button is admin + manager only** — reassignment is where
   an existing book gets rebalanced (the engine never does).

## What is already on the leads page (build on this, don't duplicate)

Reviewed 29 July. The "assignee filter with the AI markings" the meeting
referred to is already live on the Leads page:

- **Assignment filter**: All / Assigned Only / **Unassigned** — this
  already isolates the 465 unassigned leads.
- **Assigned To filter**: "All Assignees" + one option per staff member.
- **The AI markings** = `LeadRowMarkers`, a strip of badges on every lead
  row and kanban card: SLA breach, overdue follow-up, **No next
  activity** (amber), incomplete data, unqualified, temperature
  (hot/warm/cold), qualified.

**Why this matters for the engine:** the two signals it needs already
exist in the UI —

- the **Unassigned** assignment filter = the candidate set, and
- the **"No next activity"** marker = "this lead has never been worked".

So the distributable pool is *Unassigned + no-activity*, which the page
can already show. The engine should reuse these, not add a parallel
filter. Server-side, "no activity" should be an explicit condition on the
pool (today the router only excludes already-assigned leads — see the
"to add" note below).

## How the built engine already maps to this

- Server proposes into `lead_assignment_proposals`, a manager approves
  (single or batch) → assigns + starts SLA. Matches "button → approval
  queue → approve → assign".
- Territories live on `users.territory_provinces`; set on the Staff page.
  Load territories per the group mapping above.
- Still gated OFF behind `compliance.policy.auto_assign_enabled`.
- **Territory is now a hard filter** (30 July) — no cross-territory overflow,
  no 50-lead gap cap. Fairness applies only among reps who share a province.
- **To add for full spec:** exclude leads-with-activity from the pool
  (currently excludes only already-assigned), and show the per-person
  "will gain X" preview in the Approval Queue tab.
