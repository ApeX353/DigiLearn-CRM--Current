-- NASH undo (STAGING). Restores the soft-deleted schools + leads.
BEGIN;
UPDATE schools SET deleted_at = NULL WHERE id IN (SELECT id FROM nash_cleanup_undo_schools);
UPDATE leads   SET deleted_at = NULL WHERE id IN (SELECT id FROM nash_cleanup_undo_leads);
COMMIT;
