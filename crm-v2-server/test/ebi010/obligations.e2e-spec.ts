/**
 * 010B — every financial obligation counted exactly once.
 *
 * Families (summary parent + child instalments) in every state next to
 * standalone invoices, then the three figures that sum invoices are checked
 * against hand-computed totals: the dashboard KPI "overdue", Collections Due
 * buckets, and the Sales Performance "outstanding". Real modules, disposable
 * PostgreSQL 16, synthetic rows only.
 */
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InvoicesModule } from '../../src/invoices/invoices.module';
import { PaymentsModule } from '../../src/payments/payments.module';
import { PaymentTermsModule } from '../../src/payment-terms/payment-terms.module';
import { QuotesModule } from '../../src/quotes/quotes.module';
import { ReportsModule } from '../../src/reports/reports.module';
import { makeHistoricCancelledParent } from './support/historic-state';
import { agreedDates } from './support/agreed-dates';
import { DisposableDatabase } from '../campaign001/support/disposable-db';
import { Fixtures, FixtureUser } from '../campaign001/support/fixtures';
import { TestApp, createTestApp } from '../campaign001/support/test-app';

const DAY = 24 * 60 * 60 * 1000;

describe('010B — one obligation once across dashboard, collections and reports', () => {
  let db: DisposableDatabase;
  let t: TestApp;
  let fx: Fixtures;
  let ds: DataSource;
  let admin: FixtureUser;
  let token: string;
  let schoolId: string;
  let termId: string;

  const api = (m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    request(t.http)[m](`/api/v2${path}`).set('Authorization', `Bearer ${token}`);
  const createdId = (body: any): string => body?.data?.master_invoice?.id ?? body?.data?.id;
  const line = (total: number) => ({ description: 'synthetic', quantity: 1, unit_price: total, discount: 0, tax_rate: 0 });
  const setDue = (id: string, when: Date) =>
    ds.query(`update invoices set due_date = $2, grace_due_date = $2 where id = $1`, [id, when]);
  const pay = (invoiceId: string, amount: number, ref: string) =>
    api('post', '/payments').send({ invoice_id: invoiceId, amount, payment_date: '2026-10-28', method: 'Cash', payment_method: 'Cash', reference: ref }).expect(201);
  const status = (id: string, s: string) => api('patch', `/invoices/${id}/status`).send({ status: s }).expect(200);

  // Dates: "yesterday" and "+N days" relative to now; "today" at 12:00 UTC so
  // the Collections Due date-string comparison and the KPI instant
  // comparison agree on which calendar day it is.
  const now = new Date();
  const yesterday = new Date(now.getTime() - DAY);
  const plus = (n: number) => new Date(now.getTime() + n * DAY);
  const todayNoon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));

  /** A 7,800 family split 50/50 with the given child due dates (set after creation). */
  const family = async (label: string, dueChild1: Date, dueChild2: Date, deal?: string) => {
    const res = await api('post', '/invoices')
      .send({ school_id: schoolId, deal_id: deal, client_name: `${label} school`, payment_term_id: termId, installment_due_dates: agreedDates(2), items: [line(7800)] })
      .expect(201);
    const parentId = createdId(res.body);
    const kids: Array<{ id: string }> = await ds.query(`select id from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
    await setDue(kids[0].id, dueChild1);
    await setDue(kids[1].id, dueChild2);
    await setDue(parentId, dueChild2);
    return { parentId, child1: kids[0].id, child2: kids[1].id };
  };
  const standalone = async (label: string, total: number, due: Date, deal?: string) => {
    const res = await api('post', '/invoices').send({ school_id: schoolId, deal_id: deal, client_name: `${label} school`, items: [line(total)] }).expect(201);
    const id = createdId(res.body);
    await setDue(id, due);
    return id;
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
    await fx.insertRow('role_permissions', { role_id: adminRole.id, permission_id: await fx.permission('manage', 'all'), conditions: null, is_active: true });
    admin = await fx.user('admin', [adminRole]);
    token = (await fx.bearer(admin)).token;
    schoolId = (await fx.school('EBI010C')).id;
    termId = (await fx.insertRow('payment_terms', {
      name: 'Two instalments (synthetic)', type: 'custom', interest_rate: 0, interest_calculation_method: 'none',
      invoice_strategy: 'multiple_invoices', number_of_terms: 2, term_length_days: 30, days_until_due: 30,
      grace_period_days: 0, late_fee_percentage: 0, late_fee_amount: 0, is_active: true, is_default: false, display_order: 0,
    })).id;

    // F1 unpaid family, both instalments past due, nothing issued.
    await family('F1', yesterday, yesterday);
    // F2 partially paid: 1,500 on instalment 1 (past due); instalment 2 due in 5 days.
    const f2 = await family('F2', yesterday, plus(5));
    await pay(f2.child1, 1500, 'F2-1');
    // F3 fully paid.
    const f3 = await family('F3', yesterday, yesterday);
    await pay(f3.child1, 3900, 'F3-1');
    await pay(f3.child2, 3900, 'F3-2');
    // F4 cancelled family (unpaid): the parent is cancelled; children stay Draft.
    const f4 = await family('F4', yesterday, yesterday);
    await makeHistoricCancelledParent(ds, f4.parentId);
    // F5 Draft parent, first instalment issued and overdue (the Technical Lead's case).
    const f5 = await family('F5', yesterday, plus(40));
    await status(f5.child1, 'Sent');
    // F7 partially paid with BOTH instalments past due: the parent is Partially-Paid and overdue too,
    // which is exactly the row the old queries added on top of the children.
    const f7 = await family('F7', yesterday, yesterday);
    await pay(f7.child1, 1500, 'F7-1');
    // Standalone invoices.
    await status(await standalone('S1', 1000, yesterday), 'Sent');
    await standalone('S2', 500, yesterday); // Draft, past due
    await status(await standalone('S3', 300, yesterday), 'Cancelled');
    await status(await standalone('S4', 700, todayNoon), 'Sent');
    await status(await standalone('S5', 800, plus(20)), 'Sent');
  }, 600_000);

  afterAll(async () => {
    if (t) await t.close();
    if (db) await db.drop();
  });

  // Hand-computed expectations (each obligation once):
  //   overdue      = F2 child1 2,400 + F5 child1 3,900 + F7 2,400 + 3,900 + S1 1,000 = 13,600
  //   due today    = S4 700
  //   due in 7 d   = F2 child2 3,900
  //   due in 30 d  = S5 800
  //   outstanding  = F2 6,300 + F5 child1 3,900 + F7 6,300 + S1 1,000 + S4 700 + S5 800 = 19,000
  //   not issued   = F1 7,800 + F5 child2 3,900 + S2 500 = 12,200
  //   Before RELEASE-EBI-AUDIT-003 outstanding was the two together, 31,200.
  it('the KPI overdue amount is 13,600: the overdue instalments and the overdue standalone invoice, parents never added', async () => {
    const res = await api('get', '/dashboard/kpis').expect(200);
    expect(res.body.data.overdueAmount).toBe(13600);
  });

  it('Collections Due buckets each instalment by its own date: overdue 13,600, today 700, 7 days 3,900, 30 days 800', async () => {
    const res = await api('get', '/dashboard/collections-due').expect(200);
    const d = res.body.data;
    expect(d.overdue).toBe(13600);
    expect(d.dueToday).toBe(700);
    expect(d.dueIn7Days).toBe(3900);
    expect(d.dueIn30Days).toBe(800);
    const listed = (d.overdueList as any[]).map((i) => i.outstanding).sort((a, b) => a - b);
    expect(listed).toEqual([1000, 2400, 2400, 3900, 3900]);
  });

  it('Sales Performance "outstanding" is 19,000: every issued obligation once, with the 12,200 on Drafts shown apart', async () => {
    const res = await api('get', '/reports/sales-performance').query({ period: 'year' }).expect(200);
    const { outstanding, draftNotIssued } = res.body.data ?? res.body;
    expect(outstanding).toBe(19000);
    expect(draftNotIssued).toBe(12200);
    expect(outstanding + draftNotIssued).toBe(31200);
  });

  it('nothing is counted twice: no summary parent appears in any figure', async () => {
    const [{ parents }] = await ds.query(`select count(*)::int as parents from invoices where is_summary_invoice`);
    expect(parents).toBe(6);
    const [{ summaryOverdue }] = await ds.query(
      `select coalesce(sum(total - amount_paid), 0)::text as "summaryOverdue" from invoices where is_summary_invoice and status in ('Sent','Partially-Paid','Overdue') and due_date < now()`,
    );
    // F7's parent (Partially-Paid, past due) is what the old query added on top of its children.
    expect(Number(summaryOverdue)).toBe(6300);
    const [{ oldRule }] = await ds.query(
      `select coalesce(sum(total - amount_paid), 0)::text as "oldRule" from invoices where status in ('Sent','Partially-Paid','Overdue') and due_date < $1`,
      [todayNoon],
    );
    // The pre-010B figure: F2 child1 2,400 + F5 child1 3,900 + F7 child1 2,400 + S1 1,000 + F7 PARENT 6,300 = 16,000.
    // It added F7's parent on top of its children AND hid F7's unissued second instalment (3,900) that the parent was
    // standing in for; the family was neither counted once nor correctly. The new figure is 13,600.
    expect(Number(oldRule)).toBe(16000);
  });

  it('a family that has started paying keeps its derived parent status; the figures come from the children', async () => {
    const rows: Array<{ client_name: string; status: string; total: string; amount_paid: string }> = await ds.query(
      `select client_name, status, total::text, amount_paid::text from invoices where is_summary_invoice order by client_name`,
    );
    expect(rows.map((r) => [r.client_name, r.status, Number(r.total) - Number(r.amount_paid)])).toEqual([
      ['F1 school', 'Draft', 7800],
      ['F2 school', 'Partially-Paid', 6300],
      ['F3 school', 'Paid', 0],
      ['F4 school', 'Cancelled', 7800],
      ['F5 school', 'Draft', 7800],
      ['F7 school', 'Partially-Paid', 6300],
    ]);
  });

  it('invoice stats (top-level, unchanged) still reconcile with the invoice list', async () => {
    const res = await api('get', '/invoices/stats').expect(200);
    expect(res.status).toBe(200);
    const list = await api('get', '/invoices').query({ limit: 100 }).expect(200);
    const numbers = (list.body.data as any[]).map((i) => i.invoice_number);
    const children: Array<{ invoice_number: string }> = await ds.query(`select invoice_number from invoices where parent_invoice_id is not null`);
    for (const c of children) expect(numbers).not.toContain(c.invoice_number);
  });

  describe('deal value stays the whole sale', () => {
    let dealId: string;
    beforeAll(async () => {
      const lead = await fx.lead('EBI010C', admin.id, schoolId);
      const pipeline = await fx.insertRow('pipelines', { name: `ebi010c ${randomUUID().slice(0, 6)}`, is_default: false, is_active: true });
      const stage = await fx.insertRow('stages', { pipeline_id: pipeline.id, name: 'Proposal', order: 1, sla_days: 0, probability: 50, color: '#6366f1', is_active: true });
      dealId = (await fx.insertRow('deals', { id: randomUUID(), title: 'EBI010C deal', lead_id: lead.id, school_id: schoolId, pipeline_id: pipeline.id, current_stage_id: stage.id, assigned_to: admin.id, value: 1, currency: 'USD' })).id;
    });
    const dealValue = async () => Number((await ds.query(`select value::text from deals where id = $1`, [dealId]))[0].value);

    it('creating the family sets the deal to the whole sale; editing or re-statusing a child leaves it', async () => {
      const f = await family('F6', plus(10), plus(40), dealId);
      expect(await dealValue()).toBe(7800);
      await api('put', `/invoices/${f.child1}`).send({ notes: 'instalment note' }).expect(200);
      expect(await dealValue()).toBe(7800);
      await status(f.child1, 'Sent');
      expect(await dealValue()).toBe(7800);
      await api('put', `/invoices/${f.parentId}`).send({ notes: 'parent note' }).expect(200);
      expect(await dealValue()).toBe(7800);
    });

    it('a standalone invoice on the deal still sets the deal value (unchanged behaviour), and so does conversion from a quote', async () => {
      await standalone('S6', 2500, plus(10), dealId);
      expect(await dealValue()).toBe(2500);
      const q = await api('post', '/quotes').send({ school_id: schoolId, deal_id: dealId, client_name: 'Q school', items: [line(4200)] }).expect(201);
      await api('post', `/invoices/convert-from-quote/${q.body.data.id}`).send({}).expect(201);
      expect(await dealValue()).toBe(4200);
    });
  });

  it('payments and allocations are untouched by this change: the F2 receipt is still allocated to instalment 1 only', async () => {
    const rows: Array<{ n: string; amount: string }> = await ds.query(
      `select count(*)::text as n, coalesce(sum(a.allocated_amount),0)::text as amount from payment_allocations a join payments p on p.id = a.payment_id where p.reference = 'F2-1'`,
    );
    expect(rows[0]).toEqual({ n: '1', amount: '1500.00' });
  });
});
