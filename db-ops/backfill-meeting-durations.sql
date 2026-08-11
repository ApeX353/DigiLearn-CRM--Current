-- ============================================================================
-- Backfill activity.duration for existing MEETINGS from their start/end window
-- (the 88 meetings all have both). Going forward the app derives it on save
-- (DURATION1). Calls are NOT backfillable — no time data was ever recorded.
-- Data-only, reversible (snapshot keeps the prior value). No schema/DELETE/DROP.
-- Run (prod):  psql -U crm -d digilearn_crm -f backfill-meeting-durations.sql
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS db_ops_meeting_duration_backfill (
  activity_id   uuid,
  prev_duration int,
  filled_at     timestamptz NOT NULL DEFAULT now()
);

-- snapshot the meetings we'll touch (blank/zero duration, real start+end)
INSERT INTO db_ops_meeting_duration_backfill (activity_id, prev_duration)
SELECT a.id, a.duration
FROM activities a
JOIN meetings m ON m.activity_id = a.id
WHERE m.start_time IS NOT NULL AND m.end_time IS NOT NULL
  AND (a.duration IS NULL OR a.duration = 0);

-- derive minutes = (end - start), floor of 1 minute
UPDATE activities a
SET duration = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (m.end_time - m.start_time)) / 60)::int),
    updated_at = now()
FROM meetings m
WHERE m.activity_id = a.id
  AND a.id IN (SELECT activity_id FROM db_ops_meeting_duration_backfill);

-- verify
SELECT (SELECT count(*) FROM db_ops_meeting_duration_backfill) AS backfilled,
       (SELECT min(duration) FROM activities
          WHERE id IN (SELECT activity_id FROM db_ops_meeting_duration_backfill)) AS min_mins,
       (SELECT max(duration) FROM activities
          WHERE id IN (SELECT activity_id FROM db_ops_meeting_duration_backfill)) AS max_mins;

COMMIT;

-- UNDO:
--   BEGIN;
--   UPDATE activities a SET duration = b.prev_duration
--   FROM db_ops_meeting_duration_backfill b WHERE a.id = b.activity_id;
--   COMMIT;
