BEGIN;
UPDATE schools  SET deleted_at = NULL WHERE id IN (SELECT id FROM nash_full_undo_schools);
UPDATE leads    SET deleted_at = NULL WHERE id IN (SELECT id FROM nash_full_undo_leads);
UPDATE contacts SET deleted_at = NULL WHERE id IN (SELECT id FROM nash_full_undo_contacts);
SELECT (SELECT COUNT(*) FROM nash_full_undo_schools) AS schools,
       (SELECT COUNT(*) FROM nash_full_undo_leads)   AS leads,
       (SELECT COUNT(*) FROM nash_full_undo_contacts) AS contacts;
COMMIT;