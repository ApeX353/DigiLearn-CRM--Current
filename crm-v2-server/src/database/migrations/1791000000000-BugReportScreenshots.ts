import { MigrationInterface, QueryRunner } from 'typeorm';

export class BugReportScreenshots1791000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE bug_report_screenshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bug_report_id uuid NOT NULL REFERENCES bug_reports(id) ON DELETE RESTRICT,
      slot smallint NOT NULL CHECK(slot BETWEEN 1 AND 3),
      file_name varchar(200) NOT NULL, file_type varchar(30) NOT NULL CHECK(file_type IN ('image/png','image/jpeg')),
      file_size integer NOT NULL CHECK(file_size BETWEEN 1 AND 1048576),
      sha256 char(64) NOT NULL, content bytea,
      uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      retention_due_at timestamptz, notified_at timestamptz,
      deleted_at timestamptz, deleted_by uuid REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT bug_screenshot_slot UNIQUE(bug_report_id,slot),
      CONSTRAINT bug_screenshot_bytes CHECK(
        (content IS NOT NULL AND octet_length(content)=file_size AND deleted_at IS NULL AND deleted_by IS NULL)
        OR (content IS NULL AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL))
    )`);
    await q.query(`CREATE INDEX bug_screenshot_retention_idx ON bug_report_screenshots(retention_due_at)
      WHERE deleted_at IS NULL AND notified_at IS NULL`);
    // Separate clock: the existing closed_at intentionally preserves FIRST closure.
    await q.query(`CREATE FUNCTION bug_screenshot_retention_transition() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
          IF NEW.status::text NOT IN ('done','closed') THEN
            UPDATE bug_report_screenshots SET retention_due_at=NULL,notified_at=NULL
              WHERE bug_report_id=NEW.id AND deleted_at IS NULL;
          ELSIF OLD.status::text NOT IN ('done','closed') THEN
            UPDATE bug_report_screenshots SET retention_due_at=clock_timestamp()+interval '30 days',notified_at=NULL
              WHERE bug_report_id=NEW.id AND deleted_at IS NULL;
          END IF;
        END IF;
        RETURN NEW;
      END $$`);
    await q.query(`CREATE TRIGGER bug_screenshot_retention AFTER UPDATE OF status ON bug_reports
      FOR EACH ROW EXECUTE FUNCTION bug_screenshot_retention_transition()`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query(
      'SELECT count(*)::int AS n FROM bug_report_screenshots',
    );
    if (row.n)
      throw new Error(
        'Refusing to drop screenshots or deletion history; export and approve recovery first',
      );
    await q.query('DROP TRIGGER bug_screenshot_retention ON bug_reports');
    await q.query('DROP FUNCTION bug_screenshot_retention_transition()');
    await q.query('DROP TABLE bug_report_screenshots');
  }
}
