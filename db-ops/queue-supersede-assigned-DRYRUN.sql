-- Approval-queue cleanup — DRY RUN (read-only)
-- Problem: 135 PENDING auto-assign proposals point at leads that were
-- already assigned by hand (Ms Mpofu, 11 Aug). A manual assignment does not
-- supersede a pending proposal (only deleting the lead or APPROVING does),
-- so these dangle in the Approval Queue: they can never be approved (approve
-- would fail "already assigned by hand"), they inflate the pending count
-- (364 shown, only 229 actionable), and they DOUBLE-COUNT in the projection
-- strip — the lead sits in the rep's current book AND in their pending total.
--
-- This file only COUNTS. Scope: PENDING proposals whose lead already has an
-- owner. Nothing changes.

SELECT
  COUNT(*)                                              AS pending_total,
  COUNT(*) FILTER (WHERE l.assigned_to IS NOT NULL)     AS dangling_assigned,
  COUNT(*) FILTER (WHERE l.assigned_to IS NULL)         AS genuinely_pending,
  COUNT(*) FILTER (WHERE l.assigned_to = p.proposed_rep_id) AS assigned_to_proposed_rep
FROM lead_assignment_proposals p
JOIN leads l ON l.id = p.lead_id
WHERE p.status = 'pending';

-- Per-rep breakdown of the dangling ones.
SELECT p.proposed_rep_id, COUNT(*) AS dangling
FROM lead_assignment_proposals p
JOIN leads l ON l.id = p.lead_id
WHERE p.status = 'pending' AND l.assigned_to IS NOT NULL
GROUP BY p.proposed_rep_id
ORDER BY dangling DESC;
