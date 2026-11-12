/**
 * 010 — urgent billing repair: agreed instalment dates and invoice editing.
 *
 * Real InvoicesModule, QuotesModule, PaymentsModule and PaymentTermsModule
 * behind the real guard chain on a disposable PostgreSQL 16 database.
 * Synthetic school, synthetic term (the production Buy4Pay2 definition's
 * shape: two instalments, 30-day spacing, one invoice per instalment), no
 * real records.
 */
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InvoicesModule } from '../../src/invoices/invoices.module';
import { PaymentsModule } from '../../src/payments/payments.module';
import { PaymentTermsModule } from '../../src/payment-terms/payment-terms.module';
import { QuotesModule } from '../../src/quotes/quotes.module';
import { agreedDates } from './support/agreed-dates';
import { DisposableDatabase } from '../campaign001/support/disposable-db';
import { Fixtures, FixtureUser } from '../campaign001/support/fixtures';
import { TestApp, createTestApp } from '../campaign001/support/test-app';

describe('010 — Buy4Pay2-style terms and invoice editing (real modules, PostgreSQL 16)', () => {
  let db: DisposableDatabase;
  let t: TestApp;
  let fx: Fixtures;
  let ds: DataSource;
  let admin: FixtureUser;
  let token: string;
  let schoolId: string;
  let termId: string;

  const api = (m: 'get' | 'post' | 'put' | 'patch', path: string) =>
    request(t.http)[m](`/api/v2${path}`).set('Authorization', `Bearer ${token}`);
  // POST /invoices answers { master_invoice, child_invoices } (also for a plain invoice); the quote route answers the quote.
  const createdId = (body: any): string => body?.data?.master_invoice?.id ?? body?.data?.id;
  const item = { description: 'Interactive board (synthetic)', quantity: 4, unit_price: 1950, discount: 0, tax_rate: 0 };
  const children = async (parentId: string): Promise<Array<{ invoice_number: string; due_date: string; total: string; amount_paid: string; status: string }>> =>
    ds.query(
      `select invoice_number, to_char(due_date, 'YYYY-MM-DD') as due_date, total::text, amount_paid::text, status
         from invoices where parent_invoice_id = $1 order by due_date`,
      [parentId],
    );
  const schedule = async (documentId: string) => {
    const res = await api('get', `/payment-terms/schedule/${documentId}`).expect(200);
    const applied = res.body.data ?? res.body;
    return (applied.installments as any[]).map((i) => ({
      n: i.installment_number,
      amount: Number(i.amount),
      balance: Number(i.balance),
      paid: Number(i.paid_amount),
      due: String(i.due_date).slice(0, 10),
      status: i.status,
    }));
  };

  beforeAll(async () => {
    db = await DisposableDatabase.create();
    await db.runMigrations();
    t = await createTestApp(db, [PaymentTermsModule, InvoicesModule, QuotesModule, PaymentsModule]);
    ds = t.dataSource;
    fx = new Fixtures(ds, t.jwt);
    const found: Array<{ id: string }> = await ds.query(`select id from roles where name = 'admin'`);
    const adminRole = found.length
      ? { id: found[0].id, name: 'admin' }
      : { id: (await fx.insertRow('roles', { name: 'admin', description: 'ebi010', is_active: true, is_system_role: false })).id as string, name: 'admin' };
    admin = await fx.user('admin', [adminRole]);
    token = (await fx.bearer(admin)).token;
    schoolId = (await fx.school('EBI010')).id;
    const term = await fx.insertRow('payment_terms', {
      name: 'Buy4Pay2 (synthetic)',
      type: 'custom',
      interest_rate: 0,
      interest_calculation_method: 'none',
      invoice_strategy: 'multiple_invoices',
      number_of_terms: 2,
      term_length_days: 30,
      days_until_due: 30,
      grace_period_days: 0,
      late_fee_percentage: 0,
      late_fee_amount: 0,
      is_active: true,
      is_default: false,
      display_order: 0,
    });
    termId = term.id;
  }, 600_000);

  afterAll(async () => {
    if (t) await t.close();
    if (db) await db.drop();
  });

  describe('issue 1 — agreed instalment dates on a two-instalment plan', () => {
    it('without agreed dates the schedule is 30 and 60 days out (unchanged behaviour)', async () => {
      const res = await api('post', '/invoices')
        .send({ school_id: schoolId, client_name: 'Synthetic School', payment_term_id: termId, installment_due_dates: agreedDates(2), items: [item] })
        .expect(201);
      const id = createdId(res.body);
      const s = await schedule(id);
      expect(s.map((x) => x.amount)).toEqual([3900, 3900]);
      const day = (d: Date) => d.toISOString().slice(0, 10);
      const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return day(d); };
      expect(s.map((x) => x.due)).toEqual([plus(30), plus(60)]);
      const kids = await children(id);
      expect(kids.map((k) => k.due_date)).toEqual([plus(30), plus(60)]);
    });

    it('with agreed dates the children and the schedule carry them; the amounts and the total are the plan\'s', async () => {
      const res = await api('post', '/invoices')
        .send({
          school_id: schoolId,
          client_name: 'Synthetic School',
          payment_term_id: termId, installment_due_dates: agreedDates(2),
          installment_due_dates: ['2026-11-05', '2027-01-12'],
          items: [item],
        })
        .expect(201);
      const id = createdId(res.body);
      const s = await schedule(id);
      expect(s).toEqual([
        expect.objectContaining({ n: 1, amount: 3900, balance: 3900, due: '2026-11-05', status: 'pending' }),
        expect.objectContaining({ n: 2, amount: 3900, balance: 3900, due: '2027-01-12', status: 'pending' }),
      ]);
      const kids = await children(id);
      expect(kids.map((k) => [k.due_date, Number(k.total)])).toEqual([['2026-11-05', 3900], ['2027-01-12', 3900]]);
      const [{ total, due }] = await ds.query(`select total::text, to_char(due_date,'YYYY-MM-DD') as due from invoices where id = $1`, [id]);
      expect(Number(total)).toBe(7800);
      expect(due).toBe('2027-01-12');
    });

    it('refuses the wrong number of dates and dates out of order with a sentence a person can act on', async () => {
      const three = await api('post', '/invoices')
        .send({ school_id: schoolId, client_name: 'S', payment_term_id: termId, installment_due_dates: ['2026-11-05', '2026-12-05', '2027-01-05'], items: [item] })
        .expect(400);
      expect(String(three.body.message)).toMatch(/2 instalment/);
      const reversed = await api('post', '/invoices')
        .send({ school_id: schoolId, client_name: 'S', payment_term_id: termId, installment_due_dates: ['2027-01-12', '2026-11-05'], items: [item] })
        .expect(400);
      expect(String(reversed.body.message)).toMatch(/in order/);
      await api('post', '/invoices')
        .send({ school_id: schoolId, client_name: 'S', payment_term_id: termId, installment_due_dates: ['soon', 'later'], items: [item] })
        .expect(400);
      // Nothing half-written: a refused apply leaves no invoice behind for this client name.
      const [{ n }] = await ds.query(`select count(*)::int as n from invoices where client_name = 'S'`);
      expect(n).toBe(0);
    });

    it('agreed dates on a quote survive conversion into the invoice', async () => {
      const q = await api('post', '/quotes')
        .send({
          school_id: schoolId,
          client_name: 'Synthetic Quote School',
          payment_term_id: termId, installment_due_dates: agreedDates(2),
          installment_due_dates: ['2026-11-05', '2027-01-12'],
          items: [item],
        })
        .expect(201);
      const quoteId = q.body.data.id;
      const inv = await api('post', `/invoices/convert-from-quote/${quoteId}`).send({}).expect(201);
      const invoiceId = createdId(inv.body);
      const kids = await children(invoiceId);
      expect(kids.map((k) => k.due_date)).toEqual(['2026-11-05', '2027-01-12']);
      expect(kids.map((k) => Number(k.total))).toEqual([3900, 3900]);
    });

    it('an invoice without a plan is untouched by the change', async () => {
      const res = await api('post', '/invoices')
        .send({ school_id: schoolId, client_name: 'Plain', due_date: '2026-12-01', items: [item] })
        .expect(201);
      const id = createdId(res.body);
      await api('get', `/payment-terms/schedule/${id}`).expect(404);
      expect(await children(id)).toEqual([]);
      const [{ total, due }] = await ds.query(`select total::text, to_char(due_date,'YYYY-MM-DD') as due from invoices where id = $1`, [id]);
      expect(Number(total)).toBe(7800);
      expect(due).toBe('2026-12-01');
    });
  });

  describe('issue 2 — invoice editing under the money rules', () => {
    let plainId: string;
    let plannedId: string;
    let childId: string;

    beforeAll(async () => {
      plainId = createdId((await api('post', '/invoices')
        .send({ school_id: schoolId, client_name: 'Edit Me', client_email: 'old@test.invalid', due_date: '2026-12-01', notes: 'before', items: [item] })
        .expect(201)).body);
      plannedId = createdId((await api('post', '/invoices')
        .send({ school_id: schoolId, client_name: 'Planned', payment_term_id: termId, installment_due_dates: ['2026-11-05', '2027-01-12'], items: [item] })
        .expect(201)).body);
      const [first] = await ds.query(`select id from invoices where parent_invoice_id = $1 order by due_date limit 1`, [plannedId]);
      childId = first.id;
    });

    it('a permitted (Draft, unpaid) invoice can have its details edited; the total is untouched', async () => {
      const res = await api('put', `/invoices/${plainId}`)
        .send({ client_name: 'Edited Name', client_email: 'new@test.invalid', client_address: '1 Synthetic Road', notes: 'after', due_date: '2026-12-15' })
        .expect(200);
      expect(res.body.data).toEqual(expect.objectContaining({ client_name: 'Edited Name', client_email: 'new@test.invalid', notes: 'after' }));
      const [row] = await ds.query(`select client_name, total::text, amount_paid::text, to_char(due_date,'YYYY-MM-DD') as due, status from invoices where id = $1`, [plainId]);
      expect(row).toEqual({ client_name: 'Edited Name', total: '7800.00', amount_paid: '0.00', due: '2026-12-15', status: 'Draft' });
    });

    it('a partial payment reduces the right outstanding balance on the instalment it lands on', async () => {
      await api('post', '/payments')
        .send({ invoice_id: childId, amount: 1500, payment_date: '2026-11-05', method: 'Cash', payment_method: 'Cash', reference: 'EBI010-PAY-1' })
        .expect(201);
      const [child] = await ds.query(`select total::text, amount_paid::text, status, payment_status from invoices where id = $1`, [childId]);
      expect(Number(child.total)).toBe(3900);
      expect(Number(child.amount_paid)).toBe(1500);
      const s = await schedule(plannedId);
      expect(s.reduce((a, x) => a + x.amount, 0)).toBe(7800);
      expect(s.reduce((a, x) => a + x.balance, 0)).toBe(7800 - 1500);
    });

    it('editing the details of an invoice that holds money keeps every financial figure', async () => {
      const before = await ds.query(`select total::text, amount_paid::text, status, payment_status from invoices where id = $1`, [childId]);
      await api('put', `/invoices/${childId}`).send({ client_name: 'Paid Client Edited', notes: 'note on a paid instalment' }).expect(200);
      const after = await ds.query(`select total::text, amount_paid::text, status, payment_status, client_name from invoices where id = $1`, [childId]);
      expect(after[0]).toEqual({ ...before[0], client_name: 'Paid Client Edited' });
      const [{ n }] = await ds.query(`select count(*)::int as n from payments where invoice_id = $1`, [childId]);
      expect(n).toBe(1);
    });

    it('existing restrictions stay enforced: Paid without receipts, cancel with money, lines on a paid invoice', async () => {
      const paid = await api('put', `/invoices/${plainId}`).send({ status: 'Paid' }).expect(409);
      expect(String(paid.body.message)).toMatch(/Cannot mark .* as Paid/);
      const cancel = await api('patch', `/invoices/${childId}/status`).send({ status: 'Cancelled' }).expect(409);
      expect(cancel.body.code).toBe('INVOICE_HAS_RECORDED_PAYMENTS');
      const [line] = await ds.query(`select id from document_items where document_id = $1 limit 1`, [childId]);
      const lines = await api('put', `/invoices/${childId}/items/${line.id}`).send({ quantity: 2 }).expect(400);
      expect(String(lines.body.message)).toMatch(/payment\(s\) recorded/);
      // The planned parent cannot be rescheduled through the edit route.
      await api('put', `/invoices/${plannedId}`).send({ installment_due_dates: ['2027-02-01', '2027-03-01'] }).expect(400);
      const s = await schedule(plannedId);
      expect(s.map((x) => x.due)).toEqual(['2026-11-05', '2027-01-12']);
    });

    it('a cancelled invoice keeps its restriction: lines cannot change', async () => {
      const id = createdId((await api('post', '/invoices').send({ school_id: schoolId, client_name: 'To Cancel', items: [item] }).expect(201)).body);
      await api('patch', `/invoices/${id}/status`).send({ status: 'Cancelled' }).expect(200);
      const [line] = await ds.query(`select id from document_items where document_id = $1 limit 1`, [id]);
      await api('put', `/invoices/${id}/items/${line.id}`).send({ quantity: 2 }).expect(400);
    });
  });
});
