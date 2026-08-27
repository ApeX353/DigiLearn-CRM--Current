# Scrum testing points — 27 August 2026

Covers the eleven commits that went to staging and then production on 25–26 August
(`dube-aug2324`, now identical to `apex/production` bar two README files).

Baseline for every "before" figure below: the 25 August production dump, restored
locally as `nash_ref`. The deploy went out on 26 August, so anything marked
**verify on prod** is checking that the deploy did what it was meant to.

---

## 1. Two blockers to raise before assigning test work

These are not new regressions — both predate this batch — but this deploy is the
first time they matter, and they will make some of the tests below impossible.

### 1a. A deal on "Demo Booked" cannot be advanced at all

The Sales Pipeline has fourteen stages but only eleven are active. The inactive
three are stages 2, 3 and 4:

| # | Stage | Active |
|---|---|---|
| 1 | Demo Booked | yes |
| 2 | Stakeholder Discovery | **no** |
| 3 | Needs Assessment | **no** |
| 4 | Solution Proposal | **no** |
| 5 | Procurement Process | yes |
| 6 | Contract Finalization | yes |
| 7 | Implementation & Delivery | yes |
| 8 | Demo Completed | yes |
| 9 | Committee Review | yes |
| 10 | Quote Submitted | yes |
| 11 | Negotiation | yes |
| 12 | PO/Contract Received | yes |
| 13 | Finance Approved | yes |
| 14 | Delivery & Installation | yes |

`assertStageGateEvidence` rejects any move where `targetOrder > currentOrder + 1`.
From Demo Booked (1) the next *active* stage is Procurement Process (5), and 5 > 2,
so the move is refused with "Deal stage cannot skip … Move through the required
intermediate stage first." The intermediate stages it names are switched off, so
there is no way through. **One ongoing deal is in this state right now.**

A second oddity in the same table: five ongoing deals sit on Solution Proposal,
which is inactive — they are parked on a retired stage.

And the running order is scrambled: Demo Completed (8) comes after Implementation
& Delivery (7), and Quote Submitted (10) after Committee Review (9). A rep working
the board top to bottom is being asked to deliver before demoing.

**Decision needed:** either reactivate stages 2–4, or renumber the active stages so
they are consecutive and in business order. Until then, part of section 4 cannot be
tested.

### 1b. "Closing a deal moves the card" is inert in production

`getTerminalStageKind` recognises a stage as terminal only if its name contains
`won`, `lost` or `commissioned`. **No active stage in production matches any of
those.** So the new close behaviour finds no target stage and silently falls back
to the old behaviour — status changes, card does not move.

Current state: 28 won and 3 lost deals, all sitting on non-terminal stages
(28 on Delivery & Installation, and one each on Committee Review, Implementation &
Delivery and Quote Submitted). The board is still counting closed revenue as live
work — which is the exact problem this commit was written to fix.

**Decision needed:** add a Won stage and a Lost stage to the Sales Pipeline. The
backfill script `crm-v2-server/scripts/backfill-won-deal-stages.js` has not been
run and should not be until those stages exist.

---

## 2. Sales rep — creating deals and taking payments

### T1 · One order, one deal (`509fa97`)
Creating a deal for a school that already has an **open** deal is now refused.

- Pick a school with an open deal. Start a new deal for it.
- **Expect:** a 409 naming the existing deal — its title, stage and value — and a
  prompt offering to create another anyway.
- Confirm the prompt. **Expect:** the second deal is created.
- Repeat on a school whose only deals are **closed**. **Expect:** no prompt at all.
- Repeat on a school with **no** deals. **Expect:** no prompt.

Worth watching: the check looks only at `closeStatus = ONGOING`, so it will not
catch a duplicate of a deal someone closed by mistake.

### T2 · A payment must carry its real reference (`b26179e`)
`reference` changed from optional to required.

- Add a payment and leave the reference blank. **Expect:** blocked, with
  "reference is required — enter the bank reference, transfer ID or receipt number".
- Enter a reference. **Expect:** saves.
- **Also check the existing payment screens still work** — anything that used to
  post a payment without a reference now fails. If any automated or bulk path does
  that, it breaks silently.

