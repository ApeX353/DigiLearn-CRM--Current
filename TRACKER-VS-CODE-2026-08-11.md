# Prod bug tracker vs current code (`port-dube-github`) — 2026-08-11

162 tickets on prod: 28 open · 14 in_progress · 16 backlog · 104 closed-family.
The 58 active ones, compared line-by-line against the branch.

## Headline finding: Mr Dube's SERVER repo exists — our port is missing 3 of its features

The [PRODUCTS]/[DISCIPLINE]/[DEPLOY] tickets are Mr Dube's own deploy
instructions and cite **DigiLearnzw/crm-v2-server master @ f9d8ced** — a server
repo we assumed didn't exist when we decided to "build the server side
ourselves". Our S1–S5 rebuilt much of it (search, sort, SKU columns, idle
ranking, converted-lead deals), but his release also contains, per his own
tickets, three server features we did NOT build:

1. **Deal-birth task** — every new deal created with "Book the demo — {title}"
   (due +5 days, high priority) in the same transaction.
2. **Quote/invoice → deal automation** — creating a quote/invoice
   auto-converts the school's lead to a deal at Quote Submitted /
   PO-Contract Received, files the document on the deal, creates the day-3
   follow-up task. (Also fixes future QUOTE6-type orphans and half of QSYNC1.)
3. **BANT auto-tick** — decision-maker stakeholders and stated values
   auto-tick qualification.

**Decision needed (Mr Dube/prince):** fetch his server repo and port those
commits the same careful way, or build the three features ourselves to his
spec. Until then, staging's client shows his UI but those automations silently
don't happen.

Also from his [DEPLOY] ticket: his build hard-requires `lead_sla_config`
rows ("every lead creation 500s if empty") — **moot**: prod's table is
seeded (verified via API), and our server tolerates absence anyway. And his
release expects `enforce_next_step_on_completion = ON` — ours is still OFF;
with the ported client sending the next step atomically, it can now be
flipped ON (staging first) without the NEXT2 trap.

## A. Active tickets the branch FIXES (on staging; prod on sign-off only)

| Ticket | State in code |
|---|---|
| **NEXT2** (critical) + NEXT2-status | Fixed — close-the-loop dialog sends outcome+note+next step in ONE request; the 400 trap is structurally gone. Flip the setting on staging to prove it. |
| **[PRODUCTS]** | Delivered as S3 — sku/description columns via guarded migration 1780 (replaces his manual ALTERs), DTOs, UI, doc-line prefill. Robotics catalogue unblocks when shipped to prod. |
| **[DISCIPLINE]** | 2 of 3: idle-school ranking (S5) + converted-lead View Deal (S4) done; **deal-birth task missing** (server gap above). |
| **[DEPLOY]** | Client half fully delivered (his main @ 98642e3 = exactly the 15 ported commits). Server half partial (gaps above). |
| **DUP2** (high) | Fixed — lead field-level merge (earlier) + S2 generic school/contact merge that actually moves children. |
| **"failing to create a deal"** (= DEAL-GHOST1) | Fixed on branch — the client now surfaces the server's real gate message instead of a dead-end toast. |
| **SCH-ACT1 / ASGN2** | Today's walkthrough fixes, live on staging. |
| **ACT5** (partial) | Required follow-up dates stop NEW undated activities; the 2,364-row backlog still needs its data pass (db-ops scripts staged, ACT4 ordering rule applies). |
| **CSV2** (partial) | S2 Scan sweeps existing books for duplicate pairs; entry-time import guard still to verify separately. |
| **WANEZI1** (tooling) | The school-merge + lead-merge tools it needs now exist; the 4-record consolidation itself is a supervised data job. |

## B. Stale tickets — describe features ALREADY LIVE ON PROD, never closed

AUTO1, AUTO2, AUTO3 (backlog) · REBAL1 (in_progress) · AUTO-ASSIGN2
(in_progress, "HELD") — the auto-assign suite shipped to prod 06–07 Aug
(api 0.0.24→0.26) with exactly these rules. ASGN1 (rep-created leads
unassigned) and MGRBUG1 (managers triage full list) have been implemented
for weeks. The OPS CapRover-password ticket (filed this morning) is
resolved — password recovered into CREDENTIALS.local.md. **All seven can be
honestly resolved/closed on the tracker.**

## C. Genuinely open — untouched by the port

- **Security/audit series:** AUD-H02 (forced password change ignorable),
  AUD-H03 (2FA guessable, unthrottled), AUD-H06, AUD-H08/H09 (calendar
  trust/timezone), AUD-H10 (split history), AUD-H13 (in_progress —
  `USER_EMAIL_CREDENTIALS_KEY` still unset; the warning shows on every local
  boot), AUD-M10, R9 (RBAC toggles don't enforce), cookie Secure/SameSite.
  The plain-HTTP ticket is likely stale (HSTS shipped 07-29) — verify then close.
- **Data-quality/metrics:** METRICS1, HYG1, HYG2, C8, N3, QUOTE4 (currency),
  QUOTE5, QUOTE6 (25 orphan quotes need a backfill; his automation prevents
  new ones once ported), QUOTE1 (draft-vs-Accepted state — not addressed),
  IMPORT2, CON1 + CSV6 (second phone), CSV4 (verify against the shipped
  importer), CSV7.
- **Workflow asks:** ESC1 (deal escalation), REA1 (reassign reason), QSYNC1
  (partially covered by his automation once ported), STAKE1, DUP3 (verify),
  DUP6 (partial: merges now audit-logged + loser soft-deleted; no undo UI),
  HEAD1 (needs clarification), NUM1, EMAIL1, INV2, REM-ERP (future).

## Recommended next actions

1. Decide on Mr Dube's server repo (port vs rebuild the 3 missing features).
2. Resolve the 7 stale tickets in section B (honest — the features are live).
3. Flip `enforce_next_step_on_completion` ON on staging and test the new flow.
4. After prod ships (on explicit sign-off): resolve the section-A tickets.
5. Schedule the data passes: ACT5 backlog, QUOTE6 backfill, WANEZI1 merge.
