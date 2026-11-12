import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Product-as-data for leads. The column is nullable so historical records are
 * not guessed or rewritten. The guarded migration is safe to re-run.
 */
export class AddLeadProduct1782000000000 implements MigrationInterface {
  name = 'AddLeadProduct1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "product_id" uuid`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_leads_product_id'
        ) THEN
          ALTER TABLE "leads"
          ADD CONSTRAINT "FK_leads_product_id"
          FOREIGN KEY ("product_id") REFERENCES "products"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_leads_product_id" ON "leads" ("product_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_leads_product_id"`);
    await queryRunner.query(
      `ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "FK_leads_product_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" DROP COLUMN IF EXISTS "product_id"`,
    );
  }
}
