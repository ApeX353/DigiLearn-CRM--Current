-- ============================================================================
-- Clear the SLA "debris" the mistaken 07:09 rebalance started on the 228 leads.
-- The move began a fresh first-touch SLA clock on the leads that had none —
-- 178 of them (due-date set today, not breached). Now that ownership is back
-- with Tanya, those clocks shouldn't exist (the leads were unworked / had no
-- SLA before), so we clear them to avoid false SLA-breach pressure on the team.
--
-- Dry-run verified: touches ONLY the 178 fresh SLAs; the 30 genuinely-breached
-- pre-existing SLAs and 20 no-SLA leads are left alone.
-- Reversible: prior due-date + breach flag snapshotted per lead.
-- Run (prod):  psql -U crm -d digilearn_crm -f clear-rebalance-sla-debris.sql
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS db_ops_rebalance_sla_undo (
  lead_id       uuid,
  prev_due      timestamp,
  prev_breached boolean,
  filled_at     timestamptz NOT NULL DEFAULT now()
);

-- snapshot the fresh SLAs before clearing (only leads from the reverted set
-- whose SLA due-date was set today = by the rebalance)
INSERT INTO db_ops_rebalance_sla_undo (lead_id, prev_due, prev_breached)
SELECT id, current_sla_due_date, sla_breached
FROM leads
WHERE id IN (SELECT lead_id FROM db_ops_rebalance_undo)
  AND current_sla_due_date >= '2026-08-06 06:30';

-- clear them → no SLA clock (their pre-rebalance state)
UPDATE leads
SET current_sla_due_date = NULL, sla_breached = false
WHERE id IN (SELECT lead_id FROM db_ops_rebalance_sla_undo);

-- verify
SELECT (SELECT count(*) FROM db_ops_rebalance_sla_undo) AS slas_cleared,
       (SELECT count(*) FROM leads
          WHERE id IN (SELECT lead_id FROM db_ops_rebalance_undo)
            AND current_sla_due_date >= '2026-08-06 06:30') AS fresh_left_should_be_0;

COMMIT;

-- UNDO (restore the cleared SLAs):
--   BEGIN;
--   UPDATE leads l SET current_sla_due_date = s.prev_due, sla_breached = s.prev_breached
--   FROM db_ops_rebalance_sla_undo s WHERE l.id = s.lead_id;
--   COMMIT;
