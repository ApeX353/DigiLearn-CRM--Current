# Activity Outcomes — Investigation (Mr Dube, critical)

**Question asked:** *"I cannot see outcomes for all finished activities. Either it's not being saved, or it's saved but we're not showing it."*

**Answer: both — but the missing ones are almost all HISTORICAL (not saved), not hidden.** Going forward, single completions are already enforced and shown correctly; two real gaps remain (bulk-complete enforcement + a display-format tweak).

---

## 1. The data (live / prod, read-only)

Of **~5,520** completed activities:

| | count | share |
|---|---|---|
| **No outcome AND no note** | **4,131** | **75%** |
| Outcome + note | 1,349 | 24% |
| Outcome, no note | 40 | 1% |

By type (completed → with an outcome): call **472/2,310**, whatsapp **682/1,530**, task **183/216**, meeting **23/66**, note 28/1,395 (notes are exempt by design).

So most finished activities genuinely **have no outcome stored** — there is nothing to show for them. They aren't hidden.

## 2. Why the 4,131 are blank — they pre-date enforcement

- The policy `compliance.policy.enforce_outcome_on_completion` is **`true`**.
- The **server hard-requires** an outcome on the single "mark done" path — `activities.service.ts` `updateStatus()` (≈line 1273):
  > `if (status === COMPLETED && !outcome) throw 'outcome is required when marking an activity completed'`
  This is unconditional (not even behind the setting). **But this code only reached production in today's deploy.** The 4,131 blanks were completed on the *older* build that didn't demand an outcome. They cannot be back-filled without inventing data, so we leave them as-is.

**Bulk-complete also enforces (corrected).** `bulkUpdateStatus()` throws `"outcome is required when bulk-marking activities completed"` up front (≈line 1415) before any row is touched. So **every** completion path — single, bulk, and the setting-gated edit path — now demands an outcome. There is **no live save gap**; the enforcement is complete.

## 3. Display — it IS shown on deal & lead pages (when it exists)

- Deal page → `components/deals/tabs/activities-tab.tsx` and Lead page → `components/leads/tabs/activities-tab.tsx` both render through the shared **`EngagementWorkspace`**.
- Its **Done feed** uses **`CompletedActivityFeedItem`** (`activity-kit.tsx`), which already prints, inline on the line:
  - the free-text **note** (e.g. *"spoke to the head, wants a demo"*) — line 600-604, and
  - the **outcome** as a badge (e.g. *"spoke to decision maker"*) — line 617-624.
- **Open** activities render in the **Planned** feed and keep showing their **follow-up date** — exactly Mr Dube's requirement #2.

So the display is essentially already what he asked for; the reason he "can't see outcomes for all finished activities" is that **75% of them never had one saved** (point 2).

## 4. Immediate feedback (requirement #3)

The mark-done flow routes through an **outcome-capture dialog**, then the Done feed refetches — so a recorded outcome appears straight away. This already works; the bulk-enforcement fix makes it airtight.

---

## Verdict against Mr Dube's 3 requirements

| # | Requirement | State |
|---|---|---|
| 1 | Force an outcome on completion | ✅ **Fully met** — single, bulk, and edit paths all demand an outcome. |
| 1 | Show outcome inline on deal/lead activity lines | ✅ **Done** — completed non-note lines now read `Outcome: <text>` (free-text note preferred, else the humanised category). |
| 2 | Open activities keep the follow-up date | ✅ Planned feed already does this — unchanged. |
| 3 | Outcome appears immediately after recording | ✅ Outcome dialog + Done feed refresh. |

## What was changed (2026-08-05, staging-first)

1. **Display (done)** — `activity-kit.tsx` `CompletedActivityFeedItem`: a completed, non-note activity now renders **`Outcome: <text>`** inline (Mr Dube's exact format), preferring the free-text note the rep typed, else the humanised outcome category. Open activities and their follow-up dates are untouched. This is the deal + lead activity feed (both route through `EngagementWorkspace`).
2. **Enforcement (no change needed)** — verified every completion path already throws without an outcome; nothing to add.
3. **Historical 4,131** — left as-is; no outcome exists to show and we do not fabricate data. (A one-off report could list them if reps should revisit any.)

*Prepared 2026-08-05. Data from prod, read-only. No changes made during this investigation.*
