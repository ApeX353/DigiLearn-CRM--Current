import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FIN-06 (20 Oct 2026): the database keeps the money rules that the
 * services now enforce, so a direct write, a script or a future bug cannot
 * put a row where the arithmetic cannot follow.
 *
 * Every constraint is added NOT VALID (it binds new and changed rows at
 * once) and validated only when the existing rows already satisfy it, so
 * this migration never fails on historical data; a cohort that does not
 * yet satisfy a rule is reported by the nightly reconciliation instead.
 * Production, checked read-only on 19 Oct: no negative money figures, no
 * orphan instalments, no repeated bank reference on an invoice.
 *
 *  - payments.amount > 0; payment_allocations.allocated_amount > 0;
 *    instalment and invoice money figures >= 0.
 *  - payments -> invoices: ON DELETE RESTRICT instead of CASCADE. Deleting
 *    an invoice silently deleted its receipts (BUG-044); the service refuses
 *    it already, now the database does too.
 *  - installments -> invoices: a real foreign key (ON DELETE CASCADE: a
 *    schedule is part of its invoice, and an invoice holding money cannot
 *    be deleted anyway). Staging's clone holds 36 orphan instalments from
 *    the days before the key, so there it stays NOT VALID until reviewed.
 *  - one bank reference per invoice: a unique index, the backstop behind
 *    payment_commands (FIN-04). Skipped with a notice where duplicates exist.
 */
export class FinanceConstraints1796000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await this.check(q, 'payments', 'payments_amount_positive', 'amount > 0');
    await this.check(q, 'payment_allocations', 'payment_allocations_amount_positive', 'allocated_amount > 0');
    await this.check(q, 'installments', 'installments_amounts_nonnegative', 'amount >= 0 AND paid_amount >= 0 AND balance >= 0');
    await this.check(q, 'invoices', 'invoices_amounts_nonnegative', 'total >= 0 AND subtotal >= 0 AND discount >= 0 AND tax >= 0 AND amount_paid >= 0');

    // payments -> invoices: RESTRICT
    await q.query(`DO $$
      DECLARE c text;
      BEGIN
        SELECT conname INTO c FROM pg_constraint
         WHERE conrelid = 'payments'::regclass AND contype = 'f' AND confrelid = 'invoices'::regclass
         AND conname <> 'payments_invoice_fk';
        IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I', c); END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_invoice_fk') THEN
          ALTER TABLE payments ADD CONSTRAINT payments_invoice_fk
            FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;
        END IF;
      END $$`);

    // installments -> invoices: a real key, validated only when clean
    await q.query(`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installments_invoice_fk') THEN
          ALTER TABLE installments ADD CONSTRAINT installments_invoice_fk
            FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM installments i WHERE i.invoice_id IS NOT NULL
                       AND NOT EXISTS (SELECT 1 FROM invoices v WHERE v.id = i.invoice_id)) THEN
          ALTER TABLE installments VALIDATE CONSTRAINT installments_invoice_fk;
        ELSE
          RAISE NOTICE 'installments_invoice_fk left NOT VALID: orphan instalments exist';
        END IF;
      END $$`);

    // one bank reference per invoice
    await q.query(`DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM payments GROUP BY invoice_id, lower(btrim(reference)) HAVING count(*) > 1) THEN
          RAISE NOTICE 'payments_invoice_reference_uq skipped: duplicate references exist';
        ELSIF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'payments_invoice_reference_uq') THEN
          CREATE UNIQUE INDEX payments_invoice_reference_uq ON payments (invoice_id, lower(btrim(reference)));
        END IF;
      END $$`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS payments_invoice_reference_uq`);
    await q.query(`ALTER TABLE installments DROP CONSTRAINT IF EXISTS installments_invoice_fk`);
    await q.query(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_amounts_nonnegative`);
    await q.query(`ALTER TABLE installments DROP CONSTRAINT IF EXISTS installments_amounts_nonnegative`);
    await q.query(`ALTER TABLE payment_allocations DROP CONSTRAINT IF EXISTS payment_allocations_amount_positive`);
    await q.query(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_positive`);
    // The payments -> invoices key stays RESTRICT on the way down: going back
    // to CASCADE would reintroduce silent receipt deletion.
  }

  private async check(q: QueryRunner, table: string, name: string, expr: string): Promise<void> {
    await q.query(`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
          ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${expr}) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM ${table} WHERE NOT (${expr})) THEN
          ALTER TABLE ${table} VALIDATE CONSTRAINT ${name};
        ELSE
          RAISE NOTICE '${name} left NOT VALID: existing rows violate it';
        END IF;
      END $$`);
  }
}
