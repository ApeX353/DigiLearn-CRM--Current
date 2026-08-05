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
- **Fairness within territory** — if more than one rep covers a province, the **lightest-loaded** gets it, capped by the **≤50 fairness gap** (no rep >50 ahead).
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
- **Rebalance** — a manager moves a batch of leads between two reps to even load: **preview → commit**, keeps the ≤50 gap, moves unworked leads first, **cross-territory allowed** (a deliberate hand move isn't bound by the territory filter).

## Key facts / gotchas
- **The switch stays OFF.** `auto_assign_enabled` only gates the *automatic background cron*. The **manual "Run auto-assign" button ignores it** — so it works with the switch off, and nothing fires on its own.
- **Manual claims win.** A lead someone has already taken (`assigned_to` set) or worked (has activity) is **excluded** from the pool — never swept in or reassigned.
- **Proposes only.** Nothing changes ownership until a manager approves.

## Current state (2026-08-05)
- Full suite **deployed to prod** (api 0.0.22 / crm 0.0.14).
- Territories set; **switch OFF**; NASH 2026 import = **363 leads** in the pool (2 already taken by Busi, correctly excluded).
- Projected split (territory): ~185 Tanya / ~178 Manake (actual depends on the fairness gap vs their existing load — rebalance if lopsided).

*Code: `crm-v2-server/src/automation/` (`lead-auto-router.service.ts`, `automation.controller.ts`); client `pages/leads/leads-management-page.tsx`, `pages/admin/approval-queue-page.tsx`. See also CODEBASE-SKELETON.md §9.1.*
