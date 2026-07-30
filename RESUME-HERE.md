# Resume here — state as of 2026-07-29 (end of day)

Read this first, then `CODEBASE-SKELETON.md`. This captures exactly where
things stand so the next session continues without re-deriving anything.

---

## 1. Deployment state RIGHT NOW

| Environment | What it runs | Notes |
|---|---|---|
| **Production API** (`api`) | branch **`prod-bugfix`** | baseline + audit fix + dropdown fix + the 5 deployed bug fixes. **NO auto-assign engine, NO import feature.** Verified live. |
| **Production client** (`crm`) | `prod-audit-2` build | no auto-assign UI, no Import Leads button. |
| **Staging API + client** (`api-staging`, `staging`) | branch **`dube-upgrades`** HEAD (v32) | **everything** — bug fixes + auto-assign engine + import feature. For Kim's testing. |

**Branches:** `dube-upgrades` = working branch, has everything. `prod-bugfix`
= bug-fixes-only, currently deployed to prod. `prod-audit-2` / `prod-audit`
= earlier prod builds. When shipping to prod, keep using the "clean branch"
pattern (cherry-pick only what's meant for prod) until auto-assign is signed
off.

**Engine is OFF on prod AND staging** via `compliance.policy.auto_assign_enabled`
(= false). It only PROPOSES; a manager approves. Do not enable without sign-off.

---

## 2. THE thing to do next: Kim tests her flow on staging

Everything is staged and cleaned for her. She logs into **staging**
(`mpofunk@clearhue.co.zw` / `StagingTest2026`, or `prince@me.com` /
`21212121` — the prod password now works on staging too, verified).

Her flow, all built and working (verified end-to-end as a manager on 29 Jul):
1. **Leads page → "Import Leads"** button (top-right, manager+admin only) →
   upload **`C:\Users\8Y14\Desktop\Nash-2026-new-schools-city-lookup.xlsx`**
   (now fully researched — see §5). Loading screen → creates a school +
   head contact + unassigned New lead per row, logged with the count.
2. Leads land under **New**. Click the **New** filter → a **"Run
   auto-assign"** button appears (manager only).
3. Run it → distributes to the reps → **notification** → **Approval Queue**
   (`/admin/approval-queue`, "Auto-assign" tab) shows province → rep, reason,
   and the "will gain X" preview. Manager approves (single / batch).

Staging was cleaned for this: **2,153 schools kept, 0 test leads, empty
queue**. Territories are set on the 4 (Kim/Manake = West+Mat provinces,
Tanya/Busi = Mashonaland+East — but only reps Manake & Tanya RECEIVE leads).

**After Kim signs off** → build a clean prod branch that ADDS the auto-assign
engine + import feature to prod, deploy, turn the setting on only when she's
ready. Until then it stays off prod.

---

## 3. The auto-assign engine — confirmed model (Kim, 29 Jul)

Full spec in `AUTO-ASSIGN-ENGINE.md`. Summary:
- **Reps only** receive (Manake, Tanya). Managers approve/reassign, never
  receive auto-assigned leads.
- **Fairness = ≤50-lead gap, rep-vs-rep.** Territory preferred within the
  cap; fairness wins on collision (overflow out of territory).
- Engine only ADDS leads; **rebalancing a rep's existing book down is a
  manager reassignment decision**, not the engine.
- **Batch chooser**: 50 / 100 / 250 / 500 / All. Slow is fine.
- Pool = unassigned + never-worked (no activity) + not disqualified. That is
  exactly the freshly-imported leads.

---

## 4. The nine bugs — DONE

- **3 were already fixed** (found via the pre-fix grounding rule): public
  registration (gated, 403 on prod), brute-force lockout (15 min), idle-lead
  dedup. Tickets resolved.
- **5 fixed + DEPLOYED TO PROD + verified**: X-Powered-By removed, security
  headers added, API docs gated out of prod (`/api/v2/docs` → 404), SLA clock
  pauses on weekends (`addBusinessHours`), quotes expire past validity
  (nightly 01:00 cron). All 5 tickets resolved.
- **1 left (optional)**: cookie Secure/SameSite depends on `NODE_ENV` — low
  risk because that var is reliably set on prod. Add a `COOKIE_SECURE`
  override only if wanted.

---

## 5. NASH import file — research finished

`Nash-2026-new-schools-city-lookup.xlsx` on the Desktop: the 65 schools
marked "NOT SEARCHED YET" are now all researched (5 parallel agents, by
province). Result across all 370: **confident 247 / probable 62 / none 61**.
Backup of the pre-research file at
`…\.claude\jobs\94088d6c\tmp\Nash-backup-before-research.xlsx`.
Two province mismatches flagged in the file: "Gweru High" (filed Manicaland,
is Midlands) and "Solusi Adventist" (is Bulawayo Metro, not Mat South). The
61 "none" have blank city (never guessed — data-honesty rule).

---

## 6. Uncommitted working-tree state on `dube-upgrades` (decide these)

- **`CODEBASE-SKELETON.md`** — the 2026-07-29 verification rewrite is
  UNCOMMITTED. It's good; commit it.
- ~~`helmet` / `@nestjs/throttler` unused~~ — **RESOLVED 2026-07-30**:
  `helmet` removed (redundant with the manual header middleware); throttler
  wired up as a global rate limiter with tight caps on the auth routes
  (see BUGFIXES.md → SEC-RL, and `throttler-behind-proxy.guard.ts`). On
  `dube-upgrades`, not yet deployed.
- `lead-auto-router.service.spec.ts` — a 1-line change, minor.
- Neither is in any deploy (deploys use committed content via `git archive`).

---

## 7. Older pending items (unchanged, still owed by people)

- **Wanezi merge** — Ms Mpofu confirms the surviving record; then Kim decides
  Njabulo's US$7,800 (INV-0062 vs 0076). See `WANEZI-CONSOLIDATION.md`.
- **PAY-1/PAY-2** payments allocation fix — verified on staging, committed;
  needs prod sign-off (it's in the audit-fix code already on prod? confirm).
- **SCHLEAD2** rep-created-lead visibility workflow — options put, decision owed.
- **40-a-day discipline counter** (DISC2) — not built.
- **ACT5** — 2,364 stuck open activities to clear (ACT4 date-fix is on prod, so
  clearing them now won't fake freshness).

---

## 7b. ⚠️ Pending: restore Kim's staging password
Kim's staging password (`mpofunk@clearhue.co.zw`) is **temporarily changed**
to a test value (2026-07-30) so we could work the meeting backlog as her.
**Restore it before wrapping** — full instructions + her saved original hash
are in `ops/kim-staging-password-status.local.md` (git-ignored). Do this once
the `TEST-BACKLOG-2026-07-30.md` items are done.

## 8. Credentials / access reminders

- Staging `prince@me.com` = **21212121** (set today to match prod, verified).
- Deploy: `git archive --format=tar.gz -o /tmp/x.tar.gz <branch>:crm-v2-server`
  then `node <scratchpad>/caprover-deploy.mjs <app> /tmp/x.tar.gz`. Poll live
  behaviour; builds take 10–20 min. SSH/DB writes are handed to the user with `!`.
- **Deploy only on explicit "push to production" / "push to staging".**
