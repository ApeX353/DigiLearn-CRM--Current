import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TEST-BACKLOG §2 (2026-07-30): imports must NOT create live leads. A bulk
 * import is parsed and dedup-checked into a PENDING batch; only on manager
 * approval are the real schools/leads created. `lead_import_batches` is that
 * staging area — the rows live as JSONB with per-row duplicate flags and a
 * reviewer decision, and the batch optionally attributes to a campaign.
 */
export class AddLeadImportBatches1772000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('lead_import_batches')) return;

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE lead_import_batches_status_enum AS ENUM
          ('pending', 'approved', 'rejected');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE lead_import_batches (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        filename varchar(255) NULL,
        uploaded_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        campaign_id uuid NULL REFERENCES campaigns(id) ON DELETE SET NULL,
        status lead_import_batches_status_enum NOT NULL DEFAULT 'pending',
        rows jsonb NOT NULL DEFAULT '[]',
        total_rows int NOT NULL DEFAULT 0,
        importable_count int NOT NULL DEFAULT 0,
        duplicate_count int NOT NULL DEFAULT 0,
        created_count int NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        decided_at timestamp NULL,
        decided_by_id uuid NULL REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_lib_status ON lead_import_batches (status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('lead_import_batches')) {
      await queryRunner.query(`DROP TABLE lead_import_batches`);
      await queryRunner.query(
        `DROP TYPE IF EXISTS lead_import_batches_status_enum`,
      );
    }
  }
}
