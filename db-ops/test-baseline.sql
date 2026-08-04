-- BEFORE the staging test: snapshot lead assignments + a marker time so the
-- wipe can revert every change and purge everything created during the test.
DROP TABLE IF EXISTS test_wipe_baseline_leads;
CREATE TABLE test_wipe_baseline_leads AS
  SELECT id, assigned_to, status, current_sla_due_date, sla_breached FROM leads;
DROP TABLE IF EXISTS test_wipe_marker;
CREATE TABLE test_wipe_marker AS SELECT NOW() AS started_at;
SELECT (SELECT COUNT(*) FROM test_wipe_baseline_leads) AS leads_snapshotted,
       (SELECT started_at FROM test_wipe_marker) AS marker_time;
