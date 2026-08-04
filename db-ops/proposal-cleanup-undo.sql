-- R1 undo (STAGING): restore the retired proposals to their prior status.
BEGIN;
UPDATE lead_assignment_proposals p SET status = u.status
FROM proposal_cleanup_undo u WHERE p.id = u.id;
SELECT COUNT(*) AS restored FROM proposal_cleanup_undo;
COMMIT;
