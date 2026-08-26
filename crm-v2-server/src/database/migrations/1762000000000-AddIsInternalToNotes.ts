import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Spec Section 3: "Internal notes are strictly private to the internal
 * team; they are never displayed on any external invoice, quote, or
 * client communication."
 *
 * Adds an `is_internal` flag on notes with a default of TRUE — meaning
 * every existing note is retroactively considered internal-only.  The
 * application layer hard-codes this to TRUE on create/update until we
 * ship a deliberate "public note" surface in a later release; keeping
 * the column nullable would leave open the door to data leaking into
 * customer-facing documents by accident.
 */
export class AddIsInternalToNotes1762000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('notes');
    if (!table) return;

    if (!(await queryRunner.hasColumn('notes', 'is_internal'))) {
      await queryRunner.addColumn(
        'notes',
        new TableColumn({
          name: 'is_internal',
          type: 'boolean',
          default: true,
          isNullable: false,
        }),
      );
      // Belt-and-braces: make absolutely sure existing rows are set.
      await queryRunner.query(
        `UPDATE notes SET is_internal = TRUE WHERE is_internal IS NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('notes', 'is_internal')) {
      await queryRunner.dropColumn('notes', 'is_internal');
    }
  }
}
