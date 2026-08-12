# Auto-Assign — Workflow & State Reference

*The manager lead-distribution engine. Live on production as of 2026-08-05. Call this doc anytime.*

---

> **AUTO-EQUITY update - 12 Aug 2026 (code complete; deployment pending).**
> Fairness is priority 1 and territory is priority 2. Run auto-assign first
> catches every lighter rep up to the heaviest starting projected full book;
> the remaining leads follow territory while the projected gap stays strictly
> below 50. With the current live numbers this batch is expected to finish one
> lead apart, but one apart is not a universal rule. The manager can Redirect
> any pending suggestion, including to themselves. The old Rebalance panel is
> hidden; its server endpoint remains as a legacy rollback tool.
> Existing production PENDING proposals are untouched: they count toward the
> projection and their lead ids stay excluded from later runs, but the new code
> never rewrites or rebalances those rows.

## What it does, in one line
A manager distributes a batch of **new, unworked** leads by **workload fairness first, then territory** — the engine only **proposes**, a manager **approves**, and only then does a lead get an owner.

## The workflow (how Kim runs it)
1. **Leads** page → filter tab **"New"**.
2. The **"Run auto-assign"** button + a **"Distribute: [campaign ▾]"** picker appear.
3. Pick the import to hand out — e.g. **NASH 2026** — (or "All new leads").
4. Click **Run auto-assign** → the engine writes PENDING **proposals** → you're taken to the **Approval Queue**.
5. The queue already contains the catch-up split. Review it, use **Redirect**
   for any exception or further manual balance, then **approve** (single,
   multi-select **bulk**, or **Approve-all**). Approval is when the lead gets
   its owner and the first-touch SLA clock starts.

## Who can run it
- **Managers/admins only** (`sales_manager` / `admin`). Kim (sales_manager) sees it. Prince now has `sales_manager` on prod too (re-login required).

## How leads are distributed (current rule - 12 Aug)
- **Fairness is priority 1.** Projected load means the full existing book plus
  pending proposals. Each lighter rep receives the catch-up share until they
  reach the heaviest starting projected book, if the selected batch is large
  enough.
- **Territory is priority 2.** Once catch-up is complete, remaining leads
  follow the school's province while the projected gap stays strictly below
  50. Territory may not recreate a gap of 50 or more.
- **No covering rep / blank province** goes to the lightest eligible rep by
  projected workload. The reason is visible and the manager may Redirect it.
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
- **No separate Rebalance step in the normal workflow.** Catch-up is already
  part of Run auto-assign. The legacy server endpoint is retained for rollback
  and historical compatibility, but its panel is hidden.

## Catching the lighter rep up (the equity flow — Manake vs Tanya)
The distribution engine now performs "catch Manake up to Tanya, then hand out
what's left" automatically:

1. **Run auto-assign** with the campaign picked.
2. The lighter starting projected book receives the catch-up share first. If
   the batch cannot close the whole starting gap, every available proposal goes
   toward catch-up.
3. Remaining leads follow territory inside the strict `<50` fairness band.
   With the current live numbers this is expected to finish one apart.
4. Use **Redirect** (including Redirect to yourself) for further manual balance
   or an exception, then **Approve-all**.

- The catch-up is **capped by the heavier rep's import share** — one import can only close so much gap. NASH example: gap ≫ import, so auto-even hands Manake ALL of Tanya's 185 (Manake gets essentially the whole import and is still ~93 behind on the open count).
- **Direction is automatic.** The server detects the lighter starting book.
- **The old pitfall is removed.** Run + Approve-all includes catch-up without a
  separate manager action.

## Key facts / gotchas
- **The switch stays OFF.** `auto_assign_enabled` only gates the *automatic background cron*. The **manual "Run auto-assign" button ignores it** — so it works with the switch off, and nothing fires on its own.
- **Manual claims win.** A lead someone has already taken (`assigned_to` set) or worked (has activity) is **excluded** from the pool — never swept in or reassigned.
- **Proposes only.** Nothing changes ownership until a manager approves.
- **Redirect / Send-to-New-Leads don't check proposal status server-side** — the UI only offers them on the Rejected tab, but the API would accept them for any proposal whose lead is still unassigned.
- **Undo clears `current_sla_due_date` unconditionally** (guards ensure the lead is untouched first) — fine in practice since approval is what starts the clock.

## Code verification (2026-08-10)
The original 10 Aug verification below described the former hard-territory
workflow. AUTO-EQUITY was re-verified on 12 Aug against the router, constants,
focused tests and both manager pages: fairness now comes first, territory
second, existing pending rows stay untouched, and Redirect includes the
approving manager.

## Current state (2026-08-06, code-verified 2026-08-10)
- Full suite **LIVE on prod** (api **0.0.25 / img 36**, crm **img 29**), clean boot. Campaign-scoped auto-assign, proposal-stage rebalance, prominent preview, live counters — all shipped.
- Territories set; **switch OFF** (manual works); prince has `sales_manager` on prod (re-login for the button).
- **NASH 2026: 364 proposals PENDING** (Tanya 185 / Manake 178), not yet approved. Existing OPEN books: **Tanya 533, Manake 77**. Projected as-is: 718 / 255 (gap 463). Auto-even balance → Tanya keeps **0** NASH (533 / 440, gap 93); type a count to keep her some.
- **The correct flow:** Distribute=NASH → **balance the proposals** → **Approve-all** (assign once).
- **Open decision (Mr Dube):** territory-hard vs balance-first = how much Manake gets. The tool executes any answer, assign-once.
- Mishap cleaned up: a rebalance auto-even moved 228 of Tanya's *existing* leads (NASH was still proposals) — reverted + 178 SLA-debris cleared + 74 old leads returned. All reversible (`db_ops_*` snapshots).

*Code: `crm-v2-server/src/automation/` (`lead-auto-router.service.ts`, `automation.controller.ts`); client `pages/leads/leads-management-page.tsx`, `pages/admin/approval-queue-page.tsx`. See also CODEBASE-SKELETON.md §9.1.*
