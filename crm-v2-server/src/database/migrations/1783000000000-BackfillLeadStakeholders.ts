import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Give every lead that already has a primary contact the stakeholder row
 * the qualification flow needs.
 *
 * Completing qualification requires nominating a decision maker, and
 * that picker lists `lead_stakeholders`. Only the create-lead-with-
 * contacts path ever wrote those rows, so leads that arrived by import,
 * by social handoff, or through any earlier version of the code had
 * none — 1,721 of 1,722 leads in production. The rep opened the
 * qualification modal, read "No stakeholders found. Add contacts to
 * this lead first." while looking at the contact they had already
 * captured, and could go no further: the lead could never be qualified,
 * so it could never be converted.
 *
 * INFLUENCER, not DECISION_MAKER, on purpose. The BANT criterion is
 * "decision maker identified", and identifying them is a judgement a
 * human makes. Backfilling everyone as the decision maker would tick
 * that box for 1,721 leads nobody has actually reviewed and inflate the
 * qualification scores the pipeline is managed on. This only puts the
 * contact on the list so the rep can choose.
 *
 * Idempotent: only inserts where no stakeholder row exists yet, so it is
 * safe to re-run and safe alongside the self-heal in
 * LeadsService.findLeadStakeholders.
 */
export class BackfillLeadStakeholders1783000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO lead_stakeholders
        (id, lead_id, contact_id, role, decision_role, influence_level, is_primary, notes)
      SELECT
        uuid_generate_v4(),
        l.id,
        l.primary_contact_id,
        -- contacts.role and lead_stakeholders.role are separate Postgres
        -- enum types that happen to carry identical labels, so the value
        -- has to go via text; a direct assignment is a type error.
        c.role::text::lead_stakeholders_role_enum,
        'influencer',
        'medium',
        true,
        ''
      FROM leads l
      JOIN contacts c ON c.id = l.primary_contact_id
      WHERE l.primary_contact_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM lead_stakeholders s WHERE s.lead_id = l.id
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove only the rows this migration could have created: primary,
    // influencer, no notes, and matching the lead's own primary contact.
    // A stakeholder a rep has since edited or promoted no longer matches
    // and is left alone.
    await queryRunner.query(`
      DELETE FROM lead_stakeholders s
      USING leads l
      WHERE s.lead_id = l.id
        AND s.contact_id = l.primary_contact_id
        AND s.is_primary = true
        AND s.decision_role = 'influencer'
        AND s.influence_level = 'medium'
        AND (s.notes IS NULL OR s.notes = '')
    `);
  }
}
