-- ============================================================================
-- Nash re-import strip — UNDO (restores exactly what the strip soft-deleted)
-- ----------------------------------------------------------------------------
-- Reads db_ops_nash_strip (written by nash-reimport-strip.sql) and clears
-- deleted_at on precisely those schools + contacts. Nothing else is touched.
--
-- NOTE: only run this BEFORE Kim re-imports. Once the import has created the
-- fresh school/lead rows, un-deleting the old ones would re-introduce the
-- duplicates you set out to remove.
--
-- Run (prod):
--   psql -U crm -d digilearn_crm -f nash-reimport-strip-UNDO.sql
-- ============================================================================
BEGIN;

UPDATE schools SET deleted_at = NULL
WHERE id IN (SELECT school_id FROM db_ops_nash_strip WHERE kind = 'school');

UPDATE contacts SET deleted_at = NULL
WHERE id IN (SELECT contact_id FROM db_ops_nash_strip WHERE kind = 'contact');

SELECT
  (SELECT count(*) FROM db_ops_nash_strip WHERE kind = 'school')  AS schools_restored,
  (SELECT count(*) FROM db_ops_nash_strip WHERE kind = 'contact') AS contacts_restored;

COMMIT;

-- Once you're satisfied everything is correct, you may drop the snapshot table:
--   DROP TABLE db_ops_nash_strip;
