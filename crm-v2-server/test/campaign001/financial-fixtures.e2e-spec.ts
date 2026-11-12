/**
 * Campaign 001 — financial fixture foundation.
 *
 * Builds the synthetic ledger the later payment/invoice tests will use and
 * checks it with SQL only (no application recalculation):
 *
 *   Invoice USD 1,000 · payment 300 · payment 250 · outstanding 450
 *   Instalment schedule 400 + 600 on a 1,000 invoice
 *
 * It also pins the database-level rules that reached production on 21 Oct
 * (migration 1796 FinanceConstraints), because every later financial test
 * depends on them existing: positive amounts, RESTRICT on invoice delete,
 * unique payment reference per invoice.
 *
 * Scenarios that need the real PaymentsService/InvoicesService HTTP path
 * (corrections, concurrency, cancellation, rollback) are DESIGNED here as
 * explicit todos and were not executed in this campaign.
 */
import { DisposableDatabase } from './support/disposable-db';
import { Fixtures } from './support/fixtures';
import { Invariants } from './support/invariants';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { SRC_DIR } from './support/disposable-db';
import { JwtService } from '@nestjs/jwt';

describe('financial fixtures — synthetic ledger asserted from the database', () => {
  let db: DisposableDatabase;
  let ds: DataSource;
  let fx: Fixtures;
  let inv: Invariants;

  let ownerId: string;
  let schoolId: string;
  let invoiceId: string;

  beforeAll(async () => {
    db = await DisposableDatabase.create();
    await db.runMigrations();
    ds = new DataSource({
      ...db.connectionOptions(),
      entities: [join(SRC_DIR, '**', '*.entity{.ts,.js}')],
    });
    await ds.initialize();
    // Fixtures only need a JwtService for token minting; none is minted here.
    fx = new Fixtures(ds, new JwtService({ secret: 'unused-in-this-spec' }));
    inv = new Invariants(ds);

    const role = await fx.role('owner_rep', [{ action: 'read', subject: 'Invoice', conditions: null }]);
    const owner = await fx.user('owner', [role]);
    ownerId = owner.id;
    schoolId = (await fx.school('Ledger')).id;
  }, 180_000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (db) await db.drop();
  });

  describe('USD 1,000 invoice with two partial payments', () => {
    it('creates the invoice with total 1000 and nothing paid', async () => {
      invoiceId = (await fx.invoice({ ownerId, schoolId, total: 1000 })).id;
      const row = await inv.invoiceRow(invoiceId);
      expect(Number(row.total)).toBe(1000);
      expect(Number(row.amount_paid)).toBe(0);
      expect(await inv.paymentsTotal(invoiceId)).toBe(0);
      expect(await inv.outstanding(invoiceId)).toBe(1000);
    });

    it('records a first payment of 300 → ledger outstanding 700', async () => {
      await fx.payment(invoiceId, 300, 'FIRST-300');
      expect(await inv.count('payments', 'invoice_id = $1', [invoiceId])).toBe(1);
      expect(await inv.paymentsTotal(invoiceId)).toBe(300);
      expect(await inv.outstanding(invoiceId)).toBe(700);
    });

    it('records a second payment of 250 → ledger outstanding 450', async () => {
      await fx.payment(invoiceId, 250, 'SECOND-250');
      expect(await inv.count('payments', 'invoice_id = $1', [invoiceId])).toBe(2);
      expect(await inv.paymentsTotal(invoiceId)).toBe(550);
      expect(await inv.outstanding(invoiceId)).toBe(450);
    });

    it('the fixture does not pretend the application recalculated amount_paid', async () => {
      // Fixtures write the ledger only. amount_paid is the application's
      // derived figure; later tests exercising PaymentsService will assert it.
      const row = await inv.invoiceRow(invoiceId);
      expect(Number(row.amount_paid)).toBe(0);
      expect(row.payment_status).toBe('Unpaid');
    });
  });

  describe('database rules the later tests rely on (migration 1796 FinanceConstraints)', () => {
    it('payments and invoices carry the expected constraints', async () => {
      const payments = await inv.constraintNames('payments');
      expect(payments).toEqual(expect.arrayContaining(['payments_amount_positive', 'payments_invoice_fk']));
      // The reference rule is a unique INDEX on (invoice_id, lower(btrim(reference))), not a constraint.
      expect(await inv.indexNames('payments')).toEqual(expect.arrayContaining(['payments_invoice_reference_uq']));
      expect(await inv.constraintNames('invoices')).toEqual(expect.arrayContaining(['invoices_amounts_nonnegative']));
      expect(await inv.constraintNames('installments')).toEqual(
        expect.arrayContaining(['installments_invoice_fk', 'installments_amounts_nonnegative']),
      );
    });

    it('rejects a zero or negative payment amount (duplicate/correction misuse cannot post a reversal as a negative row)', async () => {
      const code = await inv.rejectionCode(
        `insert into payments (invoice_id, amount, payment_date, reference) values ($1, -50, now(), 'NEG')`,
        [invoiceId],
      );
      expect(code).toBe('23514'); // check_violation
      expect(await inv.paymentsTotal(invoiceId)).toBe(550);
    });

    it('rejects a duplicate payment reference on the same invoice', async () => {
      const code = await inv.rejectionCode(
        `insert into payments (invoice_id, amount, payment_date, reference) values ($1, 10, now(), 'FIRST-300')`,
        [invoiceId],
      );
      expect(code).toBe('23505'); // unique_violation
      expect(await inv.count('payments', 'invoice_id = $1', [invoiceId])).toBe(2);
    });

    it('refuses to delete an invoice that holds payments (receipts cannot be cascaded away)', async () => {
      const code = await inv.rejectionCode('delete from invoices where id = $1', [invoiceId]);
      expect(code).toBe('23503'); // foreign_key_violation
      expect(await inv.count('invoices', 'id = $1', [invoiceId])).toBe(1);
      expect(await inv.count('payments', 'invoice_id = $1', [invoiceId])).toBe(2);
    });
  });

  describe('instalment schedule fixture', () => {
    it('builds a 400 + 600 schedule whose instalments sum to the invoice total', async () => {
      const scheduled = (await fx.invoice({ ownerId, schoolId, total: 1000 })).id;
      const { appliedTermId, installmentIds } = await fx.appliedTermWithInstallments({
        invoiceId: scheduled,
        total: 1000,
        amounts: [400, 600],
      });
      expect(installmentIds).toHaveLength(2);
      expect(await inv.installmentsTotal(appliedTermId)).toBe(1000);
      const rows = await ds.query(
        'select installment_number, amount::numeric, balance::numeric, paid_amount::numeric from installments where applied_payment_term_id = $1 order by installment_number',
        [appliedTermId],
      );
      expect(rows.map((r: any) => [r.installment_number, Number(r.amount), Number(r.balance), Number(r.paid_amount)])).toEqual([
        [1, 400, 400, 0],
        [2, 600, 600, 0],
      ]);
    });

    it('one document can carry only one applied payment term (uq_applied_payment_terms_document)', async () => {
      const doc = (await fx.invoice({ ownerId, schoolId, total: 500 })).id;
      await fx.appliedTermWithInstallments({ invoiceId: doc, total: 500, amounts: [500] });
      const code = await inv.rejectionCode(
        `insert into applied_payment_terms (document_id, document_type, term_name, term_type, interest_rate,
            interest_calculation_method, invoice_strategy, subtotal, interest_amount, total_amount,
            number_of_installments, grace_period_days, start_date)
         select document_id, document_type, 'dup', term_type, interest_rate, interest_calculation_method,
            invoice_strategy, subtotal, interest_amount, total_amount, number_of_installments, grace_period_days, start_date
           from applied_payment_terms where document_id = $1`,
        [doc],
      );
      expect(code).toBe('23505');
    });
  });

  describe('designed, not executed in this campaign (need the real HTTP payment path and approval)', () => {
    test.todo('partial payment through POST /payments updates amount_paid and payment_status consistently with the ledger');
    test.todo('payment correction (update amount) is atomic: a failure after the payment write leaves no partial invoice/instalment update');
    test.todo('two concurrent payments on the same invoice serialise and never overpay the total');
    test.todo('duplicate submission with the same idempotency key posts exactly one payment (payment_commands)');
    test.todo('cancelling an invoice with receipts is refused or preserves receipts per the approved policy');
    test.todo('injected failure inside the payment transaction rolls back every table it touched');
    test.todo('instalment allocation of a 300 payment against a 400/600 schedule leaves balances 100/600');
  });
});
