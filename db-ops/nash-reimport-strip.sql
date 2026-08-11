-- ============================================================================
-- Nash re-import strip — APPLY (reversible soft-delete)  [fast set-based]
-- ----------------------------------------------------------------------------
-- Soft-deletes ONLY the Nash schools Kim's pending batch matched as
-- kind='existing-school' with NO leads, NO deals and NO activity, plus their
-- live contacts. Afterwards, re-running/approving the import creates those
-- schools + leads fresh (the dedup ignores deleted_at IS NOT NULL rows).
--
-- The 3 in-use schools (leads/a deal/activity) are left LIVE and stay flagged
-- as duplicates in the import — correct.
--
-- SAFETY:
--   * Sets deleted_at = now() only. NO DROP / DELETE / TRUNCATE, nothing
--     DB-wide. Every UPDATE is bounded to the snapshot table built below.
--   * Every affected id is recorded in db_ops_nash_strip so the UNDO script
--     restores the exact rows.
--   * One transaction. If terminated or errored before COMMIT, Postgres rolls
--     the whole thing back — no partial strip is possible.
--   * Fast: joins on indexed FK columns (~seconds), not per-school scans.
--
-- Run (prod):
--   psql -U crm -d digilearn_crm -f nash-reimport-strip.sql
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS db_ops_nash_strip (
  school_id   uuid,
  contact_id  uuid,
  kind        text,
  batch_id    uuid,
  stripped_at timestamptz NOT NULL DEFAULT now()
);

-- 1. Record the strippable schools (matched existing-school, NOT in use).
INSERT INTO db_ops_nash_strip (school_id, kind, batch_id)
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
)
SELECT school_id, 'school', 'c4be9b0c-1b11-495c-b20d-36460e6d7eb6'::uuid
FROM (SELECT school_id FROM matched EXCEPT SELECT school_id FROM in_use) s;

-- 2. Record their live contacts.
INSERT INTO db_ops_nash_strip (school_id, contact_id, kind, batch_id)
SELECT c.school_id, c.id, 'contact', 'c4be9b0c-1b11-495c-b20d-36460e6d7eb6'::uuid
FROM contacts c
WHERE c.deleted_at IS NULL
  AND c.school_id IN (SELECT school_id FROM db_ops_nash_strip WHERE kind = 'school');

-- 3. Soft-delete: contacts first, then schools. Bounded to the snapshot only.
UPDATE contacts SET deleted_at = now()
WHERE deleted_at IS NULL
  AND id IN (SELECT contact_id FROM db_ops_nash_strip WHERE kind = 'contact');

UPDATE schools SET deleted_at = now()
WHERE deleted_at IS NULL
  AND id IN (SELECT school_id FROM db_ops_nash_strip WHERE kind = 'school');

-- 4. Verify (expect 359 schools / 361 contacts, and the same counts now deleted).
SELECT
  (SELECT count(*) FROM db_ops_nash_strip WHERE kind = 'school')  AS schools_snapshotted,
  (SELECT count(*) FROM db_ops_nash_strip WHERE kind = 'contact') AS contacts_snapshotted,
  (SELECT count(*) FROM schools  s WHERE s.deleted_at IS NOT NULL
     AND s.id IN (SELECT school_id  FROM db_ops_nash_strip WHERE kind = 'school'))  AS schools_now_deleted,
  (SELECT count(*) FROM contacts c WHERE c.deleted_at IS NOT NULL
     AND c.id IN (SELECT contact_id FROM db_ops_nash_strip WHERE kind = 'contact')) AS contacts_now_deleted;

-- Change to ROLLBACK; if the numbers look wrong.
COMMIT;
