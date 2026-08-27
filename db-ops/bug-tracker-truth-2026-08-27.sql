-- ============================================================================
-- Make the bug tracker true to the code that is actually deployed.
-- 27 August 2026.
--
-- WHY THIS EXISTS
-- The tracker was last reasoned about before the 26 August production deploy.
-- Several tickets are still open against code that has since shipped, two carry
-- figures that are now wrong by an order of magnitude, and one names migrations
-- that were renumbered on our lineage. This script corrects the record. It does
-- NOT close anything: work that looks fixed in the code moves to `verification`
-- so a human still confirms the behaviour before it is called done.
--
-- WHAT IT CHANGES
--   4 tickets  open        -> verification   (fix is in the deployed code)
--   1 ticket   medium      -> high           (R9, severity understated)
--   9 tickets  description appended          (correction / evidence, dated)
--
-- Descriptions are APPENDED to, never overwritten. The original reports were
-- true when they were written; a correction is a new paragraph, not a rewrite.
--
-- Evidence for every claim below is in BUG-TRACKER-CODE-CHECK-2026-08-27.md.
-- Read that first. Then run the -DRYRUN script. Then this. -UNDO reverses it.
--
-- Lifecycle stamping matches BugReportsService.update() exactly:
--   entering `verification` sets verified_at (once) and leaves resolved_at NULL
--   -- verification is not a solved state;
--   moving off `open` sets triaged_at (once).
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------- undo snapshot
DROP TABLE IF EXISTS db_ops_bug_truth_20260827_undo;

CREATE TABLE db_ops_bug_truth_20260827_undo AS
SELECT id, status, severity, description, resolution_note,
       resolved_at, verified_at, closed_at, triaged_at, updated_at
  FROM bug_reports
 WHERE id IN (
   '95702d58-928e-48ea-9b42-76b2487ae9aa',  -- Approval bypass
   'bfdc8c44-8971-4960-92a4-fb9e831e1a59',  -- Disqualification reasons
   '7fbc2f5b-935e-4a85-9f3c-23d5b7c318bc',  -- CSV2
   '51d8efb7-cadb-45cf-91da-1da5d1b41520',  -- Deploy ref / 9a04225
   'd821f946-5706-4261-b7fc-ff8f02b768a9',  -- QUOTE4
   '20d9d3bc-02b2-44a3-b407-1eb131b04279',  -- ACT5
   '8a1b1569-b7b0-4f9f-8d45-43662ac82de7',  -- DUP3
   'a23a05d7-c505-47e1-80e6-ceff1ab3ea51',  -- AUD-H03
   '564dd615-058c-4081-8e22-8d51b109def1',  -- Ruvheneko invoices
   '15c671de-34c3-4384-9470-5f6412c71953',  -- Ruvheneko convert
   'b53e7979-eb29-4513-9e16-6c0bd4180f1f',  -- R9
   '5a34bc4e-09a7-49b3-94ba-3c8f875a8896',  -- WANEZI1
   '5048516d-c1af-4802-b9ea-1a7599a4d67b',  -- AUD-H02
   'b6ba09af-a3f4-4d4f-99c1-bf3c21e79a80'   -- won-deal backfill
 );

-- Refuse to run against a database that is not the one this was written for.
DO $guard$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM db_ops_bug_truth_20260827_undo;
  IF n <> 14 THEN
    RAISE EXCEPTION
      'Expected 14 target tickets, found %. Wrong database, or the tracker has moved on. Nothing changed.', n;
  END IF;
END
$guard$;

-- ============================================================================
-- 1. FIXED IN THE DEPLOYED CODE -> verification (not closed: needs a human test)
-- ============================================================================

-- 1a. Approval bypass -- the guard the ticket says is "PENDING DEPLOY" is live.
UPDATE bug_reports SET
  status = 'verification',
  verified_at = COALESCE(verified_at, now()),
  triaged_at  = COALESCE(triaged_at, now()),
  resolution_note = $note$Fix is in the deployed code (verified 27 Aug 2026 against dube-aug2324 = production).
leads.controller.ts:612 returns 403 when a non-manager sends status=Disqualified on
PATCH /leads/:id/status; every other transition a rep makes there is untouched. The
ticket said "FIX SHIPPED, PENDING DEPLOY: server commit 5142631" -- that deploy went
out on 26 Aug.

TO VERIFY BEFORE CLOSING: as a sales rep, call the raw endpoint with Disqualified and
expect 403. Then disqualify through the dialog and confirm a lead_reversal_requests
row is written -- the original evidence was that ZERO tactical rows had ever been
created against 234 disqualified leads, so the gate working end to end is the real test.

