-- R1: retire pending/rejected auto-assign proposals whose lead is deleted or
-- missing (STAGING) — the 341 orphans that render as a bare ID in the queue.
-- Reversible via proposal_cleanup_undo.
BEGIN;
DROP TABLE IF EXISTS proposal_cleanup_undo;
CREATE TABLE proposal_cleanup_undo AS
  SELECT p.id, p.status
  FROM lead_assignment_proposals p
  LEFT JOIN leads l ON l.id = p.lead_id
  WHERE p.status IN ('pending','rejected')
    AND (l.id IS NULL OR l.deleted_at IS NOT NULL);
UPDATE lead_assignment_proposals SET status='superseded', decided_at=NOW()
  WHERE id IN (SELECT id FROM proposal_cleanup_undo);
SELECT COUNT(*) AS retired FROM proposal_cleanup_undo;
COMMIT;
