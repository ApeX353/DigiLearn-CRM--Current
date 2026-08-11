-- ============================================================================
-- Return the OLD backlog leads that got swept into the auto-assign queue back
-- to New Leads. "Old" = created BEFORE the NASH import date (05 Aug 2026) —
-- the easy tell, since every NASH lead was created 05 Aug. These 74 are
-- already status='New' and unassigned; only a PENDING proposal holds them in
-- the queue, so superseding it drops them back into New Leads.
--
-- Leaves in the queue: the 363 NASH leads + 1 genuinely-new lead (Nemane High,
-- a 05-Aug Website enquiry — NOT old, so kept). If you want a pure-NASH queue,
-- see the note at the bottom to also send that one back.
-- Reversible (snapshot). Only proposal status flips; no lead data changes.
-- Run (prod):  psql -U crm -d digilearn_crm -f return-old-leads-to-new.sql
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS db_ops_return_old_leads (
  proposal_id uuid,
  lead_id     uuid,
  filled_at   timestamptz NOT NULL DEFAULT now()
);

-- snapshot the pending proposals whose lead pre-dates the NASH import
INSERT INTO db_ops_return_old_leads (proposal_id, lead_id)
SELECT p.id, p.lead_id
FROM lead_assignment_proposals p
JOIN leads l ON l.id = p.lead_id
WHERE p.status = 'pending'
  AND l.created_at < '2026-08-05'::timestamp;

-- supersede them → the leads leave the auto-assign queue and sit in New Leads
UPDATE lead_assignment_proposals
SET status = 'superseded'
WHERE id IN (SELECT proposal_id FROM db_ops_return_old_leads);

-- verify
SELECT (SELECT count(*) FROM db_ops_return_old_leads) AS returned_to_new_leads,
       (SELECT count(*) FROM lead_assignment_proposals WHERE status = 'pending') AS proposals_left;

COMMIT;

-- UNDO:
--   BEGIN;
--   UPDATE lead_assignment_proposals SET status = 'pending'
--   WHERE id IN (SELECT proposal_id FROM db_ops_return_old_leads);
--   COMMIT;
--
-- To ALSO send the 1 non-NASH 05-Aug lead (Nemane) back for a pure-NASH queue:
--   UPDATE lead_assignment_proposals p SET status='superseded'
--   FROM leads l WHERE l.id=p.lead_id AND p.status='pending'
--     AND l.source_campaign_id IS DISTINCT FROM (SELECT id FROM campaigns WHERE name='NASH 2026');
