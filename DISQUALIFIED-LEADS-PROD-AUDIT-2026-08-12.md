# Production disqualified-lead audit — 2026-08-12

## Executive result

The live database currently contains **234** non-deleted Disqualified leads,
not 224. The 224 figure could not be reproduced from the current production
state and should not be quoted as today's total.

Every current Disqualified lead has:

- a stored reason in `leads.reason`;
- a recoverable Disqualified status transition in `activity_logs`;
- a recoverable transition actor and timestamp.

However, only **25 of 234** have a non-empty general lead note. **209 lack a
supporting note**, so the picker value tells the category but usually not the
facts behind the decision. Missing explanations must be investigated; they
must not be invented in a backfill.

This was a SELECT-only production audit. No lead, approval request, import
batch, assignment proposal, or other production row was changed.

## Reason distribution

| Stored reason | Leads | With notes | Missing notes |
|---|---:|---:|---:|
| No budget | 149 | 4 | 145 |
| Cannot reach contact | 22 | 2 | 20 |
| Not interested | 18 | 12 | 6 |
| Duplicate entry | 14 | 2 | 12 |
| Wrong contact/school | 14 | 2 | 12 |
| Already has solution | 7 | 3 | 4 |
| Cant afford boards at the moment | 2 | 0 | 2 |
| Duplication | 2 | 0 | 2 |
| Six other legacy free-text reasons | 6 | 0 | 6 |
| **Total** | **234** | **25** | **209** |

The six one-off values are: `Duplication- incorrect contact`, `HEAD RETIRED,
FINE CONTACT FOR NEW HEAD`, `Manake's`, `Our prices are too high than their
expectation`, `Referred to the administrator of Ocean Group of Schools`, and
`Struck a deal with competitor`.

## When and by whom

| Month of recoverable transition | Leads |
|---|---:|
| March 2026 | 13 |
| April 2026 | 18 |
| May 2026 | 50 |
| June 2026 | 136 |
| July 2026 | 17 |

| Recorded actor | Leads |
|---|---:|
| manake dube | 172 |
| Tanya G | 56 |
| kim Mpofu | 4 |
| Prince Banda | 2 |

The recoverable transition window is 10 March through 9 July 2026. These are
audit-log actors, not proof that a sales manager approved the decision; the
legacy workflow did not consistently capture approval as a separate event.

## Active Leads decision baseline

Kim's proposed definition—assigned and in New, Contacted, Qualified or
Nurture—currently produces **1,289 Active Leads**:

| Status | Total | Assigned/active | Unassigned/excluded |
|---|---:|---:|---:|
| New | 923 | 409 | 514 |
| Contacted | 814 | 763 | 51 |
| Nurture | 110 | 109 | 1 |
| Qualified | 9 | 8 | 1 |
| Disqualified | 234 | excluded | 2 unassigned |
| Converted | 32 | excluded | 2 unassigned |

## Reproducibility

The exact SELECT-only audit is
`db-ops/disqualified-leads-audit-READONLY.sql`. It produces aggregate coverage,
reason distribution, audit recoverability, and the list of records whose
reason or note is incomplete. It contains no write statement.
