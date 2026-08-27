-- ============================================================================
-- Reverse bug-tracker-truth-2026-08-27.sql.
--
-- Restores status, severity, description, resolution_note and every lifecycle
-- timestamp on the 14 tickets that script touched, from the snapshot it took
-- before writing anything.
--
-- Safe to run only while db_ops_bug_truth_20260827_undo still exists and the
-- tickets have not been edited by hand since. If someone has since worked those
-- tickets in the UI, this will discard that work -- check first.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $guard$
DECLARE n int;
BEGIN
  IF to_regclass('public.db_ops_bug_truth_20260827_undo') IS NULL THEN
    RAISE EXCEPTION 'Snapshot table db_ops_bug_truth_20260827_undo is gone. Nothing to restore from.';
  END IF;
  SELECT count(*) INTO n FROM db_ops_bug_truth_20260827_undo;
  IF n <> 14 THEN
    RAISE EXCEPTION 'Snapshot holds % rows, expected 14. Refusing to restore a partial snapshot.', n;
  END IF;
END
$guard$;

-- Warn (do not block) if anything was edited after the forward script ran.
\echo ''
\echo '=== tickets edited since the forward script ran -- review before continuing ==='
SELECT left(b.title, 70) AS title, b.updated_at
  FROM bug_reports b
  JOIN db_ops_bug_truth_20260827_undo u ON u.id = b.id
 WHERE b.updated_at > u.updated_at + interval '5 minutes';

UPDATE bug_reports b SET
  status          = u.status,
  severity        = u.severity,
  description     = u.description,
  resolution_note = u.resolution_note,
  resolved_at     = u.resolved_at,
  verified_at     = u.verified_at,
  closed_at       = u.closed_at,
  triaged_at      = u.triaged_at,
  updated_at      = u.updated_at
FROM db_ops_bug_truth_20260827_undo u
WHERE b.id = u.id;

\echo ''
\echo '=== restored ==='
SELECT b.status, b.severity, left(b.title, 70) AS title
  FROM bug_reports b
  JOIN db_ops_bug_truth_20260827_undo u ON u.id = b.id
 ORDER BY b.title;

COMMIT;

-- Keep the snapshot table until the revert has been eyeballed, then:
--   DROP TABLE db_ops_bug_truth_20260827_undo;
