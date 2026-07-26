import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * "Date solved" on bug tickets (owner request 2026-07-26).
 *
 * Adds a nullable `resolved_at` to `bug_reports`, stamped by the service
 * when a ticket enters resolved/closed and cleared if it is reopened.
 * Open tickets keep no aging signal — this is the only date added.
 *
 * Backfills existing resolved/closed rows with `updated_at`, which is the
 * closest record of when they were flipped (accurate for everything
 * resolved through the tracker so far — tickets are not edited after
 * resolution).
 *
 * Guarded with hasColumn so a rerun (or a fresh DB where synchronize
 * already added the column) is a no-op.
 */
export class AddBugReportResolvedAt1768000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('bug_reports'))) return;
    if (await queryRunner.hasColumn('bug_reports', 'resolved_at')) return;

    await queryRunner.addColumn(
      'bug_reports',
      new TableColumn({
        name: 'resolved_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    await queryRunner.query(
      `UPDATE bug_reports
          SET resolved_at = updated_at
        WHERE status IN ('resolved', 'closed')
          AND resolved_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      (await queryRunner.hasTable('bug_reports')) &&
      (await queryRunner.hasColumn('bug_reports', 'resolved_at'))
    ) {
      await queryRunner.dropColumn('bug_reports', 'resolved_at');
    }
  }
}
