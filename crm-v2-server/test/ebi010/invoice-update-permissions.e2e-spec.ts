/**
 * EBI-FOCUS-001 Fix 2 — only a manager can change an existing invoice.
 *
 * The full matrix: every role against every route that changes an invoice, by
 * direct API, through the real exception filter. Each cell gets a fresh invoice, and
 * a refusal must leave that invoice, its items and its plan exactly as they were.
 * The last block pins what a rep keeps, so the rule cannot quietly widen.
 */
import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { DealsModule } from '../../src/deals/deals.module';
import { DiagnosticsExceptionFilter } from '../../src/diagnostics/diagnostics-exception.filter';
import { InvoicesModule } from '../../src/invoices/invoices.module';
import { PaymentsModule } from '../../src/payments/payments.module';
import { PaymentTermsModule } from '../../src/payment-terms/payment-terms.module';
import { QuotesModule } from '../../src/quotes/quotes.module';
import { agreedDates } from './support/agreed-dates';
import { DisposableDatabase } from '../campaign001/support/disposable-db';
import { Fixtures, FixtureUser } from '../campaign001/support/fixtures';
import { TestApp, createTestApp } from '../campaign001/support/test-app';

@Module({
  providers: [{
    provide: APP_FILTER,
    useValue: new DiagnosticsExceptionFilter({ recordEvent: () => 'ref', getFlag: async () => false } as any),
  }],
})
class RealErrorFilterModule {}

const FORBIDDEN = 'INVOICE_UPDATE_FORBIDDEN';

type Who = 'admin' | 'admin_support' | 'sales_manager' | 'manager' | 'finance' | 'owner_rep' | 'other_rep';
const ALLOWED: Who[] = ['admin', 'admin_support', 'sales_manager'];
const REFUSED: Who[] = ['manager', 'finance', 'owner_rep', 'other_rep'];

