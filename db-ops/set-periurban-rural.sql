-- ============================================================================
-- Classify the 2 peri-urban rows of the latest pending Nash batch as RURAL,
-- exactly as the app's setRowRegion (R3) would: region=rural, needsRegion=false,
-- status=importable, drop invalidReason, decision=approve; recompute importable_count.
-- Rows: 25 (Sadiwa High School) + 82 (Havano High School).
-- Scoped to the newest PENDING batch only. Run (prod):
--   psql -U crm -d digilearn_crm -f set-periurban-rural.sql
-- ============================================================================
BEGIN;

WITH tgt AS (
  SELECT id, rows FROM lead_import_batches WHERE status = 'pending'
  ORDER BY created_at DESC LIMIT 1
),
rebuilt AS (
  SELECT t.id,
    jsonb_agg(
      CASE WHEN (elem->>'rowNumber')::int IN (25, 82)
        THEN (elem - 'invalidReason')
             || '{"region":"rural","needsRegion":false,"status":"importable","decision":"approve"}'::jsonb
        ELSE elem END
      ORDER BY ord
    ) AS new_rows
  FROM tgt t, LATERAL jsonb_array_elements(t.rows) WITH ORDINALITY AS e(elem, ord)
  GROUP BY t.id
)
UPDATE lead_import_batches lib
SET rows = rebuilt.new_rows,
    importable_count = (SELECT count(*) FROM jsonb_array_elements(rebuilt.new_rows) rr
                        WHERE rr->>'decision' = 'approve')
FROM rebuilt
WHERE lib.id = rebuilt.id;

-- verify
SELECT importable_count,
  (SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>'status' = 'invalid')                        AS still_invalid_should_be_0,
  (SELECT count(*) FROM jsonb_array_elements(rows) r WHERE (r->>'rowNumber')::int IN (25,82)
                                                       AND r->>'region' = 'rural')                          AS set_rural_should_be_2
FROM lead_import_batches WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1;

COMMIT;
