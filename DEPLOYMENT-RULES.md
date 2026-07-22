# Deployment Rules — Bug Fixes

> **Slow and precise is faster than fast-then-redo.** Management will always
> want it now; the way to be genuinely fast is to ship it *once*, correctly.
> A tested fix on staging takes minutes. An untested fix on prod that has to
> be diagnosed, reverted, and redone takes the rest of the day — and costs
> trust. These rules exist so "fast" never means "twice".

## The pipeline (never skip a step)

Every bug fix walks the same path. No fix goes straight to production.

1. **Reproduce & confirm.** Prove the bug exists with evidence — the failing
   API call, the wrong value, the data query — before writing a line. If you
   can't reproduce it, you can't confirm you fixed it.
2. **Document first.** Log the ticket / `BUGFIXES.md` entry: symptom, root
   cause (file:line), the intended fix, and data impact. (Owner's standing
   rule: document, then fix.)
3. **Fix on a branch.** Never edit on `main`. Small, focused change set — one
   concern per deploy. Smaller diffs are safer and roll back cleanly.
4. **Build locally.** Server `tsc` + client `tsc -b` (and `vite build` for
   anything non-trivial) must pass. Never deploy code that hasn't compiled.
5. **Deploy to STAGING — always first.** Staging exists so prod never sees an
   untested change.
6. **Verify on staging = LIVE behaviour, not "build succeeded".** Reproduce
   the original scenario and confirm it's actually fixed, **as each affected
   role** (admin / sales_manager / sales_rep / admin_support). Spot-check the
   adjacent flows you touched so the fix didn't break a neighbour. A green
   build is not verification.
7. **Get explicit prod sign-off.** Production deploys only on an explicit
   "Push to production" — never inferred.
8. **Prod deploy is surgical & reversible.**
   - Ship the **minimal** change set that fixes the bug — not a bundle of
     unrelated work riding along. (E.g. push *only* the ticketing, built from
     the current prod commit, when only the ticketing was asked for.)
   - Know the rollback before you start: the previous image/commit is the
     undo button.
   - CapRover is zero-downtime: the **old container keeps serving** until the
     new one promotes, so the team isn't interrupted mid-work. Don't call it
     done until the **new** container is live and verified.
9. **Verify on prod.** Confirm the fix live, and spot-check that the core
   workflow the team is using right now still works.
10. **Close the loop.** Mark the ticket resolved (reporter is auto-notified),
    update `BUGFIXES.md` with the outcome + verification.

## Guardrails

- **One change set per deploy.** Don't fold unrelated fixes together — it
  muddies rollback and hides which change caused a regression.
- **Migrations are additive, guarded, reversible** — `hasTable`/`hasColumn`
  guards and a real `down()`. Never a destructive migration on live data.
- **Data mutations on prod (backfills, detaches) get their scope confirmed
  and previewed first.** Show the exact rows/count before running; prefer the
  smallest scope that solves the problem.
- **Never deploy on a guess.** If you can't verify it, you don't ship it.
- **Prod is read-only until sign-off.** Investigate live issues with SELECTs;
  never mutate prod to "just try something".

## Why this is the fast path

The pressure to be fast is real and legitimate. But the failure mode of
"fast" is a broken prod, a confused team, an emergency rollback, and the same
fix done a second time under more pressure. Staging + verification adds
minutes; skipping them risks hours. Precise *is* fast.
