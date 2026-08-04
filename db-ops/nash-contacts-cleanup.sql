-- Nash residue: soft-delete contacts orphaned to the soft-deleted 2026-07-31
-- Nash schools (STAGING). Reversible via nash-contacts-undo.sql.
BEGIN;
DROP TABLE IF EXISTS nash_contacts_undo;
CREATE TABLE nash_contacts_undo AS
  SELECT c.id FROM contacts c
  JOIN schools s ON s.id = c.school_id
  WHERE c.deleted_at IS NULL
    AND s.deleted_at IS NOT NULL
    AND s.created_at::date = DATE '2026-07-31';
UPDATE contacts SET deleted_at = NOW() WHERE id IN (SELECT id FROM nash_contacts_undo);
SELECT (SELECT COUNT(*) FROM nash_contacts_undo) AS contacts_removed;
COMMIT;
