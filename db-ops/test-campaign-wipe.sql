-- Remove the test campaigns created today + detach their leads (STAGING).
-- Reversible for the leads (source_campaign_id in wipe_undo_lead_camp); the
-- campaign rows are captured in wipe_undo_campaigns before hard-delete.
BEGIN;
DROP TABLE IF EXISTS wipe_undo_campaigns;
DROP TABLE IF EXISTS wipe_undo_lead_camp;
CREATE TABLE wipe_undo_campaigns AS
  SELECT * FROM campaigns WHERE created_at::date = CURRENT_DATE;
CREATE TABLE wipe_undo_lead_camp AS
  SELECT id, source_campaign_id FROM leads
  WHERE source_campaign_id IN (SELECT id FROM wipe_undo_campaigns);
UPDATE leads SET source_campaign_id = NULL
  WHERE source_campaign_id IN (SELECT id FROM wipe_undo_campaigns);
UPDATE cash_requisitions SET campaign_id = NULL
  WHERE campaign_id IN (SELECT id FROM wipe_undo_campaigns);
DELETE FROM campaigns WHERE id IN (SELECT id FROM wipe_undo_campaigns);
SELECT (SELECT COUNT(*) FROM wipe_undo_campaigns) AS campaigns_removed,
       (SELECT COUNT(*) FROM wipe_undo_lead_camp) AS leads_detached;
COMMIT;
