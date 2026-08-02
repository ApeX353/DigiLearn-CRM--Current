# How the lead system works — please read, edit, and send back

Hi Kim — this describes, in plain words, how the lead **import → approval →
auto-assign** system works right now and what we're proposing next. Under each
part there's an **✎ Your notes** line. Please **change anything that's wrong,
add anything missing, and cross out anything you don't want**, then send it
back. Where you see a **question**, just type your answer.

Don't worry about being technical — describe it the way you'd explain it to a
new rep.

---

## 1. Bringing leads in (Import)

- You click **Import Leads** and choose your Excel file.
- You can **link the import to a campaign** — pick an existing one (e.g. NASH
  2026) or create a new one right there. Every lead from that file then shows
  that campaign as its **Source**.
- The system reads the file and **does NOT create any leads yet**. It stages
  them for you to approve first (so a mistake never goes straight into the CRM).
- Right now it **skips "peri-urban" schools** — it only takes Urban and Rural.
  You said peri-urban should be **included**.
  - **Question:** When a school is peri-urban, should we just treat it as
    Urban, as Rural, or keep it labelled "Peri-urban"? → _your answer:_
- **✎ Your notes:**

## 2. Checking leads before they go live (Approval Queue → Import approvals)

- The staged import shows up under **Approval Queue → Import approvals**.
- It shows totals: how many rows, how many are **ready**, how many are
  **possible duplicates**, and how many are invalid (missing info).
- Each row is checked against schools/leads already in the CRM and against
  other rows in the same file. **Duplicates are flagged** and set to "Skip" by
  default — you can switch any row back to "Include".
- You then **Approve** (the leads get created) or **Reject** (nothing is
  created). Approving a big file now happens in the background so it doesn't
  freeze.
- **New idea (not built yet):** let you **tick many rows at once** to
  Include/Skip in bulk, instead of one at a time.
  - **Question:** Yes to bulk tick-boxes? → _your answer:_
- **✎ Your notes:**

## 3. Sharing leads out to reps (Auto-assign)

- From the **New** leads, you press **Run auto-assign**. It **suggests** who
  each lead should go to — it does **not** assign anything until you approve.
- **Territory is a hard rule:** a lead only goes to a rep who covers that
  province. **Manake never gets Mashonaland; Tanya never gets Bulawayo/Mat.**
- If two reps share a province, the one with **fewer leads** gets the next one,
  so they stay balanced (aim: within **50 leads** of each other).
- You choose how many to do at once: **50 / 100 / 250 / 500 / All**.
- **✎ Your notes:**

## 4. Managers receiving leads too (optional)

- There's a switch in **Settings → Compliance & Controls**: **"Include
  managers in auto-assign"**.
  - **Off** = only reps (Manake, Tanya) receive.
  - **On** = managers receive too, sharing their office's area: **Kim +
    Manake = Bulawayo office**, **Busi + Tanya = Mashonaland office**.
- There's a **cap** so a manager only gets so many before the rest go to the
  rep.
  - **Question:** What should the manager cap be (e.g. 30? 50?) → _your answer:_
- **✎ Your notes:**

## 5. Moving leads between reps (Redirect / Rebalance)

- On any suggested assignment you can **Redirect** it to a rep you choose
  (Kim, Busi, Manake, Tanya).
- **New idea (not built yet):** a proper **rebalance** — move a batch of leads
  from **Manake → Tanya** (or the reverse) while keeping them **within the
  50-lead gap**, instead of moving one at a time.
  - **Question:** Should rebalance move leads **only within the same
    territory** (so nobody gets an area they don't cover), or is it OK to move
    any lead? → _your answer:_
- **✎ Your notes:**

## 6. What you and the reps see (counts)

- The **Approval Queue** nav shows a **number** of items waiting, and chimes
  when new work comes in.
- When you run auto-assign, you see a preview per rep: **"will gain X"** and
  their new total.
- **New idea (not built yet):** each **rep** sees on their own screen **how
  many leads they have now** and **how many they'll have after** an auto-assign.
  - **Question:** Should reps see this before you approve, or only after? →
    _your answer:_
- **✎ Your notes:**

## 7. Anything else you want

You mentioned there's **more to add**. Please list it here in your own words —
even rough notes are fine. We'll turn whatever you write into how the system
behaves.

- _..._
- _..._
- _..._

---

**When you're done:** save this file (or just reply with your edits) and send
it back. We'll build to exactly what you've written here — no guessing.
