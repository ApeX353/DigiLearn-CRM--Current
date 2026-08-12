import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * QUOTE4: persist currency on the quote instead of interpreting a bare total
 * using whatever the organisation setting happens to be today.
 *
 * Linked historical quotes inherit their deal's recorded currency. Unlinked
 * history stays NULL: assigning USD to an unknown historical amount would be
 * false data. QuotesService stamps every new quote explicitly.
 */
export class AddQuoteCurrency1781000000000 implements MigrationInterface {
  name = 'AddQuoteCurrency1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "currency" varchar(3)`,
    );
    await queryRunner.query(`
      UPDATE "quotes" q
      SET "currency" = UPPER(d."currency")
      FROM "deals" d
      WHERE q."deal_id" = d."id"
        AND q."currency" IS NULL
        AND d."currency" ~ '^[A-Za-z]{3}$'
    `);
    await queryRunner.query(`
      ALTER TABLE "quotes"
      DROP CONSTRAINT IF EXISTS "CHK_quotes_currency_code"
    `);
    await queryRunner.query(`
      ALTER TABLE "quotes"
      ADD CONSTRAINT "CHK_quotes_currency_code"
      CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$')
    `);

    // QUOTE1: protect every writer, including invoice conversion and future
    // jobs. A partial unique index would fail to install if production has
    // historical duplicates, so a transition trigger preserves those rows
    // while refusing every new second acceptance.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION enforce_one_accepted_quote_per_deal()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."status" = 'Accepted' AND NEW."deal_id" IS NOT NULL THEN
          -- Keep OLD inside the UPDATE branch: OLD is not assigned for an
          -- INSERT trigger invocation.
          IF TG_OP = 'INSERT'
             OR (TG_OP = 'UPDATE'
                 AND (OLD."status" IS DISTINCT FROM 'Accepted'
                      OR OLD."deal_id" IS DISTINCT FROM NEW."deal_id"))
          THEN
            -- Match the service's lock so direct SQL/future writers cannot
            -- race two Accepted transitions through the EXISTS check.
            PERFORM pg_advisory_xact_lock(hashtext(NEW."deal_id"::text));
            IF EXISTS (
               SELECT 1 FROM "quotes" q
               WHERE q."deal_id" = NEW."deal_id"
                 AND q."status" = 'Accepted'
                 AND q."id" <> NEW."id"
            ) THEN
              RAISE EXCEPTION 'Deal already has an Accepted quote'
                USING ERRCODE = '23505';
            END IF;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_quotes_one_accepted_per_deal" ON "quotes"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_quotes_one_accepted_per_deal"
      BEFORE INSERT OR UPDATE ON "quotes"
      FOR EACH ROW EXECUTE FUNCTION enforce_one_accepted_quote_per_deal()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_quotes_one_accepted_per_deal" ON "quotes"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS enforce_one_accepted_quote_per_deal()`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "CHK_quotes_currency_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" DROP COLUMN IF EXISTS "currency"`,
    );
  }
}
