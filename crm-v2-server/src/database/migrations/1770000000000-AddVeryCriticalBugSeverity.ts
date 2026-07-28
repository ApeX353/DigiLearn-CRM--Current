import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A severity above "critical" (owner request 2026-07-28).
 *
 * The codebase audit of 28 July found faults an ordinary user can exploit
 * today — reading and changing other people's deals, finance records
 * mutated across owners, credentials that can fall back to a guessable
 * key. Those sit above the existing "critical" band, which is already in
 * use for serious but contained defects, so the board needs a level that
 * means drop everything.
 *
 * Postgres 12+ allows ADD VALUE inside a transaction provided the new
 * value is not used in the same transaction — nothing here uses it.
 * Guarded so a rerun is a no-op.
 */
export class AddVeryCriticalBugSeverity1770000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ exists }] = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'bug_reports_severity_enum'
          AND e.enumlabel = 'very_critical'
      ) AS exists
    `)) as Array<{ exists: boolean }>;
    if (exists) return;

    await queryRunner.query(
      `ALTER TYPE "public"."bug_reports_severity_enum" ADD VALUE IF NOT EXISTS 'very_critical' AFTER 'critical'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop a value from an enum type. Reversing this means
    // recreating the type and rewriting the column, which would risk the
    // ticket data for no benefit — deliberately left in place.
  }
}
