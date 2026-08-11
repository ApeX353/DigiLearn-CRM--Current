-- ============================================================================
-- Nash re-import strip — DRY RUN (READ-ONLY, makes NO changes)
-- ----------------------------------------------------------------------------
-- Shows EXACTLY what the real strip would soft-delete. Fast set-based version
-- (joins on indexed FK columns, not per-school table scans) — runs in seconds.
-- Scope: schools matched by Kim's pending batch
--        c4be9b0c-1b11-495c-b20d-36460e6d7eb6 as kind='existing-school' that
--        have NO leads, NO deals, NO activity. The 3 in-use schools are kept.
-- Safety: pure SELECT, no transaction needed, nothing written.
-- Run (prod, read-only):
--   psql -U crm -d digilearn_crm -f nash-reimport-strip-DRYRUN.sql
-- ============================================================================
WITH matched AS (
  SELECT DISTINCT (r->'duplicate'->>'id')::uuid AS school_id
  FROM lead_import_batches b, jsonb_array_elements(b.rows) r
  WHERE b.id = 'c4be9b0c-1b11-495c-b20d-36460e6d7eb6'
    AND r->'duplicate'->>'kind' = 'existing-school'
),
in_use AS (
  SELECT school_id FROM leads WHERE deleted_at IS NULL AND school_id IN (SELECT school_id FROM matched)
  UNION SELECT school_id FROM deals WHERE school_id IN (SELECT school_id FROM matched)
  UNION SELECT c.school_id FROM contacts c JOIN activities a ON a.contact_id = c.id WHERE c.school_id IN (SELECT school_id FROM matched)
  UNION SELECT l.school_id FROM leads    l JOIN activities a ON a.lead_id    = l.id WHERE l.school_id IN (SELECT school_id FROM matched)
  UNION SELECT d.school_id FROM deals    d JOIN activities a ON a.deal_id    = d.id WHERE d.school_id IN (SELECT school_id FROM matched)
),
strippable AS (
  SELECT school_id FROM matched
  EXCEPT
  SELECT school_id FROM in_use
)
SELECT
  (SELECT count(*) FROM matched)                                                   AS matched_existing_schools,
  (SELECT count(*) FROM strippable)                                                AS schools_to_strip,
  (SELECT count(*) FROM in_use)                                                    AS schools_kept_in_use,
  (SELECT count(*) FROM contacts c
     WHERE c.deleted_at IS NULL
       AND c.school_id IN (SELECT school_id FROM strippable))                      AS contacts_to_strip;
-- Expected: matched 362, schools_to_strip 359, schools_kept_in_use 3, contacts_to_strip 361.
