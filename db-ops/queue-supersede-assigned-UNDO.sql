-- Approval-queue cleanup — UNDO
-- Restores the superseded proposals to their prior (pending) state from the
-- backup table, then drops it.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'queue_supersede_backup_20260812') THEN
    RAISE EXCEPTION 'queue_supersede_backup_20260812 not found — nothing to undo.';
  END IF;
END $$;

UPDATE lead_assignment_proposals p
SET status = b.status, decided_at = b.decided_at
FROM queue_supersede_backup_20260812 b
WHERE p.id = b.id;

SELECT COUNT(*) AS rows_restored FROM queue_supersede_backup_20260812;

DROP TABLE queue_supersede_backup_20260812;

COMMIT;