RAISE BEFORE CLOSING: the guard admits 'admin' and 'sales_manager' only. admin_support
is NOT on the list and so cannot disqualify by this path either. If admin_support is
meant to hold full triage, that is a new gap and this ticket should not close until
it is decided.$note$,
  updated_at = now()
WHERE id = '95702d58-928e-48ea-9b42-76b2487ae9aa';

-- 1b. Disqualification reasons -- the "uncommitted" work is committed and live.
UPDATE bug_reports SET
  status = 'verification',
  verified_at = COALESCE(verified_at, now()),
  triaged_at  = COALESCE(triaged_at, now()),
  resolution_note = $note$Fix is in the deployed code (verified 27 Aug 2026).
The ticket noted an implementation "ready UNCOMMITTED in the working tree". It is now
committed and deployed: the disqualification-summary endpoint exists, the aggregate
breakdown strip renders at leads-management-page.tsx:615 ({r.reason} x{r.count}), and
the lead page shows "Why: {lead.reason}" at view-lead-page.tsx:649.

TO VERIFY BEFORE CLOSING: open the Disqualified tab as a manager, confirm the breakdown
appears and the counts look sane; open a disqualified lead and confirm its reason shows.$note$,
  updated_at = now()
WHERE id = 'bfdc8c44-8971-4960-92a4-fb9e831e1a59';

-- 1c. CSV2 -- the importer does dedupe now.
UPDATE bug_reports SET
  status = 'verification',
  verified_at = COALESCE(verified_at, now()),
  triaged_at  = COALESCE(triaged_at, now()),
  resolution_note = $note$Fix is in the deployed code (verified 27 Aug 2026).
leads-xlsx-import.service.ts step 2 is an explicit "Dedup-check against existing
schools/leads and within the batch" (flagDuplicates), and any row flagged duplicate
defaults to 'skip' rather than 'approve'. The batch summary carries duplicate_count.

TO VERIFY BEFORE CLOSING: import a sheet containing (a) a lead already in the CRM and
(b) the same row twice inside the file. Both should arrive pre-marked skip, and the
duplicate count should reflect them.$note$,
  updated_at = now()
WHERE id = '7fbc2f5b-935e-4a85-9f3c-23d5b7c318bc';

-- 1d. Deploy ref -- the missing commit's CONTENT is live; only its hash is absent.
UPDATE bug_reports SET
  status = 'verification',
  verified_at = COALESCE(verified_at, now()),
  triaged_at  = COALESCE(triaged_at, now()),
  resolution_note = $note$Content is live as of the 26 Aug deploy (verified 27 Aug 2026).
9a04225 ("Close-the-loop: cheaper honesty") touched three client files. Its distinctive
bulkIds bulk-completion feature is present in the deployed client: declared at
use-activity-completion-store.ts:44 and used 8 times in activity-completion-dialog.tsx.

IMPORTANT, AND PROBABLY THE ROOT OF THIS TICKET: the commit HASH is not an ancestor of
the deployed branch, so an ancestry check (git log / merge-base) reports it as missing.
It reached production as ported content on a different lineage. Across these repos patch
CONTENT is the truth and ancestry is not -- `git cherry` compares content, `git log` does
not. Any future "is commit X deployed?" question must be answered that way.

TO VERIFY BEFORE CLOSING: exercise bulk activity completion in the UI.$note$,
  updated_at = now()
WHERE id = '51d8efb7-cadb-45cf-91da-1da5d1b41520';

-- ============================================================================
-- 2. STALE FIGURES -- correct the record without erasing the original report
-- ============================================================================

-- 2a. ACT5: the headline is out by roughly 10x after August's cleanup.
UPDATE bug_reports SET
  description = description || $note$

--- CORRECTION, 27 Aug 2026 -------------------------------------------------
The figures above were true on 28 July and are now badly out of date. Measured
against the 25 August production dump, BEFORE the deploy that carried migrations
1781 BackfillLoggedInteractionsAsCompleted and 1782 MirrorNaturalDatesOntoActivities:

    open undated activities   2,364  ->    272
    leads affected              898  ->    198

Both migrations landed on 26 August and should have cut it further again.

NEXT STEP: re-measure on production now, then either close this or restate it with
real numbers. A "2,364" headline on what is nearer a 272-item problem distorts every
planning conversation it appears in.$note$,
  updated_at = now()
WHERE id = '20d9d3bc-02b2-44a3-b407-1eb131b04279';

-- 2b. The backfill ticket names migrations that were renumbered on our lineage.
UPDATE bug_reports SET
  description = description || $note$

