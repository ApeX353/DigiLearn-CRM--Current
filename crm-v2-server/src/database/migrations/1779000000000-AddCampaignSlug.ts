import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a human URL `slug` to campaigns so detail pages can live at
 * `/campaigns/<slug>` instead of exposing the raw uuid. The column is
 * nullable + uniquely indexed (Postgres allows many NULLs under a UNIQUE
 * index, so legacy rows that somehow miss a slug never break the constraint,
 * and the app always falls back to the uuid lookup).
 *
 * Existing rows are backfilled from a slugified `name`, de-duplicating
 * collisions by appending `-2`, `-3`, … in creation order so the result is
 * stable. Guarded with ADD COLUMN / CREATE INDEX IF NOT EXISTS, consistent
 * with the other campaign migrations.
 */

/** Mirror of CampaignsService.slugify — keep the two in sync. */
function slugify(name: string): string {
  const base = (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return base || 'campaign';
}

export class AddCampaignSlug1779000000000 implements MigrationInterface {
  name = 'AddCampaignSlug1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "slug" text`,
    );

    // Backfill every row still missing a slug, de-duplicating collisions.
    const used = new Set<string>();
    const existing: Array<{ slug: string | null }> = await queryRunner.query(
      `SELECT "slug" FROM "campaigns" WHERE "slug" IS NOT NULL`,
    );
    for (const row of existing) {
      if (row.slug) used.add(row.slug);
    }

    const rows: Array<{ id: string; name: string }> = await queryRunner.query(
      `SELECT "id", "name" FROM "campaigns" WHERE "slug" IS NULL ORDER BY "created_at" ASC`,
    );
    for (const row of rows) {
      const base = slugify(row.name);
      let candidate = base;
      let n = 2;
      while (used.has(candidate)) {
        candidate = `${base}-${n++}`;
      }
      used.add(candidate);
      await queryRunner.query(
        `UPDATE "campaigns" SET "slug" = $1 WHERE "id" = $2`,
        [candidate, row.id],
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_campaigns_slug" ON "campaigns" ("slug")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_campaigns_slug"`);
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "slug"`,
    );
  }
}
