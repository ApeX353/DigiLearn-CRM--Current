import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BUG-028 / BUG-050 (AUDIT_COVERAGE_V2.md) — one payment term per document,
 * enforced by the database.
 *
 * The service checked "already has an applied term" and then inserted, with
 * nothing between the two, so three concurrent applies on one invoice
 * produced three applied terms, six child invoices and six instalments
 * (reproduced 8 Sep 2026 on a copy of production). The service now takes a
 * per-document advisory lock; this index is the invariant that holds even
 * if a future caller forgets to.
 *
 * Production carried 39 applied terms on 39 distinct documents on 4 Sep
 * 2026, so the unique index applies cleanly there. If a database somehow
 * holds duplicates, this migration does NOT throw — a throwing migration
 * crash-loops the API at boot — it leaves the plain index in place and
 * prints the offending documents, so the deploy watcher sees it and the
 * duplicates get resolved with a reviewed db-ops script first.
 */
export class UniqueAppliedPaymentTermPerDocument1787000000000
  implements MigrationInterface
{
  name = 'UniqueAppliedPaymentTermPerDocument1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates: Array<{
      document_id: string;
      document_type: string;
      n: string;
    }> = await queryRunner.query(`
      SELECT document_id, document_type, COUNT(*) AS n
        FROM applied_payment_terms
       GROUP BY document_id, document_type
      HAVING COUNT(*) > 1
    `);

    if (duplicates.length > 0) {
      console.warn(
        `[migration ${this.name}] NOT applied: ${duplicates.length} document(s) ` +
          `carry more than one applied payment term. Resolve them with a ` +
          `db-ops script, then re-run. ` +
          duplicates
            .map((d) => `${d.document_type} ${d.document_id} x${d.n}`)
            .join('; '),
      );
      return;
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_applied_payment_terms_document"
      ON "applied_payment_terms" ("document_id", "document_type")
    `);
    // The plain index from InitialSchema covers the same columns and is
    // now redundant.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_fe66cf9573a1bb1c639be096e2"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_fe66cf9573a1bb1c639be096e2"
      ON "applied_payment_terms" ("document_id", "document_type")
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_applied_payment_terms_document"`,
    );
  }
}
