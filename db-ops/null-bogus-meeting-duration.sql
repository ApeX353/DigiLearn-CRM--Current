-- ============================================================================
-- Null implausible meeting durations (>= 10 hours = data-entry error, e.g. an
-- end time recorded on the wrong day). Shows blank rather than a wrong number;
-- the rep can fix the meeting's end time later. Leaves legitimate all-day
-- events (<= 8h) untouched. Reversible via db_ops_meeting_duration_backfill.
-- Run (prod):  psql -U crm -d digilearn_crm -f null-bogus-meeting-duration.sql
-- ============================================================================
BEGIN;

UPDATE activities
SET duration = NULL, updated_at = now()
WHERE id IN (SELECT activity_id FROM db_ops_meeting_duration_backfill)
  AND duration >= 600;

-- verify: how many were cleared, and confirm none >= 600 remain
SELECT
  (SELECT count(*) FROM activities
     WHERE id IN (SELECT activity_id FROM db_ops_meeting_duration_backfill)
       AND duration IS NULL)                                            AS now_blank,
  (SELECT count(*) FROM activities
     WHERE id IN (SELECT activity_id FROM db_ops_meeting_duration_backfill)
       AND duration >= 600)                                            AS over_10h_should_be_0;

COMMIT;
