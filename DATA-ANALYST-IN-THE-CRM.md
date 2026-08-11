# The Data Analyst in the DigiLearn CRM
*Prepared for Mrs Mpofu — how a newly-joined data analyst can **use** and **contribute to** the CRM.*

## In one line
The CRM is already a rich, structured record of every school, lead, conversation, quote and payment. A data analyst turns that record into **decisions** — who to chase, which campaigns pay off, which reps need help, what next quarter looks like — and in return keeps the data **clean and trustworthy**.

---

## Part 1 — How they USE the CRM (turn data into insight)
The analyst doesn't operate the CRM like a rep; they read from it and turn it into answers. What's already captured to work with:

- **Leads & schools** — every school, its province/district, type (mission vs government), urban/rural, and the lead's stage in the funnel.
- **Activities** — every call, meeting, WhatsApp and demo: who, when, outcome.
- **Pipeline & money** — deals, quotes, invoices, instalments, payments.
- **Campaigns** — events (e.g. NASH), their costs, and which leads/deals they sourced.
- **Reps & territories** — who owns what, workload, SLA timers.

**Questions they can answer from day one:**
1. **Conversion funnel** — of 100 new leads, how many reach Contacted → Qualified → Deal → Won, and *where do we leak?* Split by rep, province, school type, and campaign source.
2. **Rep scorecard** — leads carried, activities per day, time-to-first-touch, SLA compliance, win rate. (We can already see the imbalance — one rep on 521 leads while others sit far lower.)
3. **Campaign ROI** — cost-per-won-deal per event. *Did NASH pay for itself?* (Campaigns carry their own cash requisitions + lead attribution.)
4. **Territory & geography** — where do we win or lose? Urban vs rural, mission vs government, by province.
5. **Activity effectiveness** — do demos convert better than calls? How many touches to close?
6. **Collections & cash flow** — overdue invoices, instalment aging, expected cash over the next 30/60/90 days.
7. **Forecast** — pipeline value weighted by stage/health → likely revenue this quarter.

---

## Part 2 — How they CONTRIBUTE (make the CRM better)
- **Data quality & trust** — dedupe schools/leads (there's a duplicate-review queue), backfill gaps (we recently restored **2,254** missing activity dates and **4,988** missing assignees), standardise provinces/cities, flag anomalies. Clean data = numbers everyone can rely on.
- **Trustworthy metrics** — define and validate the KPIs so "win rate" or "qualified lead" means the same thing to everyone. The analyst owns the definitions.
- **Dashboards & reports** — build the executive views you and Mr Dube actually need (funnel, rep scorecards, campaign ROI, forecast) instead of raw tables.
- **Smarter lead assignment** — exactly the work in progress now: model territory balance, recommend rebalances, keep reps inside the ≤50-lead fairness gap.
- **Lead scoring & prioritisation** — a data-driven "chase this first" score, beyond today's hygiene score.
- **Early warning** — at-risk deals, stalled leads to reactivate, reps slipping on SLA.
- **Feedback into the product** — findings tell us what to capture next (e.g. we found call *durations* were never recorded) and which features matter.

---

## Part 3 — What they need (access)
- A **read-only "analyst" role** in the CRM (reports + dashboards). There's no dedicated analyst role today — recommend adding one so they see everything but can't accidentally change records.
- For deep/ad-hoc work: **read-only access to a copy of the database** (a read replica or nightly export) so they can run their own queries without touching live data.
- Their outputs flow back **into** the CRM as dashboards/reports, plus a short weekly "what the numbers say" note.

---

## A sensible first month
| Week | Focus |
|---|---|
| 1 | Data-quality audit (dupes, gaps, standardisation) + the conversion funnel |
| 2 | Rep scorecards + territory/workload analysis (feeds auto-assign) |
| 3 | Campaign ROI (start with NASH) + collections / cash-flow view |
| 4 | First revenue forecast + a lead-scoring prototype |

---

## Bottom line
A data analyst turns the CRM from a **system of record** into a **system of decisions** — and keeps it honest.
**Use:** funnel · rep performance · campaign ROI · forecast.
**Contribute:** clean data · trustworthy metrics · dashboards · smarter assignment · early warnings.
