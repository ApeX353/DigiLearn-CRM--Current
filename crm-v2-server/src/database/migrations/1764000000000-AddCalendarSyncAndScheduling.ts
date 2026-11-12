import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

/**
 * Section 2 of the activity spec: two-way calendar sync + Calendly-like
 * scheduling links + Zoom integration.
 *
 * We namespace the new tables under the modules that own them so
 * drop-column refactors don't leak across concerns.
 */
export class AddCalendarSyncAndScheduling1764000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- calendar-sync ----------------
    if (!(await queryRunner.hasTable('user_calendar_connections'))) {
      await queryRunner.createTable(
        new Table({
          name: 'user_calendar_connections',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'uuid_generate_v4()',
            },
            { name: 'user_id', type: 'uuid' },
            {
              name: 'provider',
              type: 'enum',
              enum: ['google', 'microsoft'],
            },
            { name: 'provider_account_id', type: 'varchar', length: '320' },
            {
              name: 'calendar_id',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            { name: 'encrypted_token_payload', type: 'text' },
            { name: 'sync_token', type: 'text', isNullable: true },
            {
              name: 'watch_channel_id',
              type: 'varchar',
              length: '128',
              isNullable: true,
            },
            {
              name: 'watch_expires_at',
              type: 'timestamp',
              isNullable: true,
            },
            {
              name: 'last_sync_at',
              type: 'timestamp',
              isNullable: true,
            },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
          foreignKeys: [
            {
              columnNames: ['user_id'],
              referencedTableName: 'users',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
      );
      await queryRunner.createIndex(
        'user_calendar_connections',
        new TableIndex({
          name: 'idx_user_calendar_user',
          columnNames: ['user_id'],
        }),
      );
      await queryRunner.createIndex(
        'user_calendar_connections',
        new TableIndex({
          name: 'uq_user_calendar_provider',
          columnNames: ['user_id', 'provider'],
          isUnique: true,
        }),
      );
    }

    if (!(await queryRunner.hasTable('calendar_event_links'))) {
      await queryRunner.createTable(
        new Table({
          name: 'calendar_event_links',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'uuid_generate_v4()',
            },
            { name: 'connection_id', type: 'uuid' },
            { name: 'activity_id', type: 'uuid' },
            { name: 'external_event_id', type: 'varchar', length: '255' },
            {
              name: 'etag',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            { name: 'html_link', type: 'text', isNullable: true },
            {
              name: 'last_pushed_at',
              type: 'timestamp',
              isNullable: true,
            },
            {
              name: 'last_pulled_at',
              type: 'timestamp',
              isNullable: true,
            },
            { name: 'cancelled_externally', type: 'boolean', default: false },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
          foreignKeys: [
            {
              columnNames: ['connection_id'],
              referencedTableName: 'user_calendar_connections',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
      );
      await queryRunner.createIndex(
        'calendar_event_links',
        new TableIndex({
          name: 'idx_cel_connection',
          columnNames: ['connection_id'],
        }),
      );
      await queryRunner.createIndex(
        'calendar_event_links',
        new TableIndex({
          name: 'idx_cel_activity',
          columnNames: ['activity_id'],
        }),
      );
      await queryRunner.createIndex(
        'calendar_event_links',
        new TableIndex({
          name: 'uq_cel_external',
          columnNames: ['connection_id', 'external_event_id'],
          isUnique: true,
        }),
      );
    }

    // ---------------- scheduling ----------------
    if (!(await queryRunner.hasTable('scheduling_links'))) {
      await queryRunner.createTable(
        new Table({
          name: 'scheduling_links',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'uuid_generate_v4()',
            },
            { name: 'owner_user_id', type: 'uuid' },
            { name: 'slug', type: 'varchar', length: '80' },
            { name: 'title', type: 'varchar', length: '200' },
            { name: 'description', type: 'text', isNullable: true },
            { name: 'location_type', type: 'varchar', length: '40' },
            {
              name: 'location_detail',
              type: 'varchar',
              length: '500',
              isNullable: true,
            },
            { name: 'duration_minutes', type: 'int' },
            { name: 'buffer_before_minutes', type: 'int', default: 0 },
            { name: 'buffer_after_minutes', type: 'int', default: 0 },
            { name: 'min_notice_minutes', type: 'int', default: 60 },
            { name: 'max_days_ahead', type: 'int', default: 30 },
            {
              name: 'availability',
              type: 'jsonb',
              isNullable: true,
              comment: 'Weekly availability windows in the owner timezone',
            },
            {
              name: 'timezone',
              type: 'varchar',
              length: '60',
              default: "'UTC'",
            },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
          foreignKeys: [
            {
              columnNames: ['owner_user_id'],
              referencedTableName: 'users',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
      );
      await queryRunner.createIndex(
        'scheduling_links',
        new TableIndex({
          name: 'uq_scheduling_link_slug',
          columnNames: ['slug'],
          isUnique: true,
        }),
      );
      await queryRunner.createIndex(
        'scheduling_links',
        new TableIndex({
          name: 'idx_scheduling_link_owner',
          columnNames: ['owner_user_id'],
        }),
      );
    }

    if (!(await queryRunner.hasTable('scheduling_holds'))) {
      await queryRunner.createTable(
        new Table({
          name: 'scheduling_holds',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'uuid_generate_v4()',
            },
            { name: 'link_id', type: 'uuid' },
            { name: 'start_at', type: 'timestamp' },
            { name: 'end_at', type: 'timestamp' },
            {
              name: 'invitee_email',
              type: 'varchar',
              length: '320',
              isNullable: true,
            },
            { name: 'expires_at', type: 'timestamp' },
            {
              name: 'status',
              type: 'enum',
              enum: ['pending', 'confirmed', 'cancelled', 'expired'],
              default: "'pending'",
            },
            {
              name: 'activity_id',
              type: 'uuid',
              isNullable: true,
              comment: 'Set when the hold is converted to a meeting',
            },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
          foreignKeys: [
            {
              columnNames: ['link_id'],
              referencedTableName: 'scheduling_links',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
      );
      await queryRunner.createIndex(
        'scheduling_holds',
        new TableIndex({
          name: 'idx_scheduling_hold_link_time',
          columnNames: ['link_id', 'start_at'],
        }),
      );
    }

    // ---------------- video integrations ----------------
    if (!(await queryRunner.hasTable('video_provider_connections'))) {
      await queryRunner.createTable(
        new Table({
          name: 'video_provider_connections',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'uuid_generate_v4()',
            },
            { name: 'user_id', type: 'uuid' },
            {
              name: 'provider',
              type: 'enum',
              enum: ['zoom', 'google_meet', 'teams'],
            },
            { name: 'provider_account_id', type: 'varchar', length: '320' },
            { name: 'encrypted_token_payload', type: 'text' },
            { name: 'is_active', type: 'boolean', default: true },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
          foreignKeys: [
            {
              columnNames: ['user_id'],
              referencedTableName: 'users',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
      );
      await queryRunner.createIndex(
        'video_provider_connections',
        new TableIndex({
          name: 'uq_video_provider_connection',
          columnNames: ['user_id', 'provider'],
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'video_provider_connections',
      'scheduling_holds',
      'scheduling_links',
      'calendar_event_links',
      'user_calendar_connections',
    ]) {
      if (await queryRunner.hasTable(table)) {
        await queryRunner.dropTable(table, true);
      }
    }
  }
}