interface Target { invoiceId: string; itemId: string }
type Call = (t: Target, c: Context) => request.Test;
interface Context { as: (m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request.Test; termId: string }

const ROUTES: Array<{ name: string; start?: string; call: Call; ok: number }> = [
  { name: 'PUT /invoices/:id', ok: 200, call: ({ invoiceId }, c) => c.as('put', `/invoices/${invoiceId}`).send({ notes: 'changed' }) },
  { name: 'PATCH /invoices/:id/status (issue)', ok: 200, call: ({ invoiceId }, c) => c.as('patch', `/invoices/${invoiceId}/status`).send({ status: 'Sent' }) },
  { name: 'PATCH /invoices/:id/status (cancel)', ok: 200, call: ({ invoiceId }, c) => c.as('patch', `/invoices/${invoiceId}/status`).send({ status: 'Cancelled' }) },
  { name: 'PATCH /invoices/:id/status (reopen)', start: 'Cancelled', ok: 200, call: ({ invoiceId }, c) => c.as('patch', `/invoices/${invoiceId}/status`).send({ status: 'Draft' }) },
  { name: 'PUT /invoices/:id with status (cancel)', ok: 200, call: ({ invoiceId }, c) => c.as('put', `/invoices/${invoiceId}`).send({ status: 'Cancelled' }) },
  { name: 'PUT /invoices/:id with status (reopen)', start: 'Cancelled', ok: 200, call: ({ invoiceId }, c) => c.as('put', `/invoices/${invoiceId}`).send({ status: 'Draft' }) },
  { name: 'POST /invoices/:id/items', ok: 201, call: ({ invoiceId }, c) => c.as('post', `/invoices/${invoiceId}/items`).send({ description: 'added', quantity: 1, unit_price: 10, discount: 0, tax_rate: 0 }) },
  { name: 'PUT /invoices/:id/items/:itemId', ok: 200, call: ({ invoiceId, itemId }, c) => c.as('put', `/invoices/${invoiceId}/items/${itemId}`).send({ quantity: 2 }) },
  { name: 'DELETE /invoices/:id/items/:itemId', ok: 200, call: ({ invoiceId, itemId }, c) => c.as('delete', `/invoices/${invoiceId}/items/${itemId}`) },
  { name: 'DELETE /invoices/:id', ok: 200, call: ({ invoiceId }, c) => c.as('delete', `/invoices/${invoiceId}`) },
  { name: 'POST /payment-terms/apply (invoice)', ok: 201, call: ({ invoiceId }, c) => c.as('post', '/payment-terms/apply').send({ document_id: invoiceId, document_type: 'invoice', payment_term_id: c.termId, installment_due_dates: agreedDates(2) }) },
  { name: 'GET /invoices/:id/cancellation-review', ok: 200, call: ({ invoiceId }, c) => c.as('get', `/invoices/${invoiceId}/cancellation-review`) },
];

describe('EBI-FOCUS-001 Fix 2 — manager-only invoice updates', () => {
  let db: DisposableDatabase;
  let t: TestApp;
  let fx: Fixtures;
  let ds: DataSource;
  let adminUser: FixtureUser;
  let ownerRep: FixtureUser;
  const tokens = {} as Record<Who, string>;
  let schoolId: string;
  let termId: string;
  let dealId: string;
  let repDealId: string;

  const client = (bearer: string | null) => (m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => {
    const req = request(t.http)[m](`/api/v2${path}`);
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };
  const line = (total: number) => ({ description: 'synthetic', quantity: 1, unit_price: total, discount: 0, tax_rate: 0 });

  const newInvoice = async (start?: string): Promise<Target> => {
    const res = await client(tokens.admin)('post', '/invoices')
      .send({ school_id: schoolId, deal_id: dealId, client_name: 'matrix', items: [line(1000)] })
      .expect(201);
    const invoiceId: string = res.body.data?.master_invoice?.id ?? res.body.data?.id;
    await ds.query(`update invoices set owner_id = $2 where id = $1`, [invoiceId, ownerRep.id]);
    if (start) await client(tokens.admin)('patch', `/invoices/${invoiceId}/status`).send({ status: start }).expect(200);
    const [item] = await ds.query(`select id from document_items where document_id = $1`, [invoiceId]);
    return { invoiceId, itemId: item.id };
  };
  const stateOf = async (invoiceId: string) => ({
    row: (await ds.query(`select status, total::text, notes, due_date, parent_invoice_id, is_summary_invoice, updated_at from invoices where id = $1`, [invoiceId]))[0],
    items: await ds.query(`select id, quantity::text, unit_price::text from document_items where document_id = $1 order by id`, [invoiceId]),
    plans: (await ds.query(`select count(*)::int n from applied_payment_terms where document_id = $1`, [invoiceId]))[0].n,
    children: (await ds.query(`select count(*)::int n from invoices where parent_invoice_id = $1`, [invoiceId]))[0].n,
  });

  beforeAll(async () => {
    db = await DisposableDatabase.create();
    await db.runMigrations();
    t = await createTestApp(db, [RealErrorFilterModule, PaymentTermsModule, InvoicesModule, QuotesModule, PaymentsModule, DealsModule]);
    ds = t.dataSource;
    fx = new Fixtures(ds, t.jwt);
    // @Roles matches real names, and fx.role() would suffix them.
    const realRole = async (name: string) => {
      const found: Array<{ id: string }> = await ds.query(`select id from roles where name = $1`, [name]);
      return found.length
        ? { id: found[0].id, name }
        : { id: (await fx.insertRow('roles', { name, description: 'fix2', is_active: true, is_system_role: true })).id as string, name };
    };
    const signIn = async (who: Who, roleName: string) => {
      const role = await realRole(roleName);
      const user = await fx.user(who, [role]);
      tokens[who] = (await fx.bearer(user)).token;
      return { user, role };
    };
    const admin = await signIn('admin', 'admin');
    adminUser = admin.user;
    await fx.insertRow('role_permissions', { role_id: admin.role.id, permission_id: await fx.permission('manage', 'all') });
    await signIn('admin_support', 'admin_support');
    const manager = await signIn('sales_manager', 'sales_manager');
    await signIn('manager', 'manager');
    await signIn('finance', 'finance');
    const rep = await signIn('owner_rep', 'sales_rep');
    ownerRep = rep.user;
    await signIn('other_rep', 'sales_rep');
    for (const role of [manager.role, rep.role]) {
      for (const action of ['read', 'update']) {
        await fx.insertRow('role_permissions', { role_id: role.id, permission_id: await fx.permission(action, 'Invoice') });
      }
    }
    schoolId = (await fx.school('FIX2')).id;
    termId = (await fx.insertRow('payment_terms', {
      name: 'Buy4Pay2 (synthetic)', type: 'custom', interest_rate: 0, interest_calculation_method: 'none',
      invoice_strategy: 'multiple_invoices', number_of_terms: 2, term_length_days: 30, days_until_due: 30,
      grace_period_days: 0, late_fee_percentage: 0, late_fee_amount: 0, is_active: true, is_default: false, display_order: 1,
    })).id as string;
    const leadId = (await fx.lead('FIX2', adminUser.id, schoolId)).id;
    const pipelineId = (await fx.insertRow('pipelines', { name: `fix2 pipeline ${randomUUID().slice(0, 6)}`, is_active: true })).id;
    const stageId = (await fx.insertRow('stages', { pipeline_id: pipelineId, name: 'Proposal', order: 1, sla_days: 7 })).id;
    dealId = (await fx.insertRow('deals', {
      id: randomUUID(), title: 'FIX2 deal', lead_id: leadId, school_id: schoolId, pipeline_id: pipelineId,
      current_stage_id: stageId, assigned_to: adminUser.id, value: 1000, currency: 'USD',
    })).id as string;
    repDealId = (await fx.insertRow('deals', {
      id: randomUUID(), title: 'FIX2 rep deal', lead_id: leadId, school_id: schoolId, pipeline_id: pipelineId,
      current_stage_id: stageId, assigned_to: ownerRep.id, value: 500, currency: 'USD',
    })).id as string;
  }, 600_000);

  afterAll(async () => {
    if (t) await t.close();
    if (db) await db.drop();
  });

  describe.each(ROUTES)('$name', ({ start, call, ok }) => {
    it.each(ALLOWED)('%s is allowed', async (who) => {
      const target = await newInvoice(start);
      const res = await call(target, { as: client(tokens[who]), termId });
      expect(res.status).toBe(ok);
    });

    it.each(REFUSED)('%s is refused, and nothing changes', async (who) => {
      const target = await newInvoice(start);
      const before = await stateOf(target.invoiceId);
      const res = await call(target, { as: client(tokens[who]), termId });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(FORBIDDEN);
      expect(res.body.details).toBeUndefined();
      expect(await stateOf(target.invoiceId)).toEqual(before);
    });

    it('an unauthenticated call is refused, and nothing changes', async () => {
      const target = await newInvoice(start);
      const before = await stateOf(target.invoiceId);
      const res = await call(target, { as: client(null), termId });
      expect(res.status).toBe(401);
      expect(await stateOf(target.invoiceId)).toEqual(before);
    });
  });

  // ---- issuing at creation
  describe('issuing by direct API at creation', () => {
    const body = (status?: string) => ({ school_id: schoolId, client_name: 'issue', items: [line(500)], ...(status ? { status } : {}) });
    const count = async () => Number((await ds.query(`select count(*) n from invoices`))[0].n);

    it.each(['owner_rep', 'other_rep'] as Who[])('%s cannot create an invoice as Sent, and nothing is created', async (who) => {
      const before = await count();
      const res = await client(tokens[who])('post', '/invoices').send(body('Sent'));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(FORBIDDEN);
      expect(await count()).toBe(before);
    });

    it('a rep can create a Draft, by default or by saying so', async () => {
      for (const status of [undefined, 'Draft']) {
        const res = await client(tokens.owner_rep)('post', '/invoices').send(body(status)).expect(201);
        const id = res.body.data?.master_invoice?.id ?? res.body.data?.id;
        expect((await ds.query(`select status from invoices where id = $1`, [id]))[0].status).toBe('Draft');
      }
    });

    it.each(ALLOWED)('%s can create an invoice as Sent', async (who) => {
      await client(tokens[who])('post', '/invoices').send(body('Sent')).expect(201);
    });

    it.each(['manager', 'finance'] as Who[])('%s, with no invoice rights, cannot create at all', async (who) => {
      const res = await client(tokens[who])('post', '/invoices').send(body());
      expect(res.status).toBe(403);
    });

    it('a converted quote is always a Draft, so a rep cannot issue that way', async () => {
      const q = await client(tokens.owner_rep)('post', '/quotes')
        .send({ school_id: schoolId, deal_id: repDealId, client_name: 'convert', status: 'Sent', items: [line(500)] })
        .expect(201);
      const res = await client(tokens.owner_rep)('post', `/invoices/convert-from-quote/${q.body.data.id}`).send({ status: 'Sent' }).expect(201);
      const id = res.body.data?.master_invoice?.id ?? res.body.data?.id;
      expect((await ds.query(`select status from invoices where id = $1`, [id]))[0].status).toBe('Draft');
    });

    it('a rep can still raise a Draft on a payment plan with agreed dates', async () => {
      const dates = agreedDates(2);
      await client(tokens.owner_rep)('post', '/invoices')
        .send({ school_id: schoolId, client_name: 'plan', payment_term_id: termId, installment_due_dates: dates, items: [line(7800)] })
        .expect(201);
    });
  });

  // ---- Fix 3: plans paid by school term
  describe('plans paid by term', () => {
    const admin = () => client(tokens.admin);
    const PLAN_DATES = 'PAYMENT_PLAN_DATES_REQUIRED';
    const planned = (extra: object = {}) => ({ school_id: schoolId, client_name: 'term', payment_term_id: termId, items: [line(7800)], ...extra });
    const rowCount = async () => Number((await ds.query(`select count(*) n from invoices`))[0].n);
    const singleTerm = async () =>
      (await fx.insertRow('payment_terms', {
        name: 'Net 30 (synthetic)', type: 'net-30', interest_rate: 0, interest_calculation_method: 'none',
        invoice_strategy: 'single_with_installments', number_of_terms: 1, days_until_due: 30,
        grace_period_days: 0, late_fee_percentage: 0, late_fee_amount: 0, is_active: true, is_default: false, display_order: 2,
      })).id as string;

    it('no dates: refused, no schedule is invented and nothing is created', async () => {
      const before = await rowCount();
      const res = await admin()('post', '/invoices').send(planned());
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(PLAN_DATES);
      expect(await rowCount()).toBe(before);
    });

    it('an empty date list is refused the same way', async () => {
      const res = await admin()('post', '/invoices').send(planned({ installment_due_dates: [] }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(PLAN_DATES);
    });

    it.each([
      ['too few dates', ['2027-01-12']],
      ['too many dates', ['2027-01-12', '2027-05-04', '2027-09-07']],
      ['an unparseable date', ['2027-01-12', 'next term']],
      ['dates out of order', ['2027-05-04', '2027-01-12']],
      ['a duplicate date', ['2027-01-12', '2027-01-12']],
      ['a date in the past', ['2020-01-01', '2027-01-12']],
    ])('%s is refused, and nothing is created', async (_label, installment_due_dates) => {
      const before = await rowCount();
      const res = await admin()('post', '/invoices').send(planned({ installment_due_dates }));
      expect(res.status).toBe(400);
      expect(await rowCount()).toBe(before);
    });

    it('agreed dates are stored exactly, on the instalments and child invoices, with correct totals', async () => {
      const res = await admin()('post', '/invoices').send(planned({ installment_due_dates: ['2027-01-12', '2027-05-04'] })).expect(201);
      const parentId = res.body.data?.master_invoice?.id ?? res.body.data?.id;
      const kids = await ds.query(`select total::text, to_char(due_date,'YYYY-MM-DD') due from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
      expect(kids).toEqual([{ total: '3900.00', due: '2027-01-12' }, { total: '3900.00', due: '2027-05-04' }]);
      const rows = await ds.query(`select amount::text, to_char(due_date,'YYYY-MM-DD') due from installments where parent_invoice_id = $1 order by installment_number`, [parentId]);
      expect(rows).toEqual([{ amount: '3900.00', due: '2027-01-12' }, { amount: '3900.00', due: '2027-05-04' }]);
      const [parent] = await ds.query(`select total::text from invoices where id = $1`, [parentId]);
      expect(parent.total).toBe('7800.00');
    });

    it('a payment on such a plan records and allocates as usual', async () => {
      const res = await admin()('post', '/invoices').send(planned({ installment_due_dates: ['2027-01-12', '2027-05-04'] })).expect(201);
      const parentId = res.body.data?.master_invoice?.id ?? res.body.data?.id;
      const [child] = await ds.query(`select id from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
      await admin()('post', '/payments')
        .send({ invoice_id: child.id, amount: 3900, payment_date: '2026-11-02', method: 'Cash', payment_method: 'Cash', reference: `FIX3-${randomUUID().slice(0, 8)}` })
        .expect(201);
      const [row] = await ds.query(`select status, balance::text from installments where invoice_id = $1`, [child.id]);
      expect(row).toEqual({ status: 'paid', balance: '0.00' });
    });

    it('a quote with agreed dates converts carrying those dates', async () => {
      const q = await admin()('post', '/quotes').send({ ...planned({ installment_due_dates: ['2027-01-12', '2027-05-04'] }) }).expect(201);
      const res = await admin()('post', `/invoices/convert-from-quote/${q.body.data.id}`).send({}).expect(201);
      const parentId = res.body.data?.master_invoice?.id ?? res.body.data?.id;
      const kids = await ds.query(`select to_char(due_date,'YYYY-MM-DD') due from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
      expect(kids.map((k: any) => k.due)).toEqual(['2027-01-12', '2027-05-04']);
    });

    it('an older quote whose plan has no agreed dates is refused at conversion, and is not spaced by days', async () => {
      const q = await admin()('post', '/quotes').send(planned({ installment_due_dates: ['2027-01-12', '2027-05-04'] })).expect(201);
      await ds.query(`update applied_payment_terms set calculation_breakdown = '{}' where document_id = $1`, [q.body.data.id]); // as older quotes hold
      const before = await rowCount();
      const res = await admin()('post', `/invoices/convert-from-quote/${q.body.data.id}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(PLAN_DATES);
      expect(await rowCount()).toBe(before);
    });

    it('a plan already applied keeps its schedule: nothing recalculates it', async () => {
      const res = await admin()('post', '/invoices').send(planned({ installment_due_dates: ['2027-01-12', '2027-05-04'] })).expect(201);
      const parentId = res.body.data?.master_invoice?.id ?? res.body.data?.id;
      await ds.query(`update installments set due_date = '2027-02-02' where parent_invoice_id = $1 and installment_number = 1`, [parentId]); // an older schedule
      await admin()('put', `/invoices/${parentId}`).send({ notes: 'unrelated edit' }).expect(200);
      await admin()('get', `/invoices/${parentId}/payment-schedule`).expect(200);
      const [row] = await ds.query(`select to_char(due_date,'YYYY-MM-DD') due from installments where parent_invoice_id = $1 and installment_number = 1`, [parentId]);
      expect(row.due).toBe('2027-02-02');
    });

    it('a single-payment plan is unaffected and needs no dates', async () => {
      await admin()('post', '/invoices').send(planned({ payment_term_id: await singleTerm() })).expect(201);
    });

    it('applying a plan to an invoice directly obeys the same rule', async () => {
      const { invoiceId } = await newInvoice();
      const res = await admin()('post', '/payment-terms/apply').send({ document_id: invoiceId, document_type: 'invoice', payment_term_id: termId });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(PLAN_DATES);
    });
  });

  // ---- what a rep keeps
  describe('a rep keeps creating and collecting', () => {
    const repClient = () => client(tokens.owner_rep);
    const quote = () =>
      repClient()('post', '/quotes')
        .send({ school_id: schoolId, deal_id: repDealId, client_name: 'kept', items: [line(500)] })
        .expect(201);

    it('can create an invoice', async () => {
      await repClient()('post', '/invoices').send({ school_id: schoolId, client_name: 'kept', items: [line(500)] }).expect(201);
    });

    it('can record a payment on their own invoice', async () => {
      const { invoiceId } = await newInvoice();
      await repClient()('post', '/payments')
        .send({ invoice_id: invoiceId, amount: 100, payment_date: '2026-11-02', method: 'Cash', payment_method: 'Cash', reference: `FIX2-${randomUUID().slice(0, 8)}` })
        .expect(201);
    });

    it('can read their own invoice', async () => {
      const { invoiceId } = await newInvoice();
      await repClient()('get', `/invoices/${invoiceId}`).expect(200);
    });

    it('can convert a quote into an invoice', async () => {
      const q = await quote();
      await repClient()('post', `/invoices/convert-from-quote/${q.body.data.id}`).send({}).expect(201);
    });

    it('can still apply a plan to a quote, which is not an invoice yet', async () => {
      const q = await quote();
      await repClient()('post', '/payment-terms/apply')
        .send({ document_id: q.body.data.id, document_type: 'quote', payment_term_id: termId, installment_due_dates: agreedDates(2) })
        .expect(201);
    });
  });
});
