-- NASH stale-SLA clear — UNDO
-- Restores every lead's SLA clock exactly as it was before
-- nash-clear-stale-sla.sql ran, from the backup table it created, then
-- drops the backup. Run only if you want the (stale, breached) clocks back.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'nash_sla_backup_20260812') THEN
    RAISE EXCEPTION 'nash_sla_backup_20260812 not found — nothing to undo.';
  END IF;
END $$;

UPDATE leads l
SET current_sla_due_date = b.current_sla_due_date,
    sla_breached = b.sla_breached
FROM nash_sla_backup_20260812 b
WHERE l.id = b.id;

SELECT COUNT(*) AS rows_restored FROM nash_sla_backup_20260812;

DROP TABLE nash_sla_backup_20260812;

COMMIT;
