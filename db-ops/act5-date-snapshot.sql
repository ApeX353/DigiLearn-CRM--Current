-- ACT5 date-restore UNDO SNAPSHOT (PROD). Non-destructive: backs up the
-- current state of every target row BEFORE the endpoint apply runs.
-- Target = exactly what the ACT5 job touches.
DROP TABLE IF EXISTS act5_date_undo;
CREATE TABLE act5_date_undo AS
  SELECT id, due_at, status, completed_at
  FROM activities
  WHERE due_at IS NULL
    AND status NOT IN ('completed','cancelled')
    AND type <> 'note';
SELECT COUNT(*) AS rows_captured_for_undo FROM act5_date_undo;
