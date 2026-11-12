import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two hygiene debts the integrity sweep keeps finding, fixed at the root.
 *
 * 1. lead_qualification_criteria has no unique constraint on lead_id.
 *    Both write paths are read-then-save (the service's create() throws
 *    on an existing row, upsert() re-reads), so two concurrent saves
 *    that each find nothing both insert — production had grown 29 leads
 *    with duplicate rows, 28 of them byte-identical scores. Every reader
 *    (BANT chips, dashboards, conversion gate) assumes one row per lead.
 *    Dedupe keeping the most recently updated row, then add the unique
 *    index so the race turns into a loud conflict instead of silent
 *    double data.
 *
 * 2. Disqualifying a lead now cancels its open activity queue, but rows
 *    disqualified before that rule kept open, dated work — six tasks and
 *    meetings still sat on archived leads feeding reps' To-do queues
 *    with records nobody should touch. Cancel them the same way the
 *    live path does (notes excluded: they are records, not work).
 *
 * Idempotent: the dedupe matches nothing once unique, the index is
 * IF NOT EXISTS, and the cancel predicate empties itself.
 */
export class QualificationUniquePerLeadAndArchiveHygiene1785000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1a. Keep the newest row per lead (updated_at, then created_at, then
    //     id as the final deterministic tiebreak), delete the rest.
    await queryRunner.query(`
      DELETE FROM lead_qualification_criteria q
       USING lead_qualification_criteria keep
       WHERE q.lead_id = keep.lead_id
         AND q.id <> keep.id
         AND (q.updated_at, q.created_at, q.id)
             < (keep.updated_at, keep.created_at, keep.id)
    `);

    // 1b. Make one-row-per-lead a database fact.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_lead_qualification_lead"
        ON lead_qualification_criteria (lead_id)
    `);

    // 2. Archived leads carry no open work.
    await queryRunner.query(`
      UPDATE activities a
         SET status = 'cancelled', updated_at = NOW()
        FROM leads l
       WHERE l.id = a.lead_id
         AND l.status = 'Disqualified'
         AND a.status NOT IN ('completed', 'cancelled')
         AND a.type <> 'note'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_lead_qualification_lead"`,
    );
    // Deleted duplicates and cancelled stale work are not restored: the
    // duplicates carried no information (identical scores) and the work
    // belonged to dead records.
  }
}
