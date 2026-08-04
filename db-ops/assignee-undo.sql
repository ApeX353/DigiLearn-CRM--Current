-- ACT-ASSIGNEE undo (PROD). Sets the backfilled rows back to null.
BEGIN;
UPDATE activities SET assigned_to_id = NULL
  WHERE id IN (SELECT id FROM activity_assignee_backfill_undo);
SELECT COUNT(*) AS reverted FROM activity_assignee_backfill_undo;
COMMIT;
