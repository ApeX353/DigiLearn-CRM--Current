-- AFTER the staging test: undo everything created/changed during the test.
-- 1) soft-delete schools/leads/contacts created after the marker (imports)
-- 2) revert lead assignment/status/SLA on pre-existing leads to the baseline
-- 3) retire all proposals created during the test
BEGIN;
UPDATE contacts SET deleted_at = NOW()
  WHERE deleted_at IS NULL AND created_at > (SELECT started_at FROM test_wipe_marker);
UPDATE leads SET deleted_at = NOW()
  WHERE deleted_at IS NULL AND created_at > (SELECT started_at FROM test_wipe_marker);
UPDATE schools SET deleted_at = NOW()
  WHERE deleted_at IS NULL AND created_at > (SELECT started_at FROM test_wipe_marker);
UPDATE leads l SET assigned_to = b.assigned_to, status = b.status,
                   current_sla_due_date = b.current_sla_due_date, sla_breached = b.sla_breached
  FROM test_wipe_baseline_leads b
  WHERE l.id = b.id
    AND (l.assigned_to IS DISTINCT FROM b.assigned_to OR l.status IS DISTINCT FROM b.status
         OR l.current_sla_due_date IS DISTINCT FROM b.current_sla_due_date);
UPDATE lead_assignment_proposals SET status = 'superseded', decided_at = NOW()
  WHERE created_at > (SELECT started_at FROM test_wipe_marker)
    AND status IN ('pending','approved','rejected');
SELECT 'wiped: created-rows soft-deleted, assignments reverted, proposals retired' AS result;
COMMIT;
