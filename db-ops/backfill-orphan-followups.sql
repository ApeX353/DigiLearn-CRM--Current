-- ============================================================================
-- Backfill: assign every OPEN, ownerless task to whoever created it — the same
-- rule the follow-up dialog now uses (assigned_to ?? creator). Fixes the
-- follow-up tasks that landed unassigned before the code fix.
-- Data-only, reversible (snapshot table). No schema change, no DELETE/DROP.
-- Run (prod):  psql -U crm -d digilearn_crm -f backfill-orphan-followups.sql
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS db_ops_followup_assign_backfill (
  activity_id uuid,
  filled_at   timestamptz NOT NULL DEFAULT now()
);

-- snapshot the open, ownerless tasks that have a creator to inherit from
INSERT INTO db_ops_followup_assign_backfill (activity_id)
SELECT id FROM activities
WHERE type = 'task'
  AND assigned_to_id IS NULL
  AND status NOT IN ('completed', 'cancelled')
  AND archived_at IS NULL
  AND created_by_id IS NOT NULL;

-- assign each to its creator
UPDATE activities
SET assigned_to_id = created_by_id, updated_at = now()
WHERE id IN (SELECT activity_id FROM db_ops_followup_assign_backfill);

-- verify
SELECT (SELECT count(*) FROM db_ops_followup_assign_backfill) AS backfilled,
       (SELECT count(*) FROM activities
          WHERE type='task' AND assigned_to_id IS NULL
            AND status NOT IN ('completed','cancelled') AND archived_at IS NULL
            AND created_by_id IS NOT NULL)                    AS still_orphan_should_be_0;

COMMIT;

-- UNDO:
--   BEGIN;
--   UPDATE activities SET assigned_to_id = NULL
--   WHERE id IN (SELECT activity_id FROM db_ops_followup_assign_backfill);
--   COMMIT;