--- CORRECTION AND BLOCKER, 27 Aug 2026 -------------------------------------
PART 1 (deploy): DONE, 26 August.

PART 2 (won-deal stage backfill): BLOCKED, and cannot run as written.
backfill-won-deal-stages.js has nothing to target. getTerminalStageKind() matches a
stage whose name contains 'won', 'lost' or 'commissioned', and the Sales Pipeline has
no such stage -- 0 active stages match. 28 won and 3 lost deals are still parked on
non-terminal stages (28 on Delivery & Installation; one each on Committee Review,
Implementation & Delivery, Quote Submitted). Closing a deal therefore still does not
move its card, which is the very thing the deploy was meant to fix.
DECISION NEEDED: add a Won stage and a Lost stage to the Sales Pipeline first.

MIGRATION NUMBERS ARE WRONG ON THIS TICKET. It names 1772 / 1773 / 1774. On our
lineage those were renumbered to avoid collisions:
    1781 BackfillLoggedInteractionsAsCompleted
    1782 MirrorNaturalDatesOntoActivities
    1785 QualificationUniquePerLeadAndArchiveHygiene
and 1784 was cut out of the migrations entirely into
db-ops/cancel-duplicate-march-invoices.sql, already run by hand.
Anyone verifying by number will look for migrations that do not exist.$note$,
  updated_at = now()
WHERE id = 'b6ba09af-a3f4-4d4f-99c1-bf3c21e79a80';

-- ============================================================================
-- 3. PARTLY DONE -- say which half landed, so the ticket is not read as untouched
-- ============================================================================

-- 3a. QUOTE4: deals fixed going forward, quotes untouched.
UPDATE bug_reports SET
  description = description || $note$

--- PARTIAL PROGRESS, 27 Aug 2026 -------------------------------------------
DEALS -- fixed for new records. Production now holds 13 USD deals against 29 ZAR, so
new deals are taking the configured currency rather than a hardcoded ZAR. The 29
historical ZAR rows have NOT been relabelled.

QUOTES -- untouched. The quotes table still has NO currency column at all, so a quote
is still a bare number with nothing stating what it is denominated in.

REMAINING WORK: (1) relabel the 29 historical deals; (2) add a currency to quotes.
db-ops/currency-relabel-zar-to-usd.sql exists for (1) but has not been run on prod.$note$,
  updated_at = now()
WHERE id = 'd821f946-5706-4261-b7fc-ff8f02b768a9';

-- 3b. DUP3: detection exists, blocking does not.
UPDATE bug_reports SET
  description = description || $note$

--- PARTIAL PROGRESS, 27 Aug 2026 -------------------------------------------
Detection exists; blocking does not. There is a DuplicateDetectionService, but
leads.service.ts:530 surfaces the near-duplicate AFTER the lead is committed
("after the lead is committed, surface any near-duplicate"). This ticket asked for a
guard on the create form, i.e. before the save.

DECISION NEEDED: is detect-then-flag enough, or should create BLOCK the way deal
creation now does under recording rule 6 (409 + an explicit "create anyway" confirm)?
Rule 6 is a working precedent for the blocking pattern if that is what is wanted.$note$,
  updated_at = now()
WHERE id = '8a1b1569-b7b0-4f9f-8d45-43662ac82de7';

-- 3c. AUD-H03: one half addressed, one half stands. Kept as ONE ticket at high.
UPDATE bug_reports SET
  description = description || $note$

--- PARTIAL PROGRESS, 27 Aug 2026 -------------------------------------------
This ticket makes two claims and they now have different answers.

"PREDICTABLE" -- appears addressed. two-factor.service.ts generates codes with
randomBytes/randomInt from node crypto, not Math.random.

"GUESSED WITHOUT LIMIT" -- STANDS, and is why this stays open at high. There is no
attempt counter, throttle, lockout or rate limit anywhere in that service. A code can
still be brute-forced; secure generation does not help if guessing is unlimited.

REMAINING WORK: rate-limit and lock out 2FA verification attempts.$note$,
  updated_at = now()
WHERE id = 'a23a05d7-c505-47e1-80e6-ceff1ab3ea51';

-- 3d/3e. Ruvheneko x2: the data mess is cleaned; the symptoms need a retest.
UPDATE bug_reports SET
  description = description || $note$

--- UNDERLYING DATA FIXED, RETEST NEEDED, 27 Aug 2026 -----------------------
The duplicate records behind this were merged on 25 August: of four Ruvheneko school
records, three are now soft-deleted and one survives, with 2 deals and 5 invoices
intact on the survivor.

RETEST: the symptom may simply be gone. If it is, close.

