# Activity Outcomes — Test Guide (Staging)

*For Mr Dube. Staging is a safe copy — create, complete and delete as much as you like; nothing here touches live data.*

**Where:** https://staging.digilearncrm.work
**Login:** `prince@me.com` / `21212121` (shared staging admin — full access)

You asked for three things. Here's how to check each one yourself.

---

## Your requirement #1 — completed activities show the outcome on the line

**Do this:**
1. Open any **lead** or **deal** (e.g. from the Leads list, click one).
2. Go to its **Activities** tab.
3. **Log a call:** click *Log Activity → Call*, fill in the phone + summary, pick an **Outcome**, and in the summary/note type something like *"spoke to the head, wants a demo next week"*, then mark it done.

**You should see:** the call now sits in the activity list reading, on the line:

> **Call · [date] — Outcome: spoke to the head, wants a demo next week**

Not hidden behind a click — right there in the row.

---

## Your requirement #2 — open activities keep their follow-up date, only completed ones show the outcome

**Do this:** on the same lead/deal, look at an activity that is **still open** (not completed) — e.g. a task or a scheduled call.

**You should see:** the open one still shows its **follow-up / due date** as before. Only the **completed** ones show the `Outcome:` line. (If you complete that open one, it flips from showing a date to showing its outcome.)

---

## Your requirement #3 — the outcome appears straight away after recording

**Do this:** complete an activity and record its outcome.

**You should see:** the outcome appears in the list **immediately** — no page refresh needed. That's your confirmation it saved.

---

## The rule you asked for — a rep is FORCED to record an outcome

**Do this:** start to mark an activity done and try to finish **without** choosing an outcome.

**You should see:** the system **won't let you** — it asks for the outcome first. This is enforced on every way of completing (single, bulk, and edit), so no activity can be finished blank going forward.

---

## Bonus checks (also live on staging)

**Duration is real now.**
- *Meeting:* Log Activity → **Meeting**, set a **start and end time** (e.g. 10:00 → 10:45), save, open it → **Duration shows 45 mins** (worked out from the times).
- *Call:* Log Activity → **Call**, use the new **"Duration (mins)"** box (e.g. 15), save, open it → **Duration shows 15 mins**.
- *(Old calls stay blank — the system never captured call length before, so there's nothing to back-fill. New ones will carry it.)*

**Follow-ups always get an owner.** Complete an activity and schedule a follow-up → the follow-up task lands on someone's list (its owner), never blank/ownerless.

---

## One honest note (so the numbers make sense)

On the **live** system, about **75% of already-finished activities have no outcome** to show — because they were completed on the *old* version, before this rule existed. Those aren't hidden; there's genuinely nothing recorded for them, and we won't invent data to fill them. **Everything completed from now on** carries its outcome and shows it as above. The test on staging proves the behaviour going forward.

---

*If anything doesn't read the way you pictured it — wording, placement — say so and we'll adjust.*
