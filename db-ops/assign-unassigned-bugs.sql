-- ============================================================================
-- Backfill: assign every UNASSIGNED bug report to the admin_support maintainer
-- (Prince) — matches "the maintainer is always the assignee".
-- ----------------------------------------------------------------------------
-- Data-only, reversible. Records the rows it touches in a snapshot table so the
-- UNDO restores exactly those to NULL. No schema change, no DELETE/DROP.
-- Run (prod):
--   psql -U crm -d digilearn_crm -f assign-unassigned-bugs.sql
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS db_ops_bug_assign_backfill (
  bug_id     uuid,
  filled_at  timestamptz NOT NULL DEFAULT now()
);

-- snapshot the currently-unassigned rows
INSERT INTO db_ops_bug_assign_backfill (bug_id)
SELECT id FROM bug_reports WHERE assigned_to_id IS NULL;

-- assign them to the single active admin_support user (Prince)
UPDATE bug_reports
SET assigned_to_id = (
      SELECT u.id FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE r.name = 'admin_support' AND u.is_active = true
      ORDER BY u.created_at
      LIMIT 1),
    updated_at = now()
WHERE id IN (SELECT bug_id FROM db_ops_bug_assign_backfill);

-- verify
SELECT (SELECT count(*) FROM db_ops_bug_assign_backfill)                       AS rows_backfilled,
       (SELECT count(*) FROM bug_reports WHERE assigned_to_id IS NULL)          AS still_unassigned_should_be_0;

COMMIT;

-- UNDO (only if needed):
--   BEGIN;
--   UPDATE bug_reports SET assigned_to_id = NULL
--   WHERE id IN (SELECT bug_id FROM db_ops_bug_assign_backfill);
--   COMMIT;
