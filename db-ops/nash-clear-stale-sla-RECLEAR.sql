-- NASH stale-SLA clear — RE-CLEAR any that raced back after the first apply.
-- A concurrent full-row save (a manager working the queue) restored the old
-- clock on a small number of leads after nash-clear-stale-sla.sql committed.
-- No scheduled job re-writes current_sla_due_date (verified), so this is a
-- one-off catch-up, not whack-a-mole. Appends newly-affected rows to the
-- existing backup so the single UNDO still restores everything.

\set nash '''c1cb66ff-cebc-4104-83cb-fd561ef91adf'''

BEGIN;

-- Keep the reversal record complete: back up any stale-clocked NASH lead
-- not already recorded.
INSERT INTO nash_sla_backup_20260812 (id, current_sla_due_date, sla_breached)
SELECT l.id, l.current_sla_due_date, l.sla_breached
FROM leads l
WHERE l.source_campaign_id = :nash
  AND l.deleted_at IS NULL
  AND l.current_sla_due_date IS NOT NULL
  AND l.current_sla_due_date < NOW()
  AND NOT EXISTS (SELECT 1 FROM nash_sla_backup_20260812 b WHERE b.id = l.id);

UPDATE leads
SET current_sla_due_date = NULL,
    sla_breached = false
WHERE source_campaign_id = :nash
  AND deleted_at IS NULL
  AND current_sla_due_date IS NOT NULL
  AND current_sla_due_date < NOW();

SELECT COUNT(*) AS remaining_nash_stale_clocks
FROM leads
WHERE source_campaign_id = :nash
  AND deleted_at IS NULL
  AND current_sla_due_date IS NOT NULL
  AND current_sla_due_date < NOW();

COMMIT;
