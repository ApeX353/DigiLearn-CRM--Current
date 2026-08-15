import { MigrationInterface, QueryRunner } from 'typeorm';

/** Investigation 3: audited payment entry and manager approval. */
export class AddPaymentEntryApprovals1783000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('payment_entry_requests'))) {
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE payment_entry_requests_status_enum AS ENUM
            ('pending', 'approved', 'rejected');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
      await queryRunner.query(`
        CREATE TABLE payment_entry_requests (
          id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
          amount numeric(12,2) NOT NULL CHECK (amount > 0),
          payment_date timestamp NOT NULL,
          method varchar(50) NULL,
          reference varchar(255) NULL,
          notes text NULL,
          invoice_total_snapshot numeric(12,2) NOT NULL,
          outstanding_snapshot numeric(12,2) NOT NULL,
          invoice_owner_id_snapshot uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          status payment_entry_requests_status_enum NOT NULL DEFAULT 'pending',
          requested_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          requested_at timestamp NOT NULL DEFAULT now(),
          reviewed_by_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
          reviewed_at timestamp NULL,
          review_note text NULL,
          resulting_payment_id uuid NULL UNIQUE,
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await queryRunner.query(
        `CREATE INDEX idx_payment_entry_requests_status_requested ON payment_entry_requests (status, requested_at)`,
      );
      await queryRunner.query(
        `CREATE INDEX idx_payment_entry_requests_invoice_status ON payment_entry_requests (invoice_id, status)`,
      );
      await queryRunner.query(
        `CREATE INDEX idx_payment_entry_requests_requester ON payment_entry_requests (requested_by_id)`,
      );
    }

    if (!(await queryRunner.hasColumn('payments', 'recorded_by_id'))) {
      await queryRunner.query(
        `ALTER TABLE payments ADD COLUMN recorded_by_id uuid NULL REFERENCES users(id) ON DELETE SET NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX idx_payments_recorded_by ON payments (recorded_by_id)`,
      );
      await queryRunner.query(`
        UPDATE payments p
           SET recorded_by_id = (
            SELECT al.actioned_by
              FROM activity_logs al
             WHERE lower(al.entity) = 'payment'
               AND al.entity_id = p.id
               AND al.action = 'create'
               AND al.actioned_by IS NOT NULL
             ORDER BY al.created_at ASC
             LIMIT 1
           )
         WHERE p.recorded_by_id IS NULL
           AND EXISTS (
             SELECT 1 FROM activity_logs al
              WHERE lower(al.entity) = 'payment'
                AND al.entity_id = p.id
                AND al.action = 'create'
                AND al.actioned_by IS NOT NULL
           )
      `);
    }

    if (!(await queryRunner.hasColumn('payments', 'payment_entry_request_id'))) {
      await queryRunner.query(
        `ALTER TABLE payments ADD COLUMN payment_entry_request_id uuid NULL UNIQUE REFERENCES payment_entry_requests(id) ON DELETE SET NULL`,
      );
    }

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE payment_entry_requests
          ADD CONSTRAINT fk_payment_entry_requests_resulting_payment
          FOREIGN KEY (resulting_payment_id) REFERENCES payments(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('payment_entry_requests')) {
      await queryRunner.query(
        `ALTER TABLE payment_entry_requests DROP CONSTRAINT IF EXISTS fk_payment_entry_requests_resulting_payment`,
      );
    }
    if (await queryRunner.hasColumn('payments', 'payment_entry_request_id')) {
      await queryRunner.query(
        `ALTER TABLE payments DROP COLUMN payment_entry_request_id`,
      );
    }
    if (await queryRunner.hasColumn('payments', 'recorded_by_id')) {
      await queryRunner.query(`DROP INDEX IF EXISTS idx_payments_recorded_by`);
      await queryRunner.query(`ALTER TABLE payments DROP COLUMN recorded_by_id`);
    }
    if (await queryRunner.hasTable('payment_entry_requests')) {
      await queryRunner.query(`DROP TABLE payment_entry_requests`);
    }
    await queryRunner.query(
      `DROP TYPE IF EXISTS payment_entry_requests_status_enum`,
    );
  }
}
