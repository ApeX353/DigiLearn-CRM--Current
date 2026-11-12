import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ticket 264a010e — the audit trail could not tell a script from the person
 * who ran it.
 *
 * On 27 Jul 2026, 15:10-15:24, a repair run wrote 1,281 activity completions
 * under one real user's account at ~100 rows a minute. Nothing in the trail
 * marked them as automated, so they read as that person's own sales work.
 *
 * Existing rows are left as 'user'. Backfilling the 27 Jul burst to 'script'
 * is deliberately NOT done here: it is a judgement about historical data and
 * belongs in a reviewed db-ops script, not in a schema migration that runs
 * unattended on boot.
 */
export class AddAuditSourceToActivityLogs1786000000000
  implements MigrationInterface
{
  name = 'AddAuditSourceToActivityLogs1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "activity_logs"
      ADD COLUMN IF NOT EXISTS "source" character varying(16) NOT NULL DEFAULT 'user'
    `);
    await queryRunner.query(`
      ALTER TABLE "activity_logs"
      ADD COLUMN IF NOT EXISTS "automation_reason" character varying(200)
    `);
    // The point of the column is to filter automation out of "who did what",
    // so that query must not seq-scan the whole table.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activity_logs_source"
      ON "activity_logs" ("source")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_activity_logs_source"`);
    await queryRunner.query(
      `ALTER TABLE "activity_logs" DROP COLUMN IF EXISTS "automation_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_logs" DROP COLUMN IF EXISTS "source"`,
    );
  }
}