WATCH OUT during the retest -- "convert to deal" used to fail with 400. Under recording
rule 6 (shipped 26 Aug) a school that already has an OPEN deal now returns 409 with a
confirm prompt offering to create a second deal. A 409 is the new correct behaviour,
not this bug.$note$,
  updated_at = now()
WHERE id IN ('564dd615-058c-4081-8e22-8d51b109def1',
             '15c671de-34c3-4384-9470-5f6412c71953');

-- ============================================================================
-- 4. STILL OPEN -- add the evidence, and fix one understated severity
-- ============================================================================

-- 4a. R9: medium is too low for an access control that only appears to work.
UPDATE bug_reports SET
  severity = 'high',
  triaged_at = COALESCE(triaged_at, now()),
  description = description || $note$

--- CONFIRMED STILL OPEN, SEVERITY RAISED, 27 Aug 2026 ----------------------
Confirmed against the deployed code. The rbac module contains a controller, a service
and DTOs -- and NO guard. Every enforced route in the server uses RolesGuard (37
usages). So the permission toggles an admin sets in the UI write to a model that
nothing consults at request time.

Severity raised medium -> high. An access control that appears to work and does not is
worse than one that is visibly absent: it is relied on precisely because it looks real.$note$,
  updated_at = now()
WHERE id = 'b53e7979-eb29-4513-9e16-6c0bd4180f1f';

-- 4b. WANEZI1: nothing done, and it belongs to a much larger pattern.
UPDATE bug_reports SET
  description = description || $note$

--- CONFIRMED STILL OPEN, 27 Aug 2026 ---------------------------------------
Nothing has been done. All four school records are still live in production:
    Wanezi High School.   Insiza    Matebeleland South
    Wanezi High School.   Gwanda    Matebeleland South
    Wanezi High School    Wanezi    Matebeleland North
    Wanezi High Scool     Unknown   Harare
All four Njabulo Mathwasa contacts are still present across three of those records.

WIDER CONTEXT: this is not a one-off. Ignoring the school-level suffix (High /
Secondary / Sec / School), case and spacing, production holds 98 schools under 202
live records -- 104 redundant records in total, of which the Wanezi four are one
group. Fixing Wanezi alone would leave 97 more.
RECOMMEND: fold this into the wider school merge rather than fixing it in isolation.
Full list in the NASH 2026 CRM Cross-Reference Report.$note$,
  updated_at = now()
WHERE id = '5a34bc4e-09a7-49b3-94ba-3c8f875a8896';

-- 4c. AUD-H02: confirmed exactly as reported.
UPDATE bug_reports SET
  description = description || $note$

--- CONFIRMED STILL OPEN, 27 Aug 2026 ---------------------------------------
Confirmed in the deployed code, auth.service.ts:251-267. When a password change is
required (forced or expired), login STILL issues full tokens and merely adds
requires_password_change: true to the response body. The session is completely valid,
so a client that ignores the flag -- or any direct API caller -- carries on as normal.
Enforcement has to live server-side; a flag the client may honour is not a control.$note$,
  updated_at = now()
WHERE id = '5048516d-c1af-4802-b9ea-1a7599a4d67b';

-- ============================================================================
-- 5. REPORT
-- ============================================================================
\echo ''
\echo '=== tickets moved to verification (fix in code, awaiting a human test) ==='
SELECT status, severity, left(title, 78) AS title
  FROM bug_reports
 WHERE id IN ('95702d58-928e-48ea-9b42-76b2487ae9aa',
              'bfdc8c44-8971-4960-92a4-fb9e831e1a59',
              '7fbc2f5b-935e-4a85-9f3c-23d5b7c318bc',
              '51d8efb7-cadb-45cf-91da-1da5d1b41520')
 ORDER BY title;

\echo ''
\echo '=== severity change ==='
SELECT u.severity AS was, b.severity AS now, left(b.title, 70) AS title
  FROM bug_reports b JOIN db_ops_bug_truth_20260827_undo u ON u.id = b.id
 WHERE b.severity <> u.severity;

\echo ''
\echo '=== unresolved count, before and after ==='
SELECT
  (SELECT count(*) FROM bug_reports
    WHERE status::text IN ('open','in_progress','backlog')) AS still_unresolved,
  (SELECT count(*) FROM bug_reports WHERE status::text = 'verification') AS in_verification;

\echo ''
\echo 'Undo snapshot kept in db_ops_bug_truth_20260827_undo (14 rows).'
\echo 'Reverse with db-ops/bug-tracker-truth-2026-08-27-UNDO.sql'

COMMIT;
