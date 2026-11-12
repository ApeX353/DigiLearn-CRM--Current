import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * S3 (DUBE-GITHUB-PORT.md): products carry a catalogue SKU and a sales
 * description that flows onto document line items.
 *
 * - `sku` is nullable + uniquely indexed: Postgres allows many NULLs under
 *   a UNIQUE index, so the whole legacy catalogue (no SKUs yet) never
 *   breaks the constraint.
 * - `description` is plain text; document_items snapshot it on selection,
 *   so later edits rewrite Draft lines only (PROD-BOARD rule unchanged).
 *
 * Guarded ADD COLUMN / CREATE INDEX IF NOT EXISTS, consistent with the
 * house style (see 1779-AddCampaignSlug).
 */
export class AddProductSkuAndDescription1780000000000
  implements MigrationInterface
{
  name = 'AddProductSkuAndDescription1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sku" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description" text`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_products_sku" ON "products" ("sku")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_products_sku"`);
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "description"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "sku"`,
    );
  }
}
