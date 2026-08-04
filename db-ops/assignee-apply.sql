-- ACT-ASSIGNEE apply (PROD). Reversible: undo IDs captured first.
-- Sets assigned_to_id = the lead owner (then deal owner) ONLY where null.
BEGIN;
DROP TABLE IF EXISTS activity_assignee_backfill_undo;
CREATE TABLE activity_assignee_backfill_undo AS
  SELECT a.id
  FROM activities a
  LEFT JOIN leads l ON l.id = a.lead_id
  LEFT JOIN deals d ON d.id = a.deal_id
  WHERE a.assigned_to_id IS NULL
    AND COALESCE(l.assigned_to, d.assigned_to) IS NOT NULL;
UPDATE activities a SET assigned_to_id = l.assigned_to
  FROM leads l
  WHERE a.lead_id = l.id AND a.assigned_to_id IS NULL AND l.assigned_to IS NOT NULL;
UPDATE activities a SET assigned_to_id = d.assigned_to
  FROM deals d
  WHERE a.deal_id = d.id AND a.assigned_to_id IS NULL AND d.assigned_to IS NOT NULL;
SELECT (SELECT COUNT(*) FROM activity_assignee_backfill_undo) AS backfilled,
       (SELECT COUNT(*) FROM activities WHERE assigned_to_id IS NULL) AS still_unassigned;
COMMIT;
