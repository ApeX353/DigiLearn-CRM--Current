import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * City becomes optional on schools (owner decision 2026-07-27).
 *
 * The Nash import file carries no city, and requiring one forced every
 * imported row to fail or lie. A school may now be saved without a city;
 * the client renders "Click here to enter city" on such schools and any
 * signed-in user can fill it in (see PATCH /schools/:id/city).
 *
 * DROP NOT NULL is a no-op when the column is already nullable, but the
 * hasTable/hasColumn guards keep a rerun safe on any database state.
 */
export class MakeSchoolCityNullable1769000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('schools'))) return;
    if (!(await queryRunner.hasColumn('schools', 'city'))) return;

    await queryRunner.query(
      `ALTER TABLE schools ALTER COLUMN city DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('schools'))) return;
    if (!(await queryRunner.hasColumn('schools', 'city'))) return;

    // A NULL city cannot survive NOT NULL; empty string is the least-wrong
    // stand-in on rollback.
    await queryRunner.query(`UPDATE schools SET city = '' WHERE city IS NULL`);
    await queryRunner.query(
      `ALTER TABLE schools ALTER COLUMN city SET NOT NULL`,
    );
  }
}
