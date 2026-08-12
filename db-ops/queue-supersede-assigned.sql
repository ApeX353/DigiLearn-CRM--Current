-- Approval-queue cleanup — APPLY (transactional, self-backing-up, reversible)
-- Supersedes PENDING proposals whose lead is already assigned by hand, so the
-- queue reflects reality (only genuinely-unassigned leads remain) and the
-- projection strip stops double-counting. This is the same status the system
-- already uses when a manual assignment races an approval (SUPERSEDED).
--
-- Does NOT touch leads, ownership, or SLA. Undo: queue-supersede-assigned-UNDO.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'queue_supersede_backup_20260812') THEN
    RAISE EXCEPTION 'queue_supersede_backup_20260812 already exists — already applied.';
  END IF;
END $$;

-- Reversal record: the exact proposals we are about to supersede.
CREATE TABLE queue_supersede_backup_20260812 AS
SELECT p.id, p.status, p.decided_at
FROM lead_assignment_proposals p
JOIN leads l ON l.id = p.lead_id
WHERE p.status = 'pending' AND l.assigned_to IS NOT NULL;

SELECT COUNT(*) AS rows_backed_up FROM queue_supersede_backup_20260812;

UPDATE lead_assignment_proposals p
SET status = 'superseded', decided_at = NOW()
FROM queue_supersede_backup_20260812 b
WHERE p.id = b.id;

SELECT COUNT(*) AS pending_remaining
FROM lead_assignment_proposals WHERE status = 'pending';

COMMIT;
