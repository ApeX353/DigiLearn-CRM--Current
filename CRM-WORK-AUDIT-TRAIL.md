# CRM Work — Audit Trail (from the live production bug tracker)

_Pulled directly from the production CRM bug tracker on 3 August 2026. Each row is a defect marked **resolved** with a dated resolution note — re-verifiable in the tracker at any time._

## Resolved defects (63)

| # | Ticket | Resolved (date) | Severity |
|---|--------|-----------------|----------|
| 1 | Activities | 2026-08-03 | medium |
| 2 | [DATA1] Six business days (10-17 July) are completely missing from every table - outage or | 2026-08-03 | high |
| 3 | [DUP1] Duplicate review queue is permanently empty — nothing ever writes a suspicion | 2026-08-02 | high |
| 4 | [N2] Requisition self-approval (segregation-of-duties gap) | 2026-08-02 | low |
| 5 | [QDL1] Sales reps must be able to download a quote, and downloads must appear in the audit | 2026-08-02 | medium |
| 6 | [SCHLEAD2] Create a lead from a school that has none - inheriting the school's details, an | 2026-08-02 | medium |
| 7 | [SCHLEAD1] Schools page: a school with no lead must offer "Create lead" from within the sc | 2026-08-02 | medium |
| 8 | [AUD-H01] Signing out does not actually end the session | 2026-08-02 | high |
| 9 | [AUD-H05] Side routes reach records the main list would have refused | 2026-08-02 | high |
| 10 | [DISC2] Daily call targets: 40 for a rep, 10 for a manager, reset at midnight | 2026-08-02 | medium |
| 11 | [SCH3] Show the decision maker under the school | 2026-08-02 | low |
| 12 | [API2] List pagination is unstable: no sort accepted (HTTP 400), offset paging under write | 2026-08-02 | high |
| 13 | [API1] Owner filters silently drop records: /activities?created_by_id= loses null-assignee | 2026-08-02 | high |
| 14 | [AUD-M06] The Leads by Stage chart on the dashboard is broken | 2026-08-02 | high |
| 15 | [DUP5] The duplicate lead checker shows everything and does not explain its suggestion | 2026-08-02 | medium |
| 16 | [QUOTE3] A quote can be saved with no validity date at all - 17 of 67 have none, so they c | 2026-08-02 | medium |
| 17 | [AUD-M01] Completing activities one at a time and in bulk follow different rules | 2026-08-02 | medium |
| 18 | [LNAME2] Capture and show the client's interest on a lead (what they want) | 2026-08-02 | medium |
| 19 | [SCH1] Duplicate SCHOOL records split one school’s leads across several parents | 2026-08-02 | high |
| 20 | [SCH2] A different city spelling creates a second school record | 2026-08-02 | high |
| 21 | [PH1] Duplicate check compares raw phone digits, so formats never match | 2026-08-02 | high |
| 22 | [NEXT4] A lead can only hold one next step - two are needed at a time | 2026-08-02 | medium |
| 23 | Next up task loses information recorded under outcome once task has been completed. | 2026-08-02 | high |
| 24 | [NEXT3] Scheduling a call or WhatsApp as the next step files it as already done | 2026-08-02 | high |
| 25 | [DEALS1] /deals silently returns ongoing deals only - 26 closed deals (US$346,465) hidden, | 2026-08-02 | high |
| 26 | Pipeline deals not opening | 2026-08-02 | critical |
| 27 | [QUOTE2] Quotes never expire - 34 quotes (US$397,863) are past their validity date but sti | 2026-07-29 | high |
| 28 | [SLAW1] SLA clock and breach alerts run through the weekend - sales does not work Sat/Sun | 2026-07-29 | high |
| 29 | API documentation is publicly exposed in production | 2026-07-29 | medium |
| 30 | Missing security headers on the web app (CSP, X-Frame-Options, etc.) | 2026-07-29 | low |
| 31 | API discloses its technology stack via X-Powered-By header | 2026-07-29 | low |
| 32 | Idle-lead alert repeats every 2 hours forever (~84 duplicate emails per lead per week) | 2026-07-29 | high |
| 33 | No brute-force protection on login - unlimited password attempts | 2026-07-29 | medium |
| 34 | CRITICAL: Anyone on the internet can register a working CRM account | 2026-07-29 | critical |
| 35 | [LNAME1] Lead names are being saved as the school name - 94 leads, accelerating since 07-2 | 2026-07-29 | low |
| 36 | [AUD1] Audit History always empty — nothing writes to audit_logs | 2026-07-29 | high |
| 37 | Invoice stays 'Paid' with a paid date after its payments are removed | 2026-07-29 | medium |
| 38 | Deleting or editing a payment never reverses the installment - installment stays marked pa | 2026-07-29 | high |
| 39 | CRITICAL: Payments marked fully allocated but no money is actually applied to installments | 2026-07-29 | critical |
| 40 | Any rep can open any other rep's deal (ownership check is a no-op) | 2026-07-29 | high |
| 41 | Any rep can edit or re-stage another rep's lead (no per-record authorization) | 2026-07-29 | high |
| 42 | Any rep can mark another rep's deal Won or Lost | 2026-07-29 | high |
| 43 | Bulk deal update authorizes with .some() instead of .every() - one owned deal unlocks the  | 2026-07-29 | high |
| 44 | All uploaded documents (contracts, POs, ID scans) are listable by any logged-in user | 2026-07-29 | high |
| 45 | [ACT4] Marking an old activity done rewrites the lead's contact date to today | 2026-07-29 | high |
| 46 | [AUD-H11] Two invoices raised at the same moment can get the same number | 2026-07-29 | high |
| 47 | [AUD-C05] A user-supplied mail server can be used to probe our own network | 2026-07-29 | very_critical |
| 48 | [AUD-C04] Public booking can confirm a time that was never offered, and can double-book | 2026-07-29 | very_critical |
| 49 | [AUD-C03] Creating a quote or invoice can change another rep's deal | 2026-07-29 | very_critical |
| 50 | [R8] Manager Glance lead stats 403 for the rep who owns the lead | 2026-07-26 | medium |
| 51 | [C2] Deal activity feed corrupted for deals that came from a lead | 2026-07-26 | high |
| 52 | [R13] Sidebar vanishes entirely if the RBAC fetch fails on login | 2026-07-26 | low |
| 53 | [R11] Settings gear shown to every role; endpoints are admin-only | 2026-07-26 | medium |
| 54 | [R10] sales_manager sees Users nav but the Staff page denies them | 2026-07-26 | medium |
| 55 | [R12] IDOR: any user can read anyone’s roles & permissions | 2026-07-26 | medium |
| 56 | [R7] sales_rep can export all leads via CSV | 2026-07-26 | medium |
| 57 | [R6] sales_rep can see every rep’s activity | 2026-07-26 | medium |
| 58 | [R5] Reports leak org-wide financials to sales_rep | 2026-07-26 | medium |
| 59 | [R4] GET /payments/:id is not owner-scoped (sales_rep IDOR) | 2026-07-26 | medium |
| 60 | [R3] manager role locked out of Payments and Collections | 2026-07-26 | high |
| 61 | [R1] sales_rep gets HTTP 500 on Quotes and Invoices | 2026-07-26 | critical |
| 62 | [R2] admin_support (prince) is 403-locked out of most of the app | 2026-07-24 | critical |
| 63 | [C1] Manager/admin “Assign to rep” is dropped on lead creation | 2026-07-22 | high |

## Triaged / reclassified (51)

_Feature requests and non-defects moved out of the open bug queue — also dated in the tracker._


## Totals

- Resolved defects: **63**
- Triaged/closed: **51**
- Total tracker items: **145**
