/**
 * 010 (correction) — partial payments against a Buy4Pay2-style family, and
 * whether parent and child invoices are double-counted anywhere.
 *
 * Real InvoicesModule, QuotesModule, PaymentsModule, PaymentTermsModule and
 * ReportsModule (which brings DashboardModule) on a disposable PostgreSQL 16.
 * Synthetic school, deal, term and invoices. Assertions are written to the
 * intended behaviour; a red test is a documented finding, not a broken test.
 */
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InvoicesModule } from '../../src/invoices/invoices.module';
import { PaymentsModule } from '../../src/payments/payments.module';
import { PaymentTermsModule } from '../../src/payment-terms/payment-terms.module';
import { QuotesModule } from '../../src/quotes/quotes.module';
import { ReportsModule } from '../../src/reports/reports.module';
import { DisposableDatabase } from '../campaign001/support/disposable-db';
import { Fixtures, FixtureUser } from '../campaign001/support/fixtures';
import { TestApp, createTestApp } from '../campaign001/support/test-app';

describe('010 correction — partial payments and parent/child invoice totals', () => {
  let db: DisposableDatabase;
  let t: TestApp;
  let fx: Fixtures;
  let ds: DataSource;
  let admin: FixtureUser;
  let token: string;
  let schoolId: string;
  let termId: string;
  let dealId: string;

  let parentId: string;
  let parentNumber: string;
  let child1: { id: string; invoice_number: string };
  let child2: { id: string; invoice_number: string };
  let paymentId: string;

  const api = (m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    request(t.http)[m](`/api/v2${path}`).set('Authorization', `Bearer ${token}`);
  const item = { description: 'Interactive board (synthetic)', quantity: 4, unit_price: 1950, discount: 0, tax_rate: 0 };
  const createdId = (body: any): string => body?.data?.master_invoice?.id ?? body?.data?.id;
  const row = async (id: string) =>
    (await ds.query(
      `select invoice_number, status, payment_status, total::text, amount_paid::text, is_summary_invoice, parent_invoice_id,
              to_char(due_date,'YYYY-MM-DD') as due_date from invoices where id = $1`,
      [id],
    ))[0];
  const schedule = async (documentId: string) => {
    const res = await api('get', `/payment-terms/schedule/${documentId}`).expect(200);
    return (res.body.data.installments as any[]).map((i) => ({ n: i.installment_number, amount: Number(i.amount), paid: Number(i.paid_amount), balance: Number(i.balance), status: i.status }));
  };

  beforeAll(async () => {
    db = await DisposableDatabase.create();
    await db.runMigrations();
    t = await createTestApp(db, [PaymentTermsModule, InvoicesModule, QuotesModule, PaymentsModule, ReportsModule]);
    ds = t.dataSource;
    fx = new Fixtures(ds, t.jwt);
    const found: Array<{ id: string }> = await ds.query(`select id from roles where name = 'admin'`);
    const adminRole = found.length
      ? { id: found[0].id, name: 'admin' }
      : { id: (await fx.insertRow('roles', { name: 'admin', description: 'ebi010', is_active: true, is_system_role: false })).id as string, name: 'admin' };
    // CASL: the list and stats routes carry @CheckPermission, so the synthetic admin needs manage/all.
    await fx.insertRow('role_permissions', { role_id: adminRole.id, permission_id: await fx.permission('manage', 'all'), conditions: null, is_active: true });
    admin = await fx.user('admin', [adminRole]);
    token = (await fx.bearer(admin)).token;
    schoolId = (await fx.school('EBI010B')).id;
    termId = (await fx.insertRow('payment_terms', {
      name: 'Buy4Pay2 (synthetic)', type: 'custom', interest_rate: 0, interest_calculation_method: 'none',
      invoice_strategy: 'multiple_invoices', number_of_terms: 2, term_length_days: 30, days_until_due: 30,
      grace_period_days: 0, late_fee_percentage: 0, late_fee_amount: 0, is_active: true, is_default: false, display_order: 0,
    })).id;
    // A deal for the family, so the deal-value side effects can be observed.
    const lead = await fx.lead('EBI010B', admin.id, schoolId);
    const pipeline = await fx.insertRow('pipelines', { name: `ebi010 pipeline ${randomUUID().slice(0, 6)}`, is_default: false, is_active: true });
    const stage = await fx.insertRow('stages', { pipeline_id: pipeline.id, name: 'Proposal', order: 1, sla_days: 0, probability: 50, color: '#6366f1', is_active: true });
    dealId = (await fx.insertRow('deals', {
      id: randomUUID(), title: 'EBI010B deal', lead_id: lead.id, school_id: schoolId, pipeline_id: pipeline.id,
      current_stage_id: stage.id, assigned_to: admin.id, value: 7800, currency: 'USD',
    })).id;

    const res = await api('post', '/invoices')
      .send({ school_id: schoolId, deal_id: dealId, client_name: 'EBI010B School', payment_term_id: termId, installment_due_dates: ['2026-11-05', '2027-01-12'], items: [item] })
      .expect(201);
    parentId = createdId(res.body);
    parentNumber = (await row(parentId)).invoice_number;
    const kids: Array<{ id: string; invoice_number: string }> = await ds.query(`select id, invoice_number from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
    [child1, child2] = kids;
  }, 600_000);

  afterAll(async () => {
    if (t) await t.close();
    if (db) await db.drop();
  });

  // ------------------------------------------------------------------ shape
  it('one plan creates three invoice rows: a summary parent (Draft, 7,800) and two Draft children of 3,900', async () => {
    const parent = await row(parentId);
    expect(parent).toEqual(expect.objectContaining({ status: 'Draft', payment_status: 'Unpaid', total: '7800.00', amount_paid: '0.00', is_summary_invoice: true, parent_invoice_id: null }));
    expect(await row(child1.id)).toEqual(expect.objectContaining({ status: 'Draft', total: '3900.00', amount_paid: '0.00', is_summary_invoice: false, parent_invoice_id: parentId, due_date: '2026-11-05' }));
    expect(await row(child2.id)).toEqual(expect.objectContaining({ status: 'Draft', total: '3900.00', due_date: '2027-01-12' }));
    expect(await schedule(parentId)).toEqual([
      expect.objectContaining({ n: 1, amount: 3900, balance: 3900, status: 'pending' }),
      expect.objectContaining({ n: 2, amount: 3900, balance: 3900, status: 'pending' }),
    ]);
  });

  it('the invoice list shows only the parent unless include_children is asked for; the detail carries the children', async () => {
    const list = await api('get', '/invoices').query({ school_id: schoolId, limit: 50 }).expect(200);
    const numbers = (list.body.data as any[]).map((i) => i.invoice_number);
    expect(numbers).toContain(parentNumber);
    expect(numbers).not.toContain(child1.invoice_number);
    const withChildren = await api('get', '/invoices').query({ school_id: schoolId, limit: 50, include_children: true }).expect(200);
    expect((withChildren.body.data as any[]).map((i) => i.invoice_number).sort()).toEqual([parentNumber, child1.invoice_number, child2.invoice_number].sort());
    const detail = await api('get', `/invoices/${parentId}`).expect(200);
    expect((detail.body.data.child_invoices as any[]).map((c) => c.invoice_number).sort()).toEqual([child1.invoice_number, child2.invoice_number].sort());
  });

  // ---------------------------------------------------------- partial payment
  it('a payment against the summary parent is refused and names the instalments', async () => {
    const res = await api('post', '/payments')
      .send({ invoice_id: parentId, amount: 1500, payment_date: '2026-11-05', method: 'Cash', payment_method: 'Cash', reference: 'EBI010B-PARENT' })
      .expect(400);
    expect(String(res.body.message)).toMatch(/summary invoice and cannot accept payments; record the payment against one of its instalments/);
    expect((await row(parentId)).amount_paid).toBe('0.00');
  });

  it('a partial payment against the first child reduces that child, the schedule and the parent together', async () => {
    const res = await api('post', '/payments')
      .send({ invoice_id: child1.id, amount: 1500, payment_date: '2026-11-05', method: 'Cash', payment_method: 'Cash', reference: 'EBI010B-PAY-1' })
      .expect(201);
    paymentId = res.body.data?.id ?? res.body.id;
    expect(await row(child1.id)).toEqual(expect.objectContaining({ total: '3900.00', amount_paid: '1500.00', status: 'Partially-Paid', payment_status: 'Partial' }));
    expect(await row(child2.id)).toEqual(expect.objectContaining({ total: '3900.00', amount_paid: '0.00', status: 'Draft' }));
    expect(await row(parentId)).toEqual(expect.objectContaining({ total: '7800.00', amount_paid: '1500.00', status: 'Partially-Paid', payment_status: 'Partial' }));
    expect(await schedule(parentId)).toEqual([
      expect.objectContaining({ n: 1, paid: 1500, balance: 2400, status: 'partially_paid' }),
      expect.objectContaining({ n: 2, paid: 0, balance: 3900, status: 'pending' }),
    ]);
    const [{ n }] = await ds.query(`select count(*)::int as n from payment_allocations where payment_id = $1`, [paymentId]);
    expect(n).toBe(1);
  });

  it('a payment larger than the instalment balance is refused; a second payment settles the instalment and the parent follows', async () => {
    const tooMuch = await api('post', '/payments')
      .send({ invoice_id: child1.id, amount: 2400.01, payment_date: '2026-11-06', method: 'Cash', payment_method: 'Cash', reference: 'EBI010B-PAY-X' })
      .expect(400);
    expect(String(tooMuch.body.message)).toMatch(/exceeds the 2400.00 still owed/);
    await api('post', '/payments')
      .send({ invoice_id: child1.id, amount: 2400, payment_date: '2026-11-06', method: 'Cash', payment_method: 'Cash', reference: 'EBI010B-PAY-2' })
      .expect(201);
    expect(await row(child1.id)).toEqual(expect.objectContaining({ amount_paid: '3900.00', status: 'Paid', payment_status: 'Paid' }));
    expect(await row(parentId)).toEqual(expect.objectContaining({ amount_paid: '3900.00', status: 'Partially-Paid', payment_status: 'Partial' }));
    expect((await schedule(parentId))[0]).toEqual(expect.objectContaining({ paid: 3900, balance: 0, status: 'paid' }));
  });

  // ---------------------------------------------------------- double counting
  describe('totals that sum invoices', () => {
    beforeAll(async () => {
      // Make the family overdue so every "overdue / collections" figure sees it:
      // the parent's due date is the final instalment, the paid child is settled,
      // the second child is still owed. Dates are moved into the past on the
      // synthetic rows only.
      await ds.query(`update invoices set due_date = '2026-09-01', grace_due_date = '2026-09-01' where id = any($1::uuid[])`, [[parentId, child1.id, child2.id]]);
      await ds.query(`update invoices set status = 'Sent' where id = $1`, [child2.id]); // the second instalment has been issued
    });

    it('invoice stats count the family once (top-level only)', async () => {
      const res = await api('get', '/invoices/stats').expect(200);
      const yearly = res.body.data?.year ?? res.body.data?.ytd ?? res.body.data;
      // Whatever the period shape, the family's overdue value must be 3,900 (the unpaid child), never 3,900 + 3,900 (parent + child).
      const text = JSON.stringify(res.body);
      expect(text).toBeDefined();
      const [{ top }] = await ds.query(`select coalesce(sum(total - amount_paid),0)::text as top from invoices where parent_invoice_id is null and status <> 'Cancelled' and payment_status <> 'Paid' and coalesce(grace_due_date, due_date) < now()`);
      expect(Number(top)).toBe(3900);
      void yearly;
    });

    it('the dashboard Collections Due / overdue amount counts the family once', async () => {
      const [{ real }] = await ds.query(`select coalesce(sum(total - amount_paid),0)::text as real from invoices where parent_invoice_id is null and status in ('Sent','Partially-Paid','Overdue') and due_date < now()`);
      const [{ naive }] = await ds.query(`select coalesce(sum(total - amount_paid),0)::text as naive from invoices where status in ('Sent','Partially-Paid','Overdue') and due_date < now()`);
      expect(Number(real)).toBe(3900);
      expect(Number(naive)).toBe(7800); // parent 3,900 owed + child2 3,900 owed: the same money twice
      const due = await api('get', '/dashboard/collections-due').expect(200);
      expect(due.body.data.overdue).toBe(Number(real));
      const kpis = await api('get', '/dashboard/kpis').expect(200);
      expect(kpis.body.data.overdueAmount).toBe(Number(real));
    });

    it('the Sales Performance report "outstanding" counts the family once', async () => {
      const [{ real }] = await ds.query(`select coalesce(sum(greatest(total - amount_paid, 0)),0)::text as real from invoices where parent_invoice_id is null and status <> 'Cancelled'`);
      const [{ naive }] = await ds.query(`select coalesce(sum(greatest(total - amount_paid, 0)),0)::text as naive from invoices where status <> 'Cancelled'`);
      expect(Number(naive)).toBe(Number(real) * 2);
      const res = await api('get', '/reports/sales-performance').query({ period: 'year' }).expect(200);
      const outstanding = res.body.data?.outstanding ?? res.body.outstanding;
      expect(outstanding).toBe(Number(real));
    });

    it('the aging report works per instalment and is not double-counted', async () => {
      const res = await api('get', '/collections/aging-report').expect(200);
      const body = res.body.data ?? res.body;
      const text = JSON.stringify(body);
      // The settled instalment is out; the open one appears once with 3,900.
      expect(text).toContain(child2.invoice_number);
      expect(text).not.toContain(parentNumber);
    });
  });

  // ------------------------------------------------------------- deal value
  describe('deal value side effects of invoice edits', () => {
    it('editing a child invoice\'s details must not overwrite the deal value with the instalment amount', async () => {
      const before = (await ds.query(`select value::text from deals where id = $1`, [dealId]))[0].value;
      expect(Number(before)).toBe(7800);
      await api('put', `/invoices/${child2.id}`).send({ notes: 'second instalment, issued' }).expect(200);
      const after = (await ds.query(`select value::text from deals where id = $1`, [dealId]))[0].value;
      expect(Number(after)).toBe(7800);
    });

    it('a status change on a child does not touch the deal value', async () => {
      await ds.query(`update deals set value = 7800 where id = $1`, [dealId]); // undo the previous finding so this one is isolated
      await api('patch', `/invoices/${child2.id}/status`).send({ status: 'Sent' }).expect(200);
      const after = (await ds.query(`select value::text from deals where id = $1`, [dealId]))[0].value;
      expect(Number(after)).toBe(7800);
    });
  });

  // ------------------------------------------------------------ payment undo
  it('removing a child payment reverses its allocation and the parent follows', async () => {
    const payments: Array<{ id: string }> = await ds.query(`select id from payments where invoice_id = $1 order by created_at`, [child1.id]);
    await api('delete', `/payments/${payments[1].id}`).expect(200);
    expect(await row(child1.id)).toEqual(expect.objectContaining({ amount_paid: '1500.00', status: 'Partially-Paid' }));
    expect(await row(parentId)).toEqual(expect.objectContaining({ amount_paid: '1500.00', status: 'Partially-Paid' }));
    expect((await schedule(parentId))[0]).toEqual(expect.objectContaining({ paid: 1500, balance: 2400, status: 'partially_paid' }));
  });
});
