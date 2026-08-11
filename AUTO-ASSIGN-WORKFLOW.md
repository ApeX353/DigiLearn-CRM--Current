# Auto-Assign — Workflow & State Reference

*The manager lead-distribution engine. Live on production as of 2026-08-05. Call this doc anytime.*

---

## What it does, in one line
A manager distributes a batch of **new, unworked** leads to reps **by territory and workload** — the engine only **proposes**, a manager **approves**, and only then does a lead get an owner.

## The workflow (how Kim runs it)
1. **Leads** page → filter tab **"New"**.
2. The **"Run auto-assign"** button + a **"Distribute: [campaign ▾]"** picker appear.
3. Pick the import to hand out — e.g. **NASH 2026** — (or "All new leads").
4. Click **Run auto-assign** → the engine writes PENDING **proposals** → you're taken to the **Approval Queue**.
5. In the queue: review, then **approve** (single, multi-select **bulk**, or **Approve-all**). Approval is when the lead gets its owner and the first-touch SLA clock starts.

## Who can run it
- **Managers/admins only** (`sales_manager` / `admin`). Kim (sales_manager) sees it. Prince now has `sales_manager` on prod too (re-login required).

## How leads are distributed (the rules — Mr Dube, 30 July)
- **Territory is a HARD filter.** A lead goes only to a rep whose `territory_provinces` covers its school's province. Never out of territory.
- **Fairness within territory** — if more than one rep covers a province, the **lightest-loaded** gets it. **There is NO ≤50 gap check in distribution** (code-verified 10 Aug: `allocate()` never reads `FAIRNESS_GAP` — the gap applies only to rebalance moves). With prod's disjoint territories each rep simply gets all of their provinces' leads.
- **No covering rep / blank province → skipped**, left for manual placement.
- **Recipients** = active **sales_reps with a territory**. Managers are **excluded** unless `auto_assign_include_managers` is on (capped by `manager_lead_cap`).

## Current prod territories
| Rep | Role | Provinces |
|---|---|---|
| **Tanya G** | sales_rep | Mashonaland E/W/Central, Manicaland, Harare |
| **Manake** | sales_rep | Midlands, Mat South/North, Bulawayo, Masvingo |
| Busi | manager | (same as Tanya — for rebalance) |
| Kim | manager | (same as Manake — for rebalance) |

→ Auto-assign recipients on prod are effectively **Tanya + Manake**.

## The campaign scope (why it matters on prod)
Without a campaign the engine distributes **every** eligible new lead — on prod that includes an old backlog. **Picking a campaign (e.g. NASH 2026) scopes the run to only that import's leads.** Always pick the campaign when handing out a specific import.

## Decisions available in the Approval Queue
- **Approve** — single / bulk (multi-select) / **Approve-all** (progress bar).
- **Reject** → proposal moves to the *Rejected* tab, lead stays unassigned.
- **Redirect** a rejected proposal to any rep/manager (bulk supported).
- **Send to New Leads** — lead → New/unassigned + re-run duplicate detection (bulk supported).

## Safety nets
- **Undo** — reverses an approval: lead → unassigned, proposal → PENDING, the approval's SLA clock cleared. **Blocked** if the lead was since worked or hand-reassigned (never strips a lead a rep is on). On the approve toast.
- **Rebalance (balances PROPOSALS before approval — assign once)** — after auto-assign, a manager evens the reps by moving **pending proposals** (not assigned leads) between two reps, **scoped to one import**: pick "Balance which import", From → To, **Preview** (shows *projected* totals = existing book + import proposals), **Move** → reassigns proposals, nothing assigned yet. **Approve-all then assigns the balanced split once** (SLA once, no double-assign, no debris — the fix for the 228/SLA mess). Keeps the ≤50 gap; **cross-territory allowed**; moves up to the from-rep's import-proposal count. Auto-even closes the projected gap as far as one import allows (may move a rep's whole share); type a **count** to move fewer. A legacy path still moves *assigned* leads for non-import rebalances.

## Catching the lighter rep up (the equity flow — Manake vs Tanya)
The distribution engine **never balances books** — it is territory-only. "Catch Manake up to Tanya, then hand out what's left" is achieved with the rebalance step, run manually **between** distribute and approve:

