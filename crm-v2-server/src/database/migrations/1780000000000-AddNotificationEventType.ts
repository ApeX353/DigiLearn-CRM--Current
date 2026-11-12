import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/**
 * Persists the event preference key alongside an alert. The bell can then
 * group new alerts precisely, while its fallback classifier handles history.
 */
export class AddNotificationEventType1780000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('notifications'))) return;
    if (!(await queryRunner.hasColumn('notifications', 'event_type'))) {
      await queryRunner.addColumn(
        'notifications',
        new TableColumn({
          name: 'event_type',
          type: 'varchar',
          length: '100',
          isNullable: true,
        }),
      );
    }
    const table = await queryRunner.getTable('notifications');
    if (!table?.indices.some((index) => index.name === 'IDX_notifications_event_type')) {
      await queryRunner.createIndex(
        'notifications',
        new TableIndex({ name: 'IDX_notifications_event_type', columnNames: ['event_type'] }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('notifications'))) return;
    const table = await queryRunner.getTable('notifications');
    const index = table?.indices.find(
      (candidate) => candidate.name === 'IDX_notifications_event_type',
    );
    if (index) await queryRunner.dropIndex('notifications', index);
    if (await queryRunner.hasColumn('notifications', 'event_type')) {
      await queryRunner.dropColumn('notifications', 'event_type');
    }
  }
}
