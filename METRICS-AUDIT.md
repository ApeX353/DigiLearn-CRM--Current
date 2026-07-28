# Metrics Audit — 2026-07-28

**Why.** Numbers across the dashboards disagree with what people see on
screen. This audit takes each figure and asks three questions: what does
the label promise, what does the code actually compute, and does the data
support it? Checked against the live production API and against the
pristine restore of the **previous** CRM, which shows whether the data a
metric needs ever existed.

**The pattern, stated once.** Almost every fault is the same shape: *the
label does not describe what is being counted.* Either the measure uses a
proxy for the thing it claims to measure, or it counts the wrong rows.
None of these are crashes — every one returns a confident, plausible,
wrong number.

---

## 1. Qualification KPI — counts records, not leads · **CONFIRMED**

The executive dashboard reads **"Total leads 2,419 · Qualified 52 ·
Average score 4.2"**. Production holds **1,753 leads**.

The query starts from the qualification table and joins the lead
(`dashboard.service.ts`, qualification block), so `COUNT(*)` counts
**qualification records**. In the original database there are **2,013
qualification rows across only 1,278 distinct leads** — some leads carry
three. So:

- leads with several qualification records are counted several times;
- the **443 leads with no qualification record are invisible** — they
  cannot appear in the denominator at all;
- "Total leads" overstates by roughly **670**.

The score compounds it. `qualification_score` runs **0–100**; the average
across all rows is **4.96**. So "4.2" is not a score out of 5 — it is
essentially zero out of a hundred, dragged down by empty duplicate rows.

**Effect:** the qualification panel cannot be read as "how well is the
pipeline qualified". It is a count of form records.

---

## 2. Daily contact target — measures first touches, not effort · **CONFIRMED**

Labelled **"Leads Contacted vs Target"** against a target of 40
(`compliance.targets.daily_contacts_per_rep = 40`). It counts **distinct
leads whose first-ever contact happened today** (`activity-discipline.service.ts`).

- 40 calls to leads already spoken to score **zero**.
- Five calls to the same school count as **one**.
- A WhatsApp or email counts the same as a call — the measure takes
  call, email, WhatsApp and meeting equally.
- On the team view the target is 40 × **every active user**, including
  admins, finance and managers — not 40 × reps.

**Effect:** it measures *new leads opened*, while the rule it is
displayed against ("40 calls a day") is about *effort*. There is no
separate manager target of 10 anywhere in the system.

**Also:** the day boundary uses the database's current date. The server
runs UTC and the business is UTC+2, so the day appears to roll over at
02:00 local. Unconfirmed but that is how it reads.

---

## 3. Deals list hides closed business · **CONFIRMED** (DEALS1)

`GET /deals` returns only ongoing deals, with nothing in the response
saying so. The original database holds **31 deals: 10 ongoing, 18 won,
3 lost** — so two thirds are invisible to anything reading that list,
including reports built on it.

---

## 4. Quote lifecycle — the data was never there · **CONFIRMED** (QUOTE2, QUOTE3, QUOTE5, QUOTE6)

From the original database, 60 quotes:

| Fact | Count |
|---|---|
| Status Draft | 51 |
| Status Accepted | 8 |
| Status Expired — **ever** | **1** |
| No validity date at all | **17** |
| Not attached to any deal | **20** |
| Purchase order marked received | **1** |

Quotes never expire on their own, 17 cannot expire because they carry no
date, and 20 are invisible to every pipeline and forecast because they
belong to no deal. Any funnel or revenue figure built from deals is
therefore missing a third of the quoted business.

---

## 5. Currency — the ticket overstates it, the gap is real · **CORRECTION**

QUOTE4 says every deal is stored as ZAR. The original data shows
**25 ZAR and 6 USD** — mixed, not uniform. The substantive problem stands
and is worse than a wrong label: **quotes carry no currency field at
all**, so a quote total is a bare number with nothing recording what it
is denominated in. Every money figure that mixes deals and quotes is
adding unlabelled units.

---

## 6. Completed activities with no completion time · **CONFIRMED**

**93 activities are marked completed but carry no `completed_at`.** Every
metric keyed on completion date — the daily contact count, outcome
compliance, the hygiene score's "last five completions" — silently skips
them. They are not wrong so much as absent.

---

## 7. Checked and sound

- **`Nurture` is a properly defined lead status** (96 leads on
  production). An earlier assumption that it was undefined was wrong.
- **SLA breach counts are consistent** between the old database (223 of
  1,721) and production today (219 of 1,489) — this figure can be
  trusted.
- **Lead status spread** matches between systems.

---

## 8. Not yet examined

Funnel health, demo statistics, lead conversion, top-performing products,
schools bought, nurture follow-ups, collections due. The pattern above
suggests each should be read against its own data before it is trusted.

---

## What to do about it

1. **Fix the qualification KPI first** — it is the most visibly wrong
   number on the owner's dashboard and the fix is small: count leads,
   left-join qualification, and deduplicate the records.
2. **Decide what "40 a day" means** before touching the discipline
   metric. If it means calls made, that is a new measure — counting
   completed call activities per rep per day — not a correction to the
   existing one. If it means new leads opened, the label needs changing
   and the team target needs dividing by reps rather than all users.
3. **Stop the deals list hiding closed deals**, since other reports build
   on it.
4. **Give quotes a currency and a mandatory validity date** before
   automating expiry, or the automation will skip the 17 that have none.
5. **Treat any number not in section 7 as unverified** until it has been
   read against its data the same way.
