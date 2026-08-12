-- NASH stale-SLA clear — APPLY (transactional, self-backing-up, reversible)
-- See nash-clear-stale-sla-DRYRUN.sql for context and the read-only count.
--
-- What it does, in ONE transaction:
--   1. Backs up every row it will touch (id + old SLA fields) into
--      nash_sla_backup_20260812 — the reversal record. Refuses to run twice
--      by guarding on the backup table's existence.
--   2. Clears the stale (past-due) first-touch SLA clock on NASH 2026 leads:
--      current_sla_due_date -> NULL, sla_breached -> false.
--   3. Prints how many rows changed.
-- Scope: NASH 2026 only, past-due clocks only. Assignments (assigned_to) are
-- NOT touched — Ms Mpofu's reassignment stands. Undo: nash-clear-stale-sla-UNDO.sql

\set nash '''c1cb66ff-cebc-4104-83cb-fd561ef91adf'''

BEGIN;

-- Guard: fail loudly if a backup already exists (script already ran).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'nash_sla_backup_20260812') THEN
    RAISE EXCEPTION 'nash_sla_backup_20260812 already exists — script already applied. Restore/drop it before re-running.';
  END IF;
END $$;

-- 1. Reversal record.
CREATE TABLE nash_sla_backup_20260812 AS
SELECT id, current_sla_due_date, sla_breached
FROM leads
WHERE source_campaign_id = :nash
  AND deleted_at IS NULL
  AND current_sla_due_date IS NOT NULL
  AND current_sla_due_date < NOW();

SELECT COUNT(*) AS rows_backed_up FROM nash_sla_backup_20260812;

-- 2. Clear the stale clocks (only the exact rows we backed up).
UPDATE leads l
SET current_sla_due_date = NULL,
    sla_breached = false
FROM nash_sla_backup_20260812 b
WHERE l.id = b.id;

-- 3. Confirm.
SELECT COUNT(*) AS remaining_nash_stale_clocks
FROM leads
WHERE source_campaign_id = :nash
  AND deleted_at IS NULL
  AND current_sla_due_date IS NOT NULL
  AND current_sla_due_date < NOW();

COMMIT;
