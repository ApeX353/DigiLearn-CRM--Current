import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Diagnostics layer, phase 1: the four tables the API writes its own
 * trouble into (errors, job runs, provider calls, browser errors), the
 * bug-report context column, and the retention setting.
 *
 * Everything is `IF NOT EXISTS`: dev runs with `synchronize: true`, so the
 * entities may already have created these objects before the migration runs.
 * `job_runs_single_running` is the rule that only one runner per job may be
 * `running` at a time (two replicas, or a manual trigger during a cron).
 */
export class Diagnostics1792000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS system_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reference varchar(16) NOT NULL,
      level varchar(10) NOT NULL,
      kind varchar(50) NOT NULL,
      message text NOT NULL,
      error_name varchar(100),
      stack text,
      status_code smallint,
      request_id varchar(64),
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      user_roles text[],
      method varchar(8),
      path varchar(500),
      params jsonb,
      query jsonb,
      body jsonb,
      entity varchar(100),
      entity_id varchar(64),
      details jsonb,
      app_commit varchar(40),
      source varchar(16) NOT NULL,
      job_run_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS system_events_reference_uq ON system_events(reference)`);
    await q.query(`CREATE INDEX IF NOT EXISTS system_events_created_at_idx ON system_events(created_at)`);
    await q.query(`CREATE INDEX IF NOT EXISTS system_events_kind_created_idx ON system_events(kind, created_at)`);
    await q.query(`CREATE INDEX IF NOT EXISTS system_events_request_id_idx ON system_events(request_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS system_events_user_id_idx ON system_events(user_id)`);

    await q.query(`CREATE TABLE IF NOT EXISTS job_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(80) NOT NULL,
      status varchar(10) NOT NULL,
      skip_reason varchar(200),
      started_at timestamptz NOT NULL,
      finished_at timestamptz,
      duration_ms integer,
      counts jsonb,
      notes jsonb,
      error_message text,
      error_reference varchar(16),
      host varchar(100),
      app_commit varchar(40),
      trigger varchar(10) NOT NULL DEFAULT 'cron',
      triggered_by uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS job_runs_name_started_idx ON job_runs(name, started_at)`);
    await q.query(`CREATE INDEX IF NOT EXISTS job_runs_created_at_idx ON job_runs(created_at)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS job_runs_single_running ON job_runs(name) WHERE status = 'running'`);

    await q.query(`CREATE TABLE IF NOT EXISTS delivery_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      channel varchar(20) NOT NULL,
      provider varchar(50),
      event_type varchar(100),
      target_masked varchar(120),
      entity varchar(100),
      entity_id varchar(64),
      request_summary jsonb,
      response_status smallint,
      response_body text,
      success boolean NOT NULL,
      error text,
      duration_ms integer,
      request_id varchar(64),
      job_run_id uuid,
      user_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS delivery_attempts_created_at_idx ON delivery_attempts(created_at)`);
    await q.query(`CREATE INDEX IF NOT EXISTS delivery_attempts_channel_idx ON delivery_attempts(channel, success, created_at)`);
    await q.query(`CREATE INDEX IF NOT EXISTS delivery_attempts_entity_idx ON delivery_attempts(entity, entity_id)`);

    await q.query(`CREATE TABLE IF NOT EXISTS client_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      kind varchar(30) NOT NULL,
      message text NOT NULL,
      stack text,
      page_url varchar(500),
      user_agent varchar(300),
      app_commit varchar(40),
      api_reference varchar(16),
      request_id varchar(64),
      status_code smallint,
      details jsonb,
      occurred_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS client_events_created_at_idx ON client_events(created_at)`);
    await q.query(`CREATE INDEX IF NOT EXISTS client_events_user_created_idx ON client_events(user_id, created_at)`);
    await q.query(`CREATE INDEX IF NOT EXISTS client_events_api_reference_idx ON client_events(api_reference)`);

    // The bug-report form will attach what the browser knows (page, agent,
    // app and API commit, recent error references) so a ticket carries its
    // own evidence. Visible to triagers only (bug-reports.service).
    await q.query(`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS client_context jsonb`);

    // Retention, editable in Settings without a deploy. 403 capture is on by
    // default because the "People" view needs it; validation 400s are noise
    // until someone asks for them.
    await q.query(`INSERT INTO app_settings (key, value, data_type, description, category, is_public, is_active)
      SELECT v.key, v.value::json, v.data_type, v.description, 'diagnostics', false, true
      FROM (VALUES
        ('diagnostics.retention_days', '30', 'number', 'Days to keep system events, job runs, delivery attempts and client events'),
        ('diagnostics.capture_403', 'true', 'boolean', 'Record permission refusals (403) so the People view can show who is being refused'),
        ('diagnostics.capture_validation', 'false', 'boolean', 'Record validation failures (400) as events; noisy, off by default'),
        ('diagnostics.allow_self_test', 'false', 'boolean', 'Allow POST /diagnostics/self-test in production')
      ) AS v(key, value, data_type, description)
      WHERE NOT EXISTS (SELECT 1 FROM app_settings s WHERE s.key = v.key)`);
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of ['system_events', 'job_runs', 'delivery_attempts', 'client_events']) {
      const [row] = await q.query(`SELECT count(*)::int AS n FROM ${table}`);
      if (row?.n) {
        throw new Error(`Refusing to drop ${table} while it holds ${row.n} rows; prune or export first`);
      }
    }
    await q.query('DROP TABLE IF EXISTS client_events');
    await q.query('DROP TABLE IF EXISTS delivery_attempts');
    await q.query('DROP TABLE IF EXISTS job_runs');
    await q.query('DROP TABLE IF EXISTS system_events');
    await q.query('ALTER TABLE bug_reports DROP COLUMN IF EXISTS client_context');
    await q.query(`DELETE FROM app_settings WHERE key LIKE 'diagnostics.%'`);
  }
}
