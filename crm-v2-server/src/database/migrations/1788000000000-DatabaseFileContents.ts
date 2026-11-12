import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive only: never rewrites existing external files or preview links. */
export class DatabaseFileContents1788000000000 implements MigrationInterface {
  name = 'DatabaseFileContents1788000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE managed_files_provider_enum ADD VALUE IF NOT EXISTS 'database'`,
    );
    await queryRunner.query(`
      CREATE TABLE managed_file_contents (
        file_id uuid PRIMARY KEY REFERENCES managed_files(id) ON DELETE CASCADE,
        content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 10485760),
        sha256 char(64) NOT NULL
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [counts] = await queryRunner.query(`
      SELECT (SELECT count(*) FROM managed_file_contents) AS contents,
             (SELECT count(*) FROM managed_files WHERE provider::text = 'database') AS files
    `);
    if (Number(counts.contents) || Number(counts.files)) {
      throw new Error(
        'Refusing to discard database files. Export and verify their bytes before an approved rollback.',
      );
    }
    await queryRunner.query('DROP TABLE managed_file_contents');
    // PostgreSQL cannot remove one enum label safely. Keep the harmless addition.
  }
}
