/**
 * EBI-FOCUS-001 — one obligation, every screen.
 *
 * A representative sale ($7,800 invoiced, $3,900 received, $3,900 owed) read through
 * every route the affected screens use, plus families, Drafts, cancellations and the
 * historic state. Figures are compared as changes from a baseline, so each test proves
 * what its own transaction added. Sales, cash received, outstanding and overdue are
 * different questions and may legitimately differ; the same one must not.
 *
 * Also covers term-date conversion: nothing is created until dates are confirmed.
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
import { ReportsModule } from '../../src/reports/reports.module';
import { SchoolsModule } from '../../src/schools/schools.module';
import { agreedDates } from './support/agreed-dates';
import { makeHistoricCancelledParent } from './support/historic-state';
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

const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);

describe('EBI-FOCUS-001 — financial consistency and term-date conversion', () => {
  let db: DisposableDatabase;
  let t: TestApp;
  let fx: Fixtures;
  let ds: DataSource;
  let admin: FixtureUser;
  let token: string;
  let termId: string;
  let threeTermId: string;
  let leadId: string;
  let pipelineId: string;
  let stageId: string;

  const api = (m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    request(t.http)[m](`/api/v2${path}`).set('Authorization', `Bearer ${token}`);
  const line = (total: number) => ({ description: 'synthetic', quantity: 1, unit_price: total, discount: 0, tax_rate: 0 });
  const idOf = (body: any): string => body?.data?.master_invoice?.id ?? body?.data?.id;
  const status = (id: string, s: string) => api('patch', `/invoices/${id}/status`).send({ status: s });
  const pay = (invoiceId: string, amount: number) =>
    api('post', '/payments').send({ invoice_id: invoiceId, amount, payment_date: today(), method: 'Cash', payment_method: 'Cash', reference: `FC-${randomUUID().slice(0, 8)}` });
  const row = async (id: string) =>
    (await ds.query(`select status, payment_status, total::numeric::float8 total, amount_paid::numeric::float8 paid from invoices where id = $1`, [id]))[0];

  const newSchool = async () => (await fx.school(`FC ${randomUUID().slice(0, 6)}`)).id;
  const newDeal = async (schoolId: string, value = 7800): Promise<string> =>
    (await fx.insertRow('deals', {
      id: randomUUID(), title: 'FC deal', lead_id: leadId, school_id: schoolId, pipeline_id: pipelineId,
      current_stage_id: stageId, assigned_to: admin.id, value, currency: 'USD',
    })).id as string;
  const dealValue = async (id: string) => Number((await ds.query(`select value from deals where id = $1`, [id]))[0].value);
  const plain = async (schoolId: string, total: number, dealId?: string) =>
    idOf((await api('post', '/invoices').send({ school_id: schoolId, deal_id: dealId, client_name: 'FC', items: [line(total)] }).expect(201)).body);
  const family = async (schoolId: string, dealId?: string, total = 7800) => {
    const parentId = idOf((await api('post', '/invoices')
      .send({ school_id: schoolId, deal_id: dealId, client_name: 'FC', payment_term_id: termId, installment_due_dates: agreedDates(2), items: [line(total)] })
      .expect(201)).body);
    const kids: Array<{ id: string }> = await ds.query(`select id from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
    return { parentId, child1: kids[0].id, child2: kids[1].id };
  };
  const quote = async (schoolId: string, extra: object = {}, total = 7800) =>
    (await api('post', '/quotes').send({ school_id: schoolId, client_name: 'FC', items: [line(total)], ...extra }).expect(201)).body.data.id as string;
  const blankAgreedDates = (quoteId: string) =>
    ds.query(`update applied_payment_terms set calculation_breakdown = '{}' where document_id = $1`, [quoteId]); // as quotes before today hold

  /** Every money figure a screen shows, for one school where the route can filter. */
  const figures = async (schoolId: string) => {
    const stats = (await api('get', '/invoices/stats').expect(200)).body.data.yearly;
    const sales = await api('get', '/reports/sales-performance').query({ period: 'year' }).expect(200);
    const perf = sales.body.data ?? sales.body;
    const aging = (await api('get', '/collections/aging-report').expect(200)).body;
    const agingRows = ((aging.data ?? aging).installments as any[]);
    const school = (await api('get', `/schools/${schoolId}/stats`).expect(200)).body;
    const kpis = (await api('get', '/dashboard/kpis').expect(200)).body.data;
    const due = (await api('get', '/dashboard/collections-due').expect(200)).body.data;
    return {
      issuedSales: stats.totalValue as number,
      collected: stats.collectedValue as number,
      statsOutstanding: stats.outstandingValue as number,
      cash: perf.cashCollected as number,
      outstanding: perf.outstanding as number,
      draftNotIssued: perf.draftNotIssued as number,
      agingTotal: (aging.data ?? aging).total_outstanding as number,
      agingRows,
      schoolOutstanding: (school.data ?? school).outstandingInvoices.totalValue as number,
      kpiOverdue: kpis.overdueAmount as number,
      dueOverdue: due.overdue as number,
    };
  };
  const changed = (before: any, after: any) => ({
    issuedSales: after.issuedSales - before.issuedSales,
    collected: after.collected - before.collected,
    statsOutstanding: after.statsOutstanding - before.statsOutstanding,
    cash: after.cash - before.cash,
    outstanding: after.outstanding - before.outstanding,
    draftNotIssued: after.draftNotIssued - before.draftNotIssued,
    agingTotal: after.agingTotal - before.agingTotal,
  });

  beforeAll(async () => {
    db = await DisposableDatabase.create();
    await db.runMigrations();
    t = await createTestApp(db, [RealErrorFilterModule, PaymentTermsModule, InvoicesModule, QuotesModule, PaymentsModule, ReportsModule, DealsModule, SchoolsModule]);
    ds = t.dataSource;
    fx = new Fixtures(ds, t.jwt);
    const found: Array<{ id: string }> = await ds.query(`select id from roles where name = 'admin'`);
    const adminRole = found.length
      ? { id: found[0].id, name: 'admin' }
      : { id: (await fx.insertRow('roles', { name: 'admin', description: 'fc', is_active: true, is_system_role: true })).id as string, name: 'admin' };
    await fx.insertRow('role_permissions', { role_id: adminRole.id, permission_id: await fx.permission('manage', 'all') });
    admin = await fx.user('admin', [adminRole]);
    token = (await fx.bearer(admin)).token;
    const term = (name: string, terms: number) => fx.insertRow('payment_terms', {
      name, type: 'custom', interest_rate: 0, interest_calculation_method: 'none',
      invoice_strategy: 'multiple_invoices', number_of_terms: terms, term_length_days: 30, days_until_due: 30,
      grace_period_days: 0, late_fee_percentage: 0, late_fee_amount: 0, is_active: true, is_default: false, display_order: terms,
    });
    termId = (await term('Buy4Pay2 (synthetic)', 2)).id as string;
    threeTermId = (await term('Three terms (synthetic)', 3)).id as string;
    leadId = (await fx.lead('FC', admin.id, await newSchool())).id;
    pipelineId = (await fx.insertRow('pipelines', { name: `fc pipeline ${randomUUID().slice(0, 6)}`, is_active: true })).id as string;
    stageId = (await fx.insertRow('stages', { pipeline_id: pipelineId, name: 'Proposal', order: 1, sla_days: 7 })).id as string;
  }, 600_000);

  afterAll(async () => {
    if (t) await t.close();
    if (db) await db.drop();
  });

  // ---------------------------------------------------- the representative sale
  describe('a $7,800 invoice with $3,900 received', () => {
    let schoolId: string;
    let dealId: string;
    let invoiceId: string;
    let before: Awaited<ReturnType<typeof figures>>;
    let after: Awaited<ReturnType<typeof figures>>;

    beforeAll(async () => {
      schoolId = await newSchool();
      dealId = await newDeal(schoolId);
      before = await figures(schoolId);
      invoiceId = await plain(schoolId, 7800, dealId);
      await status(invoiceId, 'Sent').expect(200);
      await pay(invoiceId, 3900).expect(201);
      after = await figures(schoolId);
    }, 60_000);

    it('1 total equals the sum of its lines', async () => {
      const [{ sum }] = await ds.query(`select sum(total)::numeric::float8 sum from document_items where document_id = $1`, [invoiceId]);
      expect(sum).toBe((await row(invoiceId)).total);
    });

    it('3 paid equals the recorded payments', async () => {
      const [{ sum }] = await ds.query(`select sum(amount)::numeric::float8 sum from payments where invoice_id = $1`, [invoiceId]);
      expect(sum).toBe(3900);
      expect((await row(invoiceId)).paid).toBe(3900);
    });

    it('4 the balance is $3,900 on the invoice, the list, the deal and the school', async () => {
      const detail = (await api('get', `/invoices/${invoiceId}`).expect(200)).body.data;
      expect(Number(detail.total) - Number(detail.amount_paid)).toBe(3900);
      const list = (await api('get', '/invoices').query({ school_id: schoolId }).expect(200)).body.data;
      expect(list.map((i: any) => [i.status, Number(i.total), Number(i.amount_paid)])).toEqual([['Partially-Paid', 7800, 3900]]);
      const deal = (await api('get', `/deals/${dealId}`).expect(200)).body.data;
      expect(deal.invoices.map((i: any) => Number(i.total) - Number(i.amount_paid))).toEqual([3900]);
      expect(after.schoolOutstanding).toBe(3900);
    });

    it('10 sales, cash and outstanding each move by the right amount, and agree across screens', () => {
      expect(changed(before, after)).toEqual(expect.objectContaining({
        issuedSales: 7800, collected: 3900, statsOutstanding: 3900, cash: 3900, outstanding: 3900,
      }));
    });

    // Pre-existing and left out of this release: the aging report is built from
    // instalment rows, so an invoice with no schedule is missing from it, which is
    // the position of EBI's 0105. Pinned so a fix has to change this test on purpose.
    it('KNOWN GAP: Collections aging omits an invoice with no instalment schedule', () => {
      expect(after.agingTotal - before.agingTotal).toBe(0);
    });

    it('8 cash comes from the payment record, so a part payment counts and an invoice date does not move it', async () => {
      await ds.query(`update invoices set paid_date = '2001-01-01' where id = $1`, [invoiceId]);
      const later = await figures(schoolId);
      expect(later.cash).toBe(after.cash);
      await ds.query(`update invoices set paid_date = null where id = $1`, [invoiceId]);
    });

    it('9 the payment did not touch the deal value', async () => {
      expect(await dealValue(dealId)).toBe(7800);
    });

    it('7 it is not overdue while its date has not passed', () => {
      expect(after.kpiOverdue - before.kpiOverdue).toBe(0);
      expect(after.dueOverdue - before.dueOverdue).toBe(0);
    });
  });

  // ------------------------------------------------------------------- families
  describe('invoice families', () => {
    it('2 instalment principal sums exactly to the invoice, including when it does not divide', async () => {
      const schoolId = await newSchool();
      const parentId = idOf((await api('post', '/invoices')
        .send({ school_id: schoolId, client_name: 'FC', payment_term_id: threeTermId, installment_due_dates: agreedDates(3), items: [line(1000)] })
        .expect(201)).body);
      const rows = await ds.query(`select amount::text from installments where parent_invoice_id = $1 order by installment_number`, [parentId]);
      expect(rows.map((r: any) => r.amount)).toEqual(['333.33', '333.33', '333.34']);
      const [{ sum }] = await ds.query(`select sum(total)::text sum from invoices where parent_invoice_id = $1`, [parentId]);
      expect(sum).toBe('1000.00');
    });

    it('5 a family counts once as a sale and once as a debt', async () => {
      const schoolId = await newSchool();
      const before = await figures(schoolId);
      const { parentId, child1, child2 } = await family(schoolId);
      await status(parentId, 'Sent').expect(200);
      await status(child1, 'Sent').expect(200);
      await status(child2, 'Sent').expect(200);
      expect(changed(before, await figures(schoolId))).toEqual(expect.objectContaining({
        issuedSales: 7800, outstanding: 7800, agingTotal: 7800,
      }));
    });

    it('3 a part payment on a family allocates to its own instalment, and the parent rolls up without double counting', async () => {
      const schoolId = await newSchool();
      const before = await figures(schoolId);
      const { parentId, child1, child2 } = await family(schoolId);
      await pay(child1, 1500).expect(201);
      const [{ allocated }] = await ds.query(
        `select sum(a.allocated_amount)::numeric::float8 allocated from payment_allocations a join installments i on i.id = a.installment_id where i.invoice_id = $1`, [child1]);
      expect(allocated).toBe(1500);
      expect((await row(parentId)).paid).toBe(1500);
      expect((await row(child2)).paid).toBe(0);
      const moved = changed(before, await figures(schoolId));
      expect(moved.cash).toBe(1500);
      expect(moved.outstanding).toBe(6300);
    });

    it('a family paid in full owes nothing on any screen', async () => {
      const schoolId = await newSchool();
      const before = await figures(schoolId);
      const { child1, child2 } = await family(schoolId);
      await pay(child1, 3900).expect(201);
      await pay(child2, 3900).expect(201);
      const moved = changed(before, await figures(schoolId));
      expect(moved.cash).toBe(7800);
      expect(moved.outstanding).toBe(0);
      expect(moved.agingTotal).toBe(0);
    });
  });

  // ------------------------------------------------------ Draft and cancellation
  describe('Draft and cancelled documents', () => {
    // Before RELEASE-EBI-AUDIT-003 outstanding moved by 1,000 here: a Draft counted as debt.
    it('a Draft is neither a sale nor money owed; its value shows as not issued', async () => {
      const schoolId = await newSchool();
      const before = await figures(schoolId);
      await plain(schoolId, 1000);
      const moved = changed(before, await figures(schoolId));
      expect(moved.issuedSales).toBe(0);
      expect(moved.outstanding).toBe(0);
      expect(moved.draftNotIssued).toBe(1000);
    });

    it('6 a cancelled invoice leaves every figure, reads Cancelled, and keeps its amount and audit trail', async () => {
      const schoolId = await newSchool();
      const id = await plain(schoolId, 1000);
      await status(id, 'Sent').expect(200);
      const before = await figures(schoolId);
      await status(id, 'Cancelled').expect(200);
      const moved = changed(before, await figures(schoolId));
      expect(moved.outstanding).toBe(-1000);
      expect(moved.draftNotIssued).toBe(0);
      expect(await row(id)).toEqual(expect.objectContaining({ status: 'Cancelled', total: 1000 }));
      const [{ n }] = await ds.query(`select count(*)::int n from activity_logs where entity = 'Invoice' and entity_id = $1 and new_values->>'status' = 'Cancelled'`, [id]);
      expect(n).toBe(1);
    });

    it('6 a cancelled Draft leaves the not-issued figure', async () => {
      const schoolId = await newSchool();
      const id = await plain(schoolId, 1000);
      const before = await figures(schoolId);
      await status(id, 'Cancelled').expect(200);
      const moved = changed(before, await figures(schoolId));
      expect(moved.outstanding).toBe(0);
      expect(moved.draftNotIssued).toBe(-1000);
    });

    it('6 cancellation cannot erase a debt that has money against it', async () => {
      const schoolId = await newSchool();
      const { child1, child2 } = await family(schoolId);
      await pay(child1, 1000).expect(201);
      await status(child2, 'Cancelled').expect(409);
      expect((await row(child2)).status).toBe('Draft');
    });

    it('historic: a live instalment under a cancelled parent stays out of every figure, and is left as it is', async () => {
      const schoolId = await newSchool();
      const { parentId, child1 } = await family(schoolId);
      const before = await figures(schoolId);
      await makeHistoricCancelledParent(ds, parentId);
      const moved = changed(before, await figures(schoolId));
      expect(moved.outstanding).toBe(0);
      expect(moved.draftNotIssued).toBe(-7800);
      expect((await row(child1)).status).toBe('Draft');
    });
  });

  // -------------------------------------------------------------- overdue policy
  describe('overdue on the Harare calendar day', () => {
    const issuedDue = async (schoolId: string, due: Date) => {
      const id = await plain(schoolId, 500);
      await status(id, 'Sent').expect(200);
      await ds.query(`update invoices set due_date = $2, grace_due_date = $2 where id = $1`, [id, due]);
      return id;
    };

    it('7 unpaid and past its day is overdue on both dashboards; paid or not yet due is not', async () => {
      const schoolId = await newSchool();
      const before = await figures(schoolId);
      await issuedDue(schoolId, new Date(Date.now() + DAY * 5));
      const paidOff = await issuedDue(schoolId, new Date(Date.now() - DAY * 5));
      await pay(paidOff, 500).expect(201);
      await issuedDue(schoolId, new Date(Date.now() - DAY * 5));
      const after = await figures(schoolId);
      expect(after.kpiOverdue - before.kpiOverdue).toBe(500);
      expect(after.dueOverdue - before.dueOverdue).toBe(500);
    });
  });

  // ------------------------------------------------------------------ deal value
  describe('deal value', () => {
    const dealLogs = async (id: string) =>
      Number((await ds.query(`select count(*) n from activity_logs where entity = 'Deal' and entity_id = $1`, [id]))[0].n);

    it('9 editing an invoice note or cancelling it leaves an agreed deal value alone', async () => {
      const schoolId = await newSchool();
      const dealId = await newDeal(schoolId, 7800);
      const id = await plain(schoolId, 7800, dealId);
      await ds.query(`update deals set value = 8200 where id = $1`, [dealId]); // the agreed figure moved
      await api('put', `/invoices/${id}`).send({ notes: 'a note' }).expect(200);
      expect(await dealValue(dealId)).toBe(8200);
      await status(id, 'Cancelled').expect(200);
      expect(await dealValue(dealId)).toBe(8200);
    });

    it('9 converting a plan quote to a different total changes the value openly, with an audit row', async () => {
      const schoolId = await newSchool();
      const dealId = await newDeal(schoolId, 9000);
      const quoteId = await quote(schoolId, { deal_id: dealId, payment_term_id: termId, installment_due_dates: agreedDates(2) });
      await ds.query(`update deals set value = 9000 where id = $1`, [dealId]);
      const logs = await dealLogs(dealId);
      await api('post', `/invoices/convert-from-quote/${quoteId}`).send({}).expect(201);
      expect(await dealValue(dealId)).toBe(7800);
      expect(await dealLogs(dealId)).toBe(logs + 1);
    });

    it('9 converting at the agreed value writes nothing', async () => {
      const schoolId = await newSchool();
      const dealId = await newDeal(schoolId, 7800);
      const quoteId = await quote(schoolId, { deal_id: dealId });
      const logs = await dealLogs(dealId);
      await api('post', `/invoices/convert-from-quote/${quoteId}`).send({}).expect(201);
      expect(await dealLogs(dealId)).toBe(logs);
    });
  });

  // ------------------------------------------------------- term-date conversion
  describe('converting a quote with a payment plan', () => {
    const preview = async (id: string) => (await api('get', `/invoices/convert-from-quote/${id}/preview`).expect(200)).body.data;
    const invoiceCount = async () => Number((await ds.query(`select count(*) n from invoices`))[0].n);
    const childDates = async (parentId: string) =>
      (await ds.query(`select to_char(due_date,'YYYY-MM-DD') due from invoices where parent_invoice_id = $1 order by due_date`, [parentId])).map((r: any) => r.due);

    it('missing dates: the preview suggests the next terms, shows the amounts, and creates nothing', async () => {
      const schoolId = await newSchool();
      const id = await quote(schoolId, { payment_term_id: termId, installment_due_dates: agreedDates(2) });
      await blankAgreedDates(id);
      const before = await invoiceCount();
      const p = await preview(id);
      expect(p.dates_source).toBe('suggested');
      expect(p.installments.map((i: any) => i.amount)).toEqual([3900, 3900]);
      expect(p.total).toBe(7800);
      for (const { due_date } of p.installments) expect(due_date).toMatch(/-(01-31|05-31|09-30)$/);
      expect(p.installments[0].due_date >= today()).toBe(true);
      expect(await invoiceCount()).toBe(before);
    });

    it('missing dates: conversion is refused until they are confirmed, and nothing is created', async () => {
      const schoolId = await newSchool();
      const id = await quote(schoolId, { payment_term_id: termId, installment_due_dates: agreedDates(2) });
      await blankAgreedDates(id);
      const before = await invoiceCount();
      const res = await api('post', `/invoices/convert-from-quote/${id}`).send({}).expect(400);
      expect(res.body.code).toBe('PAYMENT_PLAN_DATES_REQUIRED');
      expect(await invoiceCount()).toBe(before);
    });

    it('confirmed, edited dates are the dates created, and the amounts match the preview', async () => {
      const schoolId = await newSchool();
      const id = await quote(schoolId, { payment_term_id: termId, installment_due_dates: agreedDates(2) });
      await blankAgreedDates(id);
      const shown = await preview(id);
      const res = await api('post', `/invoices/convert-from-quote/${id}`)
        .send({ installment_due_dates: ['2027-02-15', '2027-06-20'] }).expect(201);
      const parentId = idOf(res.body);
      expect(await childDates(parentId)).toEqual(['2027-02-15', '2027-06-20']);
      const kids = await ds.query(`select total::numeric::float8 total from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
      expect(kids.map((k: any) => k.total)).toEqual(shown.installments.map((i: any) => i.amount));
    });

    it('agreed dates are shown as agreed and convert with no re-entry', async () => {
      const schoolId = await newSchool();
      const id = await quote(schoolId, { payment_term_id: termId, installment_due_dates: ['2027-01-12', '2027-05-04'] });
      const p = await preview(id);
      expect(p.dates_source).toBe('agreed');
      expect(p.installments.map((i: any) => i.due_date)).toEqual(['2027-01-12', '2027-05-04']);
      const res = await api('post', `/invoices/convert-from-quote/${id}`).send({}).expect(201);
      expect(await childDates(idOf(res.body))).toEqual(['2027-01-12', '2027-05-04']);
    });

    it('amounts that do not divide still sum exactly, in the preview and on the invoices', async () => {
      const schoolId = await newSchool();
      const id = await quote(schoolId, { payment_term_id: threeTermId, installment_due_dates: agreedDates(3) }, 1000);
      const p = await preview(id);
      expect(p.installments.map((i: any) => i.amount)).toEqual([333.33, 333.33, 333.34]);
      expect(p.installments.reduce((sum: number, i: any) => sum + Math.round(i.amount * 100), 0)).toBe(100000);
    });

    it.each([
      ['too few dates', ['2027-01-12']],
      ['too many dates', ['2027-01-12', '2027-05-04', '2027-09-07']],
      ['out of order', ['2027-05-04', '2027-01-12']],
      ['an unparseable date', ['2027-01-12', 'next term']],
    ])('%s is refused at conversion, and nothing is created', async (_label, installment_due_dates) => {
      const schoolId = await newSchool();
      const id = await quote(schoolId, { payment_term_id: termId, installment_due_dates: agreedDates(2) });
      await blankAgreedDates(id);
      const before = await invoiceCount();
      await api('post', `/invoices/convert-from-quote/${id}`).send({ installment_due_dates }).expect(400);
      expect(await invoiceCount()).toBe(before);
    });

    it('a plan-free quote previews its total and converts as before', async () => {
      const schoolId = await newSchool();
      const id = await quote(schoolId, {}, 500);
      const p = await preview(id);
      expect([p.plan, p.installments, p.total]).toEqual([null, [], 500]);
      await api('post', `/invoices/convert-from-quote/${id}`).send({}).expect(201);
    });

    it('two conversions at the same moment create one set of obligations', async () => {
      const schoolId = await newSchool();
      const id = await quote(schoolId, { payment_term_id: termId, installment_due_dates: agreedDates(2) });
      const before = await invoiceCount();
      const results = await Promise.all([
        api('post', `/invoices/convert-from-quote/${id}`).send({}),
        api('post', `/invoices/convert-from-quote/${id}`).send({}),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400].sort());
      expect(await invoiceCount()).toBe(before + 3);
    });

    it('a repeat conversion is refused, and the preview names the invoice', async () => {
      const schoolId = await newSchool();
      const id = await quote(schoolId);
      const made = await api('post', `/invoices/convert-from-quote/${id}`).send({}).expect(201);
      await api('post', `/invoices/convert-from-quote/${id}`).send({}).expect(400);
      const [{ invoice_number }] = await ds.query(`select invoice_number from invoices where id = $1`, [idOf(made.body)]);
      expect((await preview(id)).already_invoiced).toBe(invoice_number);
    });

    it('New Invoice cannot raise a second live invoice from the same quote', async () => {
      const schoolId = await newSchool();
      const id = await quote(schoolId);
      await api('post', `/invoices/convert-from-quote/${id}`).send({}).expect(201);
      const res = await api('post', '/invoices').send({ school_id: schoolId, quote_id: id, client_name: 'FC', items: [line(7800)] }).expect(409);
      expect(res.body.code).toBe('QUOTE_ALREADY_INVOICED');
    });

    it('once that invoice is cancelled, a replacement is allowed', async () => {
      const schoolId = await newSchool();
      const id = await quote(schoolId);
      const made = await api('post', `/invoices/convert-from-quote/${id}`).send({}).expect(201);
      await status(idOf(made.body), 'Cancelled').expect(200);
      await api('post', '/invoices').send({ school_id: schoolId, quote_id: id, client_name: 'FC', items: [line(7800)] }).expect(201);
    });
  });
});
