-- ============================================================================
-- Reject the stale Nash pending batch (computed BEFORE the strip)
-- ----------------------------------------------------------------------------
-- Batch c4be9b0c flagged 359 real schools as duplicates against rows we have
-- since stripped, and approveBatch() honours those baked-in flags (it does not
-- re-check the DB). So this batch must be discarded and the file re-uploaded.
--
-- Reversible: to undo, set status back to 'pending' (decided_at/by stay set,
-- harmless). Guarded by AND status='pending' so it is idempotent.
--
-- Run (prod):
--   psql -U crm -d digilearn_crm -f reject-nash-batch.sql
-- ============================================================================
BEGIN;

UPDATE lead_import_batches
SET status = 'rejected', decided_at = now()
WHERE id = 'c4be9b0c-1b11-495c-b20d-36460e6d7eb6'
  AND status = 'pending';

SELECT id, filename, status, to_char(decided_at,'YYYY-MM-DD HH24:MI') AS decided_at
FROM lead_import_batches
WHERE id = 'c4be9b0c-1b11-495c-b20d-36460e6d7eb6';

COMMIT;