1. **Run auto-assign** (campaign picked) → the territory split lands as proposals (NASH: Tanya 185 / Manake 178). The book gap is untouched.
2. **Rebalance**: From = heavier (Tanya) → To = lighter (Manake), campaign, auto-even → moves ⌊(from − to) / 2⌋ proposals based on **full-book projected** loads (EQUITY1). Meeting in the middle is mathematically identical to "catch the lighter rep up first, then split the remainder evenly" — both end level.
3. **Approve-all** → each lead assigned exactly once.

- The catch-up is **capped by the heavier rep's import share** — one import can only close so much gap. NASH example: gap ≫ import, so auto-even hands Manake ALL of Tanya's 185 (Manake gets essentially the whole import and is still ~93 behind on the open count).
- **Direction is manual.** The manager picks From/To; the system won't detect who's lighter — it only refuses a move when From isn't projected heavier.
- **The pitfall:** Run + Approve-all *without* step 2 = raw territory split, gap preserved — and Undo can't rescue approvals once reps start working the leads. A queue nudge / one-click "Balance now" was proposed (10 Aug) and **parked, not built**.

## Key facts / gotchas
- **The switch stays OFF.** `auto_assign_enabled` only gates the *automatic background cron*. The **manual "Run auto-assign" button ignores it** — so it works with the switch off, and nothing fires on its own.
- **Manual claims win.** A lead someone has already taken (`assigned_to` set) or worked (has activity) is **excluded** from the pool — never swept in or reassigned.
- **Proposes only.** Nothing changes ownership until a manager approves.
- **Redirect / Send-to-New-Leads don't check proposal status server-side** — the UI only offers them on the Rejected tab, but the API would accept them for any proposal whose lead is still unassigned.
- **Undo clears `current_sla_due_date` unconditionally** (guards ensure the lead is untouched first) — fine in practice since approval is what starts the clock.

## Code verification (2026-08-10)
This doc was checked line-by-line against `lead-auto-router.service.ts`, `automation.controller.ts`, `automation.constants.ts`, the client hooks (`api/assignment-proposals`) and both pages. Everything above matches the code, after one correction here (no gap check in distribution). **Still stale elsewhere:** the `FAIRNESS_GAP` comment in `automation.constants.ts` describes the pre-30-July "fairness overflows territory" rule (the opposite of `allocate()`), `allocate()`'s docstring mentions a fairness cap it doesn't enforce, CODEBASE-SKELETON.md §9.1 repeats the gap-in-distribution claim, and AUTO-ASSIGN-ENGINE.md's "to add for full spec" items are both long since implemented.

## Current state (2026-08-06, code-verified 2026-08-10)
- Full suite **LIVE on prod** (api **0.0.25 / img 36**, crm **img 29**), clean boot. Campaign-scoped auto-assign, proposal-stage rebalance, prominent preview, live counters — all shipped.
- Territories set; **switch OFF** (manual works); prince has `sales_manager` on prod (re-login for the button).
- **NASH 2026: 364 proposals PENDING** (Tanya 185 / Manake 178), not yet approved. Existing OPEN books: **Tanya 533, Manake 77**. Projected as-is: 718 / 255 (gap 463). Auto-even balance → Tanya keeps **0** NASH (533 / 440, gap 93); type a count to keep her some.
- **The correct flow:** Distribute=NASH → **balance the proposals** → **Approve-all** (assign once).
- **Open decision (Mr Dube):** territory-hard vs balance-first = how much Manake gets. The tool executes any answer, assign-once.
- Mishap cleaned up: a rebalance auto-even moved 228 of Tanya's *existing* leads (NASH was still proposals) — reverted + 178 SLA-debris cleared + 74 old leads returned. All reversible (`db_ops_*` snapshots).

*Code: `crm-v2-server/src/automation/` (`lead-auto-router.service.ts`, `automation.controller.ts`); client `pages/leads/leads-management-page.tsx`, `pages/admin/approval-queue-page.tsx`. See also CODEBASE-SKELETON.md §9.1.*
