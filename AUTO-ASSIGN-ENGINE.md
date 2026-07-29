# Lead distribution (auto-assign) engine — build spec

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

1. **Fair distribution first.** Spread leads so the gap between the
   busiest and least-busy rep is **at most 50 leads**.
2. **Location second.** Route by province territory:
   - **Kim + Manake** → Midlands, Matabeleland South, Bulawayo, Masvingo.
   - **Tanya + Busi** → the rest: Mashonaland East, Mashonaland West,
     Mashonaland Central, Manicaland, Harare, and **Matabeleland North**.
     ⚠️ The note read "mash east south north central, Manicaland and
     Harare" — confirm the exact Mashonaland/Mat-North split against the
     province list before wiring the territories.
3. **The reassignment button is admin + manager only.**

## Open items to confirm before building

- The **assignee filter with the AI markings** is said to already be on
  production — confirm what is live before building on top of it.
- The precise province split for group 2 (Mashonaland East/West/Central,
  Matabeleland North).

## How the built engine already maps to this

- Server proposes into `lead_assignment_proposals`, a manager approves
  (single or batch) → assigns + starts SLA. Matches "button → approval
  queue → approve → assign".
- Territories live on `users.territory_provinces`; set on the Staff page.
  Load territories per the group mapping above.
- Still gated OFF behind `compliance.policy.auto_assign_enabled`.
- **To add for full spec:** exclude leads-with-activity from the pool
  (currently excludes only already-assigned), enforce the 50-lead gap
  cap explicitly, and show the per-person "will gain X" preview in the
  Approval Queue tab.
