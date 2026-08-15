# Scrum Staging

**Batch status:** Closed for implementation and staging verification on
2026-08-12. The next body of work is a separate batch.

## Included work

- AUTO-EQUITY automatic catch-up: fairness first, territory second; manager
  redirect remains a deliberate override and may target the manager.
- Existing pending auto-assignment proposals remain untouched; Reject and safe
  Undo behavior remain available.
- Optional customer email with server-side rejection of shared/internal and
  active-staff identities; staff identity is excluded from duplicate evidence.
- Every sales-rep disqualification requires a reason, explanation and manager
  approval; approval applies the status and records decision evidence.
- Lead detail always shows status and exposes recorded disqualification
  evidence, with honest labels for incomplete legacy records.
- Lead tabs are `All Leads | Active Leads | New | Contacted | ...`. All Leads
  is the default full view; Active Leads means all non-terminal visible leads,
  including unassigned leads.
- The read-only historical disqualification audit/report and the previously
  audited safe portions of partially delivered production tickets.

## Verification and release record

- Main implementation commit created locally: `5df724b`.
- Initial staging verification trail commit created locally: `6f53578`.
- Five focused server suites passed: 42 tests.
- Server and client production builds passed.
- `api-staging` and `staging` CapRover builds completed with `failed=false`.
- Initial release bundle: `index-RH8Q0W0v.js`.
- Corrected lead-tabs bundle: `index-Cv7ETPf1.js`; verified to contain both
  `All Leads` and `Active Leads`.
- Authenticated read-only staging checks returned the same Active count (1,457)
  from the list query and status-count endpoint. The approval queue was read
  without mutation.

## Boundaries

- Production was not deployed to or mutated.
- The existing production approval queue was not changed.
- The lead-tabs correction remains an uncommitted local change by instruction.
- No Git remote was changed. An earlier attempted GitHub push was rejected with
  HTTP 403; no retry is authorized. Do not push this batch to Git unless the
  user gives a new explicit instruction.

## Detailed trail

See `BUGFIXES.md`, `CODEBASE-SKELETON.md`,
`PROD-OPEN-TICKETS-AUDIT-2026-08-12.md`, and
`db-ops/disqualified-leads-audit-READONLY.sql`.

## Separate local batch — 2026-08-13

**Status:** Implementation verified locally and deployed to staging on
2026-08-13. Authenticated per-role workflow testing remains the manual sign-off
step before any production request.

- Pipeline summary separates total/open deals, pending collections and open
  pipeline value; Won uses linked non-cancelled invoice totals; stage overdue
  and calculated-health denominators now match the board language.
- Follow-up ownership is automatic (deal owner, lead owner, entrant fallback),
  with no manager/admin assignment picker.
- Every completed actionable activity requires its own next-step decision even
  when another task exists. Refresh restores an already-completed obligation.
- Task, Call, Email, Meeting and WhatsApp next steps now retain matching subtype
  rows; phone/email evidence is validated and scheduled email is not dispatched.
- Planned work rejects past timestamps while completed historical work may keep
  its original timestamp.

Local verification: 10 focused server suites / 63 tests passed; server and
client production builds passed. No Git push, staging deploy, production read,
database write or approval-queue mutation occurred in this verification pass.

Staging release: `api-staging` and `staging` both finished with
`building=false, failed=false`. The protected API returned 401 without a token,
confirming the promoted service is reachable and still enforces authentication.
The promoted client bundle is `index-CilVPGYa.js` (2,817,783 bytes), points to
`api-staging.digilearncrm.work`, and contains the required All/Active Leads,
pipeline totals, past-time guard, mandatory next-step and bulk-obligation
markers. No Git push or production action occurred. Existing approval rows were
not mutated. There is no plaintext staging-user password in the local credential
files, so authenticated manager/rep browser walkthroughs were not fabricated;
they remain the explicit manual staging check.

### Local correction after staging walkthrough - NEXT-CONTACT1

The What Happens Next form now selects the actual person for Call, WhatsApp
and Email; a sole contact is automatic, multiple contacts are selectable, and
the primary contact is no longer hidden by stakeholder rows. A missing number
or email opens an inline field and is saved to that contact before scheduling.
The API carries and validates the selected contact in the atomic next-step
payload. Client/server production builds and all 27 server suites / 108 tests
pass. On 2026-08-14 the correction was deployed directly to `api-staging` and
`staging` without Git. Both CapRover apps finished with
`building=false, failed=false`; the protected API returns 401 without a token.
Public bundle `index-Cuxfe7_o.js` contains the new picker and missing-detail
save flow. Authenticated manager/rep walkthrough remains the manual sign-off
step. Production and the approval queue were untouched.
