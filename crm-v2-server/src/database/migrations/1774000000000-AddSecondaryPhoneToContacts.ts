import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Second phone number on contacts (CON1, owner decision).
 *
 * Headmasters often carry two numbers, so contacts gain an always-optional
 * `secondary_phone`. Nullable with no default — existing rows keep working
 * and nothing is ever required to fill it.
 *
 * Guarded with hasColumn so a rerun (or a fresh DB where synchronize already
 * added the column) is a no-op.
 */
export class AddSecondaryPhoneToContacts1774000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('contacts'))) return;
    if (await queryRunner.hasColumn('contacts', 'secondary_phone')) return;

    await queryRunner.addColumn(
      'contacts',
      new TableColumn({
        name: 'secondary_phone',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      (await queryRunner.hasTable('contacts')) &&
      (await queryRunner.hasColumn('contacts', 'secondary_phone'))
    ) {
      await queryRunner.dropColumn('contacts', 'secondary_phone');
    }
  }
}
