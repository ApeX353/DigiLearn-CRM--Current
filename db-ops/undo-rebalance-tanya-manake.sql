-- ============================================================================
-- UNDO the 07:09 (06 Aug) rebalance that moved 228 leads Tanya -> Manake by
-- mistake. Reverts ownership back to Tanya for exactly those 228 leads (found
-- from the audit log). Verified safe first: all 228 are still on Manake and
-- NONE were worked since the move.
--
-- Reverts OWNERSHIP only. Any first-touch SLA the move started stays (leaving
-- it is harmless — the lead is back with Tanya, who has a clock). If you want
-- those SLAs cleared too, say so and we'll do it as a follow-up.
-- Reversible (snapshot). Run (prod):
--   psql -U crm -d digilearn_crm -f undo-rebalance-tanya-manake.sql
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS db_ops_rebalance_undo (
  lead_id   uuid,
  filled_at timestamptz NOT NULL DEFAULT now()
);

-- the leads the rebalance moved (from the audit trail)
INSERT INTO db_ops_rebalance_undo (lead_id)
SELECT DISTINCT entity_id::uuid
FROM activity_logs
WHERE entity = 'Lead'
  AND summary ILIKE '%Rebalanced Tanya G%manake%'
  AND created_at >= '2026-08-06 06:30';

-- put them back on Tanya (only the ones still sitting on Manake)
UPDATE leads
SET assigned_to = 'da00af9d-5d45-481c-b1d6-5aabfeff7695'   -- Tanya G
WHERE id IN (SELECT lead_id FROM db_ops_rebalance_undo)
  AND assigned_to = '398758d1-2357-4d5d-8c6d-4e995769af47'; -- manake dube

-- verify
SELECT
  (SELECT count(*) FROM db_ops_rebalance_undo) AS in_scope,
  (SELECT count(*) FROM leads
     WHERE id IN (SELECT lead_id FROM db_ops_rebalance_undo)
       AND assigned_to = 'da00af9d-5d45-481c-b1d6-5aabfeff7695') AS now_on_tanya,
  (SELECT count(*) FROM leads
     WHERE id IN (SELECT lead_id FROM db_ops_rebalance_undo)
       AND assigned_to = '398758d1-2357-4d5d-8c6d-4e995769af47') AS still_on_manake_should_be_0;

COMMIT;

-- UNDO-THE-UNDO (put them back on Manake):
--   UPDATE leads SET assigned_to='398758d1-2357-4d5d-8c6d-4e995769af47'
--   WHERE id IN (SELECT lead_id FROM db_ops_rebalance_undo);