### T3 · Zero-value payments — found, traced, repaired (not yet deployed)
`b26179e` lowered the minimum payment amount from `0.01` to `0`, so the API would
accept a `0.00` receipt.

It was not intended and it was not Mr Dube's. His `07ab979` changed only the
`reference` field; the amount line came along from his branch's baseline, which
never carried our own hardening — `d81521b` ("L-05: tighten small DTO contracts",
2 August) had raised the floor from 0 to 0.01, and porting rule 4 on top of an
older file put the old value back.

- **Fixed** on `dube-aug2324` as `dfc4b54`, restoring `@Min(0.01)`. Server
  type-checks clean. **Committed, not deployed** — it ships with the next release.
- **Blast radius while live: API only.** The client schema has always had
  `z.number().min(0.01, "Amount must be greater than 0")`, so the payment modal
  never allowed it. Only a direct API call, Swagger or a script could have posted
  one.
- **Nothing to unpick:** production holds 40 payments, none zero or negative.
- The rest of that 2 August hardening was checked rather than assumed — the
  scheduling `MaxLength` caps and the user-email `IsEmail` / `ArrayMaxSize(100)`
  limits all survived. This was the only file the port also touched, which is why
  it was the only one that regressed.

**Test after the next deploy:** post a `0.00` payment through the API (not the UI)
and confirm it is rejected. Then confirm a normal payment still saves, and that
*editing* a payment to `0.00` is refused too — `UpdatePaymentDto` inherits the rule
through `PartialType(OmitType(...))`.

**Worth a minute at standup:** this is the second time a port has quietly reverted
our own hardening because the upstream file predated it. Worth deciding whether
ports get diffed against our tightening commits as a standing step.

---

## 3. Sales rep — logging activities

### T4 · The Log Activity modal saves again (`79d933b`)
With the compliance gate on in production, logging a call, email or WhatsApp as
already-completed used to come back 400, because the modal never sent an outcome.

- Log a **call** on each outcome and check the completion outcome that lands:
  answered → successful · no answer → no response · busy → no response ·
  voicemail → no response · wrong number → unsuccessful ·
  callback requested → follow-up needed.
- Log an **email** and a **WhatsApp**. **Expect:** both save, outcome "successful".
- **Expect in all cases:** no 400, and the next-step gate still applies (a logged
  email must not be quietly exempted from owing a next step).

### T5 · Activities opens on Due today (`0b08595`)
- Open Activities from the nav. **Expect:** the "Due today" tab, not "To-do".
- Confirm a task due **tomorrow** is not on that first screen but is on To-do.
- Confirm the dashboard links that carry a period in the URL still land on the tab
  they name — the URL must still win over the new default.

---

## 4. Automatic stage movement (`85e4db7`) — recording rule 3

Three stages now move themselves when the rep records the thing that proves them.
Matched on stage **name**, so these depend on section 1a being resolved.

### T6 · The three auto-moves
- Log a **demo booking** activity → deal advances to Demo Booked.
- Log a **demo completed** activity → advances to Demo Completed.
- Mark a **quote Sent** → advances to Quote Submitted.
- **Expect on each:** stage history and changelog rows written, attributed to the
  acting rep, with an "Auto:" note explaining the move.

### T7 · The limits hold
- Log a demo on a deal already at Negotiation. **Expect:** no move — forward only.
- Log a demo on a **closed** deal. **Expect:** no move.
- Break the move deliberately if you can (e.g. a pipeline with no Demo Completed
  stage). **Expect:** the activity still saves. The rep's action must never fail
  because the automation did.

### T8 · The inconsistency to test on purpose
The auto-mover checks only `targetStage.order > currentStage.order`. It does **not**
run `assertStageGateEvidence`, so it does not enforce the no-skip rule.

- Take a deal on Demo Booked. Try to move it manually to Demo Completed.
  **Expect:** refused as a skip (1 → 8).
- Now log a demo-completed activity on that same deal.
  **Expect, and this is the point:** it jumps straight there.

