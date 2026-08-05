import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Work-Tracker redesign, phase 1 schema
 * (BUG-TRACKER-CLASSIFICATION-REDESIGN.md, 2026-08-02).
 *
 * The tracker was bug-only; production held features, data tasks and
 * investigations that could only be "marked" by abusing the title or the
 * `closed` status. This migration gives the table an honest data model:
 *
 *   - `work_type`  enum bug|feature|data_task|investigation|task (def bug)
 *   - `priority`   enum p0|p1|p2|p3|backlog (nullable — separate from
 *                  severity, which stays a bug-impact measure)
 *   - `component`  varchar, and `labels` jsonb[] (security/payments/…)
 *   - status enum EXTENDED with backlog/verification/done/duplicate/
 *     cancelled/wont_do — the four legacy values are kept, never dropped
 *   - `duplicate_of_id` uuid FK (self, SET NULL)
 *   - lifecycle stamps triaged_at/started_at/verified_at/closed_at
 *   - indexes on work_type and priority (status is already indexed)
 *
 * Every step is guarded (hasColumn / IF NOT EXISTS / catch duplicate_object)
 * so a rerun — or a fresh dev DB where synchronize already added the
 * columns — is a no-op. The new status VALUES are added here but NOT used;
 * the classification backfill that consumes them lives in the next
 * migration (1776…), because Postgres forbids using a freshly-added enum
 * value in the same transaction that added it.
 */
export class AddWorkTrackerFields1775000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('bug_reports'))) return;

    // --- enum types for the new columns ---------------------------------
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "bug_reports_work_type_enum" AS ENUM
          ('bug', 'feature', 'data_task', 'investigation', 'task');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "bug_reports_priority_enum" AS ENUM
          ('p0', 'p1', 'p2', 'p3', 'backlog');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // --- new columns (guarded individually) -----------------------------
    if (!(await queryRunner.hasColumn('bug_reports', 'work_type'))) {
      await queryRunner.query(
        `ALTER TABLE "bug_reports" ADD COLUMN "work_type" ` +
          `"bug_reports_work_type_enum" NOT NULL DEFAULT 'bug'`,
      );
    }
    if (!(await queryRunner.hasColumn('bug_reports', 'priority'))) {
      await queryRunner.query(
        `ALTER TABLE "bug_reports" ADD COLUMN "priority" ` +
          `"bug_reports_priority_enum" NULL`,
      );
    }
    if (!(await queryRunner.hasColumn('bug_reports', 'component'))) {
      await queryRunner.query(
        `ALTER TABLE "bug_reports" ADD COLUMN "component" varchar(100) NULL`,
      );
    }
    if (!(await queryRunner.hasColumn('bug_reports', 'labels'))) {
      await queryRunner.query(
        `ALTER TABLE "bug_reports" ADD COLUMN "labels" jsonb NOT NULL DEFAULT '[]'`,
      );
    }
    if (!(await queryRunner.hasColumn('bug_reports', 'duplicate_of_id'))) {
      await queryRunner.query(
        `ALTER TABLE "bug_reports" ADD COLUMN "duplicate_of_id" uuid NULL`,
      );
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "bug_reports"
            ADD CONSTRAINT "fk_bug_reports_duplicate_of"
            FOREIGN KEY ("duplicate_of_id")
            REFERENCES "bug_reports"("id") ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    }
    for (const col of ['triaged_at', 'started_at', 'verified_at', 'closed_at']) {
      if (!(await queryRunner.hasColumn('bug_reports', col))) {
        await queryRunner.query(
          `ALTER TABLE "bug_reports" ADD COLUMN "${col}" timestamp NULL`,
        );
      }
    }

    // --- extend the status enum (values only; used by the next migration)
    for (const value of [
      'backlog',
      'verification',
      'done',
      'duplicate',
      'cancelled',
      'wont_do',
    ]) {
      await queryRunner.query(
        `ALTER TYPE "bug_reports_status_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }

    // --- indexes --------------------------------------------------------
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_bug_reports_work_type" ` +
        `ON "bug_reports" ("work_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_bug_reports_priority" ` +
        `ON "bug_reports" ("priority")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('bug_reports'))) return;

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bug_reports_priority"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bug_reports_work_type"`);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bug_reports" DROP CONSTRAINT "fk_bug_reports_duplicate_of";
      EXCEPTION WHEN undefined_object THEN NULL; END $$;
    `);

    for (const col of [
      'duplicate_of_id',
      'closed_at',
      'verified_at',
      'started_at',
      'triaged_at',
      'labels',
      'component',
      'priority',
      'work_type',
    ]) {
      if (await queryRunner.hasColumn('bug_reports', col)) {
        await queryRunner.query(
          `ALTER TABLE "bug_reports" DROP COLUMN "${col}"`,
        );
      }
    }

    await queryRunner.query(`DROP TYPE IF EXISTS "bug_reports_priority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bug_reports_work_type_enum"`);
    // The added status enum VALUES are intentionally left in place:
    // Postgres cannot drop an enum value without recreating the type, which
    // would risk the ticket data for no benefit.
  }
}
