-- NASH cleanup (STAGING). Soft-delete the 366 test schools + 367 leads.
-- Reversible: undo IDs captured first. Only touches created_at 2026-07-31.
BEGIN;
DROP TABLE IF EXISTS nash_cleanup_undo_leads;
DROP TABLE IF EXISTS nash_cleanup_undo_schools;
CREATE TABLE nash_cleanup_undo_schools AS
  SELECT id FROM schools
  WHERE deleted_at IS NULL AND created_at::date = DATE '2026-07-31';
CREATE TABLE nash_cleanup_undo_leads AS
  SELECT id FROM leads
  WHERE deleted_at IS NULL AND school_id IN (SELECT id FROM nash_cleanup_undo_schools);
UPDATE leads   SET deleted_at = NOW() WHERE id IN (SELECT id FROM nash_cleanup_undo_leads);
UPDATE schools SET deleted_at = NOW() WHERE id IN (SELECT id FROM nash_cleanup_undo_schools);
SELECT (SELECT COUNT(*) FROM nash_cleanup_undo_schools) AS schools_removed,
       (SELECT COUNT(*) FROM nash_cleanup_undo_leads)   AS leads_removed;
COMMIT;