So the system will make a move it forbids a human from making. Decide whether the
automation should respect the skip rule, or whether the skip rule is the thing
that is wrong.

---

## 5. Closed deals stay conversational (`39b3049`)

### T9
- Open a **won** deal.
- **Expect:** the activity composer works, and notes can be added and edited.
- **Expect:** the commercial record — stage, value, quotes — is still locked.
- Confirm nothing nags the rep for a next step on a closed deal.

The reasoning: a won deal still has instalments to chase and delivery to
coordinate, and that work has to be logged where the relationship lives.

---

## 6. Email delivery (`8831c5c`)

### T10 · Templated emails actually render
`mustache` was imported as a namespace; under Bun that yields the module record
rather than the callable API, so `Mustache.render` was undefined and **every
templated email failed**. Staging was logging 2,076 failures in 24 hours. This was
a pre-existing fault in both environments, not something this batch introduced.

- Trigger a templated email — disqualification approval is the easy one.
- **Expect:** it arrives, with the merge fields filled.
- **Verify on prod:** the notification error log has stopped filling with render
  failures. This is the single highest-value check in this list, because it means
  people have not been receiving mail they were supposed to receive.

---

## 7. Schools list performance (`3b888b1`)

### T11
- Load the schools list with the idle filter applied. Time it.
- **Expect:** it returns rather than timing out.
- Check the idle count is still correct against a school you know has recent
  activity — the query was rewritten, so the answer needs re-proving, not just
  the speed.

---

## 8. Migration 1785 — verify on production (admin_support)

This ran automatically at the 26 August deploy. Two parts.

### T12 · The dedupe removed far more than the note claims
The migration's own comment says production had "29 leads with duplicate rows, 28
of them byte-identical". The 25 August dump says otherwise:

| Measure | 25 Aug dump |
|---|---|
| Leads with duplicate qualification rows | **560** |
| Total qualification rows | 2,995 |
| Rows that survive at one per lead | 2,250 |
| **Rows the migration would delete** | **745** |

Somebody should confirm what actually got deleted on production. Either the note
was measured somewhere else, or 745 rows went in one deploy on a figure of 29.

### T13 · Twelve leads may have lost data
Of the 560 duplicated leads, **548** had identical scores and flags across their
rows — deleting the extras costs nothing. **12 did not.** For those, the older row
held different scores, and the migration kept only the newest.

Spot-check those twelve and confirm the surviving score is the right one:

```sql
SELECT lead_id, count(*) AS rows_before
  FROM lead_qualification_criteria
 GROUP BY lead_id
HAVING count(distinct (qualification_score, is_qualified, has_needs,
                       has_budget, has_timeline, has_verified_contact)) > 1;
```

Run it against the 25 August dump (post-deploy production will return nothing —
the unique index is in place).

### T14 · Stale work on disqualified leads
The migration also cancels open activities on archived leads. The comment says six;
the dump shows **five** scheduled activities on Disqualified leads. Confirm they
are now cancelled, and that **notes were left alone** — notes are records, not work.

---

## 9. What's New (`f1e8a90`)

### T15
- Sign in as a **sales rep**, a **sales manager** and an **admin** in turn.
- **Expect:** "Most relevant to you" differs by role, and each entry says both what
  changed and how to use it.
- **Expect:** nothing role-inappropriate appears in the top section.

---

## 10. Already done, no test needed

- `3b9fe4f` — the duplicate March invoice cancellation was cut from a boot
  migration into `db-ops/cancel-duplicate-march-invoices.sql` and run by hand on
  production. Six invoices cancelled, already confirmed.

---

## Suggested order for the standup

1. Settle the two decisions in section 1 — they gate section 4 and section 5.
2. T10 (email rendering) first among the tests. It is the one where a silent
   failure has been costing real communication.
3. T12/T13 next — a 745-row delete on production wants confirming today, not
   next week.
4. T1, T2, T4, T5 are quick and can be spread across the reps.
5. T8 is a question for the room, not a test task. It needs an answer before
   anyone writes more code against the stage rules.
6. T3 is already fixed and committed — it needs a deploy, and one line at
   standup about how the regression got in.
