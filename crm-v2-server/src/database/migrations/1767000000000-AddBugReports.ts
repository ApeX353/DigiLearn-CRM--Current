import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * In-house bug/issue ticket system (`bug_reports`).
 *
 * Any authenticated user can raise a ticket; admins/admin_support triage
 * (assign to a person, move through open → in_progress → resolved/closed).
 * Reporter FK is RESTRICT (a report keeps its author); assignee FK is
 * SET NULL so a user can still be deactivated/removed without orphaning
 * the table. Enum type names mirror TypeORM's auto-generated convention
 * (`bug_reports_<column>_enum`) so the entity and this migration agree.
 *
 * Guarded with hasTable, consistent with the other migrations, so a rerun
 * (or a fresh DB where synchronize already made the table) is a no-op.
 */
export class AddBugReports1767000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('bug_reports')) return;

    await queryRunner.createTable(
      new Table({
        name: 'bug_reports',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'title', type: 'varchar', length: '200' },
          { name: 'description', type: 'text' },
          {
            name: 'severity',
            type: 'enum',
            enumName: 'bug_reports_severity_enum',
            enum: ['low', 'medium', 'high', 'critical'],
            default: `'medium'`,
          },
          {
            name: 'status',
            type: 'enum',
            enumName: 'bug_reports_status_enum',
            enum: ['open', 'in_progress', 'resolved', 'closed'],
            default: `'open'`,
          },
          { name: 'page_url', type: 'varchar', length: '500', isNullable: true },
          { name: 'reported_by_id', type: 'uuid' },
          { name: 'assigned_to_id', type: 'uuid', isNullable: true },
          { name: 'resolution_note', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['reported_by_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            columnNames: ['assigned_to_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          }),
        ],
        indices: [
          new TableIndex({
            name: 'idx_bug_reports_status',
            columnNames: ['status'],
          }),
          new TableIndex({
            name: 'idx_bug_reports_reported_by',
            columnNames: ['reported_by_id'],
          }),
          new TableIndex({
            name: 'idx_bug_reports_assigned_to',
            columnNames: ['assigned_to_id'],
          }),
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('bug_reports')) {
      await queryRunner.dropTable('bug_reports');
      await queryRunner.query(`DROP TYPE IF EXISTS "bug_reports_severity_enum"`);
      await queryRunner.query(`DROP TYPE IF EXISTS "bug_reports_status_enum"`);
    }
  }
}
