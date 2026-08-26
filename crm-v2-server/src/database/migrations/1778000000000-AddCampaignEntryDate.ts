import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R6 — add `entry_date` to campaigns: the date the campaign was entered into
 * the CRM (distinct from `start_date`, the event date). Backfilled from each
 * campaign's creation date so existing rows carry a sensible value. Nullable
 * and editable.
 */
export class AddCampaignEntryDate1778000000000 implements MigrationInterface {
  name = 'AddCampaignEntryDate1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "entry_date" date`,
    );
    // Backfill: existing campaigns take their creation date as the entry date.
    await queryRunner.query(
      `UPDATE "campaigns" SET "entry_date" = "created_at"::date WHERE "entry_date" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "entry_date"`,
    );
  }
}
