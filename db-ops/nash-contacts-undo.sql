BEGIN;
UPDATE contacts SET deleted_at = NULL WHERE id IN (SELECT id FROM nash_contacts_undo);
SELECT COUNT(*) AS restored FROM nash_contacts_undo;
COMMIT;
