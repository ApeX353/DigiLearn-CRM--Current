-- ACT5 date-restore UNDO (PROD). Restores due_at/status/completed_at to
-- their pre-apply values for every captured row.
BEGIN;
UPDATE activities a
SET due_at = u.due_at, status = u.status, completed_at = u.completed_at
FROM act5_date_undo u
WHERE a.id = u.id;
SELECT COUNT(*) AS reverted FROM act5_date_undo;
COMMIT;
