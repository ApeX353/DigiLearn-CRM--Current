import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

/**
 * Section 3 of the activity spec: per-user email accounts (for sending
 * as the rep) and re-usable email templates with mail-merge.
 *
 * We keep the encrypted blob generic (text) so swapping algorithms
 * later doesn't require a schema change — the prefix in the blob
 * indicates which cipher was used.
 */
export class AddUserEmailAndTemplates1763000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('user_email_accounts'))) {
      await queryRunner.createTable(
        new Table({
          name: 'user_email_accounts',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'uuid_generate_v4()',
            },
            { name: 'user_id', type: 'uuid', isNullable: false },
            {
              name: 'provider',
              type: 'enum',
              enum: ['smtp', 'gmail', 'microsoft'],
              isNullable: false,
            },
            { name: 'email_address', type: 'varchar', length: '320' },
            {
              name: 'display_name',
              type: 'varchar',
              length: '200',
              isNullable: true,
            },
            { name: 'encrypted_credentials', type: 'text' },
            { name: 'is_default', type: 'boolean', default: false },
            { name: 'is_active', type: 'boolean', default: true },
            {
              name: 'last_verified_at',
              type: 'timestamp',
              isNullable: true,
            },
            {
              name: 'created_at',
              type: 'timestamp',
              default: 'now()',
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              default: 'now()',
            },
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
        'user_email_accounts',
        new TableIndex({
          name: 'idx_user_email_account_user',
          columnNames: ['user_id'],
        }),
      );

      await queryRunner.createIndex(
        'user_email_accounts',
        new TableIndex({
          name: 'uq_user_email_account_address',
          columnNames: ['user_id', 'email_address'],
          isUnique: true,
        }),
      );
    }

    if (!(await queryRunner.hasTable('email_templates'))) {
      await queryRunner.createTable(
        new Table({
          name: 'email_templates',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'uuid_generate_v4()',
            },
            { name: 'owner_user_id', type: 'uuid', isNullable: true },
            { name: 'slug', type: 'varchar', length: '120' },
            { name: 'name', type: 'varchar', length: '200' },
            { name: 'subject', type: 'varchar', length: '500' },
            { name: 'body_html', type: 'text' },
            { name: 'body_text', type: 'text', isNullable: true },
            { name: 'variables', type: 'jsonb', isNullable: true },
            {
              name: 'category',
              type: 'varchar',
              length: '60',
              isNullable: true,
            },
            { name: 'is_active', type: 'boolean', default: true },
            {
              name: 'created_at',
              type: 'timestamp',
              default: 'now()',
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              default: 'now()',
            },
          ],
          foreignKeys: [
            {
              columnNames: ['owner_user_id'],
              referencedTableName: 'users',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            },
          ],
        }),
      );

      await queryRunner.createIndex(
        'email_templates',
        new TableIndex({
          name: 'idx_email_template_owner',
          columnNames: ['owner_user_id'],
        }),
      );
      await queryRunner.createIndex(
        'email_templates',
        new TableIndex({
          name: 'idx_email_template_slug',
          columnNames: ['slug'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('email_templates')) {
      await queryRunner.dropTable('email_templates', true);
    }
    if (await queryRunner.hasTable('user_email_accounts')) {
      await queryRunner.dropTable('user_email_accounts', true);
    }
  }
}
