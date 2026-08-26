import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AUTO1 + AUTO2 (owner spec, 2026-07-27 meeting): the auto-assign engine
 * must propose, a manager must approve before anything is assigned, and
 * routing goes by location first, evening out lead counts second.
 *
 * - `lead_assignment_proposals` holds the pending suggestions with a
 *   plain-language reason for the approving manager.
 * - `users.territory_provinces` holds the provinces a rep covers, as a
 *   JSON array in text (e.g. ["Bulawayo","Matabeleland South"]). Empty /
 *   NULL means "no territory configured" and the rep competes for every
 *   lead on load alone.
 */
export class AddAssignmentProposalsAndTerritories1771000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('lead_assignment_proposals'))) {
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE lead_assignment_proposals_status_enum AS ENUM
            ('pending', 'approved', 'rejected', 'superseded');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
      await queryRunner.query(`
        CREATE TABLE lead_assignment_proposals (
          id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
          proposed_rep_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reason text NOT NULL,
          status lead_assignment_proposals_status_enum NOT NULL DEFAULT 'pending',
          decided_by_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
          decided_at timestamp NULL,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await queryRunner.query(
        `CREATE INDEX idx_lap_status ON lead_assignment_proposals (status)`,
      );
      await queryRunner.query(
        `CREATE INDEX idx_lap_lead_status ON lead_assignment_proposals (lead_id, status)`,
      );
    }

    if (
      (await queryRunner.hasTable('users')) &&
      !(await queryRunner.hasColumn('users', 'territory_provinces'))
    ) {
      await queryRunner.query(
        `ALTER TABLE users ADD COLUMN territory_provinces text NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('lead_assignment_proposals')) {
      await queryRunner.query(`DROP TABLE lead_assignment_proposals`);
      await queryRunner.query(
        `DROP TYPE IF EXISTS lead_assignment_proposals_status_enum`,
      );
    }
    if (
      (await queryRunner.hasTable('users')) &&
      (await queryRunner.hasColumn('users', 'territory_provinces'))
    ) {
      await queryRunner.query(
        `ALTER TABLE users DROP COLUMN territory_provinces`,
      );
    }
  }
}
