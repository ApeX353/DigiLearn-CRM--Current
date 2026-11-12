import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TEST-BACKLOG #12: a manager can raise an Enquiry on a review request —
 * ask the rep for more info, the rep answers, and the manager may ask again
 * before deciding. Modelled as a JSONB thread + an "awaiting rep" flag so the
 * status enum (pending/approved/rejected) is untouched.
 */
export class AddReversalRequestEnquiry1773000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('lead_reversal_requests'))) return;
    if (
      !(await queryRunner.hasColumn('lead_reversal_requests', 'enquiry_thread'))
    ) {
      await queryRunner.query(
        `ALTER TABLE lead_reversal_requests ADD COLUMN enquiry_thread jsonb NOT NULL DEFAULT '[]'`,
      );
    }
    if (
      !(await queryRunner.hasColumn(
        'lead_reversal_requests',
        'awaiting_rep_response',
      ))
    ) {
      await queryRunner.query(
        `ALTER TABLE lead_reversal_requests ADD COLUMN awaiting_rep_response boolean NOT NULL DEFAULT false`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('lead_reversal_requests'))) return;
    await queryRunner.query(
      `ALTER TABLE lead_reversal_requests DROP COLUMN IF EXISTS enquiry_thread`,
    );
    await queryRunner.query(
      `ALTER TABLE lead_reversal_requests DROP COLUMN IF EXISTS awaiting_rep_response`,
    );
  }
}
