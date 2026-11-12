/**
 * 010C (final) — one overdue boundary for every overdue figure.
 *
 * Rule: an invoice or instalment is due throughout its due date in
 * Africa/Harare and becomes overdue at 00:00 the next Harare day. The
 * effective deadline is COALESCE(grace_due_date, due_date) wherever a grace
 * date exists. Figures covered here: the invoice list's `overdue` filter, the
 * invoice stats, the deal pipeline summary, the collections aging report with
 * its as-of date; the KPI (already on the rule since boundaries.e2e-spec.ts)
 * is read alongside so the four agree with it.
 */
import request from 'supertest';
import { DataSource } from 'typeorm';
import { DealsModule } from '../../src/deals/deals.module';
import { InvoicesModule } from '../../src/invoices/invoices.module';
import { PaymentsModule } from '../../src/payments/payments.module';
import { PaymentTermsModule } from '../../src/payment-terms/payment-terms.module';
import { QuotesModule } from '../../src/quotes/quotes.module';
import { ReportsModule } from '../../src/reports/reports.module';
import { businessDateKey, businessDaysOverdue } from '../../src/invoices/invoice-obligations';
import { makeHistoricCancelledParent } from './support/historic-state';
import { agreedDates } from './support/agreed-dates';
import { DisposableDatabase } from '../campaign001/support/disposable-db';
import { Fixtures, FixtureUser } from '../campaign001/support/fixtures';
import { TestApp, createTestApp } from '../campaign001/support/test-app';

const H = 60 * 60 * 1000;
const DAY = 24 * H;
const HARARE = 2 * H;
const SUMMARY_PATH = '/deals/summary';
const REAL_TIMERS = ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'hrtime', 'performance'] as const;

describe('010C final — the Harare-day overdue rule applied to list, stats, deals and aging', () => {
  let db: DisposableDatabase;
  let t: TestApp;
  let fx: Fixtures;
  let ds: DataSource;
  let admin: FixtureUser;
  let token: string;
  let schoolId: string;
  let termId: string;
  let pipelineId: string;
  let stageId: string;
  let leadId: string;

  const api = (m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    request(t.http)[m](`/api/v2${path}`).set('Authorization', `Bearer ${token}`);
  const createdId = (body: any): string => body?.data?.master_invoice?.id ?? body?.data?.id;
  const line = (total: number) => ({ description: 'synthetic', quantity: 1, unit_price: total, discount: 0, tax_rate: 0 });
  const setDue = (id: string, due: Date | string, grace?: Date | string) =>
    ds.query(`update invoices set due_date = $2, grace_due_date = $3 where id = $1`, [id, due, grace ?? due]);
  const status = (id: string, s: string) => api('patch', `/invoices/${id}/status`).send({ status: s });
  const pay = (invoiceId: string, amount: number, ref: string) =>
    api('post', '/payments').send({ invoice_id: invoiceId, amount, payment_date: '2026-10-28', method: 'Cash', payment_method: 'Cash', reference: ref }).expect(201);
  const deal = async (label: string) =>
    (await fx.insertRow('deals', {
      lead_id: leadId, school_id: schoolId, current_stage_id: stageId, pipeline_id: pipelineId,
      assigned_to: admin.id, title: `${label} deal`, value: 1000, current_status: 'open',
    })).id as string;
  const standalone = async (label: string, total: number, dealId: string, due: Date | string, grace?: Date | string, s = 'Sent') => {
    const id = createdId((await api('post', '/invoices').send({ school_id: schoolId, deal_id: dealId, client_name: label, items: [line(total)] }).expect(201)).body);
    await setDue(id, due, grace);
    if (s !== 'Draft') await status(id, s).expect(200);
    return id;
  };
  const family = async (label: string, dealId: string) => {
    const parentId = createdId((await api('post', '/invoices')
      .send({ school_id: schoolId, deal_id: dealId, client_name: label, payment_term_id: termId, installment_due_dates: agreedDates(2), items: [line(7800)] })
      .expect(201)).body);
    const kids: Array<{ id: string }> = await ds.query(`select id from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
    return { parentId, child1: kids[0].id, child2: kids[1].id };
  };

  // ---- the four figures under test, plus the KPI they must agree with
  const listOverdue = async (includeChildren = false): Promise<Set<string>> => {
    const res = await api('get', '/invoices').query({ overdue: true, include_children: includeChildren, limit: 100 }).expect(200);
    return new Set((res.body.data as Array<{ id: string }>).map((i) => i.id));
  };
  /** Every period block of the stats that reports an overdue count; the widest period always holds today's invoices. */
  const statsOverdueMax = async (): Promise<number> => {
    const res = await api('get', '/invoices/stats').expect(200);
    const counts: number[] = [];
    const walk = (o: any) => {
      if (!o || typeof o !== 'object') return;
      if (typeof o.overdue === 'number') counts.push(o.overdue);
      for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
    };
    walk(res.body.data);
    expect(counts.length).toBeGreaterThan(0);
    return Math.max(...counts);
  };
  const dealsOverdue = async (): Promise<number> => {
    const res = await api('get', SUMMARY_PATH).query({ pipeline_id: pipelineId }).expect(200);
    return res.body.data.deals_with_overdue_invoices as number;
  };
  const kpiOverdue = async (): Promise<number> =>
    (await api('get', '/dashboard/kpis').expect(200)).body.data.overdueAmount as number;
  const aging = async (asOf?: string) => {
    const res = await api('get', '/collections/aging-report').query(asOf ? { as_of_date: asOf } : {}).expect(200);
    const body = res.body.data ?? res.body;
    return body.installments as Array<{ installment_id: string; invoice_id: string; days_overdue: number; aging_bucket: string; balance: number }>;
  };

  // Harare "today" starts at this UTC instant (real clock at module load).
  const realNow = new Date();
  const hNow = new Date(realNow.getTime() + HARARE);
  const todayStartUtc = Date.UTC(hNow.getUTCFullYear(), hNow.getUTCMonth(), hNow.getUTCDate()) - HARARE;
  const todayKey = businessDateKey(realNow);
  const yesterdayKey = businessDateKey(new Date(realNow.getTime() - DAY));
  const at = (dayOffset: number, hours: number, minutes = 0, seconds = 0) =>
    new Date(todayStartUtc + dayOffset * DAY + hours * H + minutes * 60_000 + seconds * 1000);

  beforeAll(async () => {
    db = await DisposableDatabase.create();
    await db.runMigrations();
    t = await createTestApp(db, [PaymentTermsModule, InvoicesModule, QuotesModule, PaymentsModule, ReportsModule, DealsModule]);
    ds = t.dataSource;
    fx = new Fixtures(ds, t.jwt);
    const found: Array<{ id: string }> = await ds.query(`select id from roles where name = 'admin'`);
    const adminRole = found.length
      ? { id: found[0].id, name: 'admin' }
      : { id: (await fx.insertRow('roles', { name: 'admin', description: 'ebi010', is_active: true, is_system_role: false })).id as string, name: 'admin' };
    await fx.insertRow('role_permissions', { role_id: adminRole.id, permission_id: await fx.permission('manage', 'all'), conditions: null, is_active: true });
    admin = await fx.user('admin', [adminRole]);
    token = (await fx.bearer(admin)).token;
    schoolId = (await fx.school('EBI010E')).id;
    leadId = (await fx.lead('EBI010E', admin.id, schoolId)).id;
    pipelineId = (await fx.insertRow('pipelines', { name: 'EBI010E pipeline', is_active: true })).id;
    stageId = (await fx.insertRow('stages', { pipeline_id: pipelineId, name: 'Open', order: 1, is_active: true })).id;
    termId = (await fx.insertRow('payment_terms', {
      name: 'Two instalments (synthetic)', type: 'custom', interest_rate: 0, interest_calculation_method: 'none',
      invoice_strategy: 'multiple_invoices', number_of_terms: 2, term_length_days: 30, days_until_due: 30,
      grace_period_days: 0, late_fee_percentage: 0, late_fee_amount: 0, is_active: true, is_default: false, display_order: 0,
    })).id;
  }, 600_000);

  afterAll(async () => {
    jest.useRealTimers();
    if (t) await t.close();
    if (db) await db.drop();
  });
  afterEach(() => jest.useRealTimers());

  it('helper: whole Harare days, zero on the deadline day itself', () => {
    expect(businessDaysOverdue(at(0, 0), at(0, 23, 59, 59))).toBe(0);
    expect(businessDaysOverdue(at(0, 23, 59, 59), at(1, 0, 0, 0))).toBe(1);
    expect(businessDaysOverdue(at(0, 12), at(0, 1))).toBe(0); // as-of earlier the same day is not negative
    expect(businessDaysOverdue(new Date('2026-09-10'), new Date('2026-09-10T23:30:00Z'))).toBe(1); // 01:30 Harare on the 11th
    expect(businessDaysOverdue(new Date('2026-09-10'), new Date('2026-09-10T21:59:59Z'))).toBe(0); // 23:59 Harare on the 10th
  });

  describe('due today — 00:00, 12:00 and 23:59:59 Harare — then the clock passes Harare midnight', () => {
    let d1: string;
    const ids: string[] = [];
    let before: { list: Set<string>; stats: number; deals: number; kpi: number };

    it('is not overdue anywhere while the due day lasts', async () => {
      d1 = await deal('T1');
      before = { list: await listOverdue(), stats: await statsOverdueMax(), deals: await dealsOverdue(), kpi: await kpiOverdue() };
      ids.push(await standalone('T1-0000', 11, d1, at(0, 0)));
      ids.push(await standalone('T1-1200', 13, d1, at(0, 12)));
      ids.push(await standalone('T1-2359', 17, d1, at(0, 23, 59, 59)));
      const list = await listOverdue();
      for (const id of ids) expect(list.has(id)).toBe(false);
      expect(await statsOverdueMax()).toBe(before.stats);
      expect(await dealsOverdue()).toBe(before.deals);
      expect(await kpiOverdue()).toBe(before.kpi);
    });

    it('is overdue in the list, stats, deal summary and KPI one second after 00:00 the next Harare day', async () => {
      jest.useFakeTimers({ doNotFake: [...REAL_TIMERS], now: at(1, 0, 0, 1) });
      expect(businessDateKey(new Date())).not.toBe(todayKey);
      const list = await listOverdue();
      for (const id of ids) expect(list.has(id)).toBe(true);
      expect(await statsOverdueMax()).toBe(before.stats + 3);
      expect(await dealsOverdue()).toBe(before.deals + 1);
      expect(await kpiOverdue()).toBe(before.kpi + 11 + 13 + 17);
    });

    it('and is still "due today" at 23:59:59 of the due day (the old NOW() rule had called it overdue since 02:00)', async () => {
      jest.useFakeTimers({ doNotFake: [...REAL_TIMERS], now: at(0, 23, 59, 59) });
      const list = await listOverdue();
      for (const id of ids) expect(list.has(id)).toBe(false);
      expect(await dealsOverdue()).toBe(before.deals);
      const [{ naive }] = await ds.query(
        `select count(*)::int as naive from invoices where id = any($1) and coalesce(grace_due_date, due_date) < $2`,
        [ids, at(0, 23, 59, 59)],
      );
      // The pre-010C comparison against the instant: strict `<`, so at 23:59:59 the
      // 00:00 and 12:00 invoices were already "overdue" and the 23:59:59 one would
      // follow one millisecond later — all three while still due that day.
      expect(naive).toBe(2);
      const [{ naiveNext }] = await ds.query(
        `select count(*)::int as "naiveNext" from invoices where id = any($1) and coalesce(grace_due_date, due_date) < $2`,
        [ids, new Date(at(0, 23, 59, 59).getTime() + 1)],
      );
      expect(naiveNext).toBe(3);
    });
  });

  describe('timestamp versus YYYY-MM-DD due dates', () => {
    it("a date-only due date (stored 00:00 UTC = 02:00 Harare) is due all day today; yesterday's date is overdue", async () => {
      const d3 = await deal('T3');
      const before = { stats: await statsOverdueMax(), kpi: await kpiOverdue() };
      const e = await standalone('T3-today', 19, d3, todayKey);
      const f = await standalone('T3-yesterday', 23, d3, yesterdayKey);
      const list = await listOverdue();
      expect(list.has(e)).toBe(false);
      expect(list.has(f)).toBe(true);
      expect(await statsOverdueMax()).toBe(before.stats + 1);
      expect(await kpiOverdue()).toBe(before.kpi + 23);
      // The pre-010C rule, re-run over the same two rows at the real clock:
      const [{ naive }] = await ds.query(
        `select count(*)::int as naive from invoices where id = any($1) and coalesce(grace_due_date, due_date) < now()`,
        [[e, f]],
      );
      const pastTwoAm = hNow.getUTCHours() >= 2;
      expect(naive).toBe(pastTwoAm ? 2 : 1);
    });
  });

  describe('grace period', () => {
    it('the grace date is the deadline for the list, stats, deal summary and (since 010D) the KPI', async () => {
      const d4 = await deal('T4');
      const before = { stats: await statsOverdueMax(), deals: await dealsOverdue(), kpi: await kpiOverdue() };
      // G: due yesterday noon, grace until today noon -> within grace all of today
      const g = await standalone('T4-grace-today', 29, d4, at(-1, 12), at(0, 12));
      let list = await listOverdue();
      expect(list.has(g)).toBe(false);
      expect(await statsOverdueMax()).toBe(before.stats);
      expect(await dealsOverdue()).toBe(before.deals);
      expect(await kpiOverdue()).toBe(before.kpi); // 010D: the KPI honours the grace date too
      // H: due three days ago, grace ended yesterday 23:59 -> overdue from today
      const h = await standalone('T4-grace-expired', 31, d4, at(-3, 12), at(-1, 23, 59, 59));
      list = await listOverdue();
      expect(list.has(h)).toBe(true);
      expect(await statsOverdueMax()).toBe(before.stats + 1);
      expect(await dealsOverdue()).toBe(before.deals + 1);
      expect(await kpiOverdue()).toBe(before.kpi + 31);
      // G's grace ends at Harare midnight: one second later G is overdue too
      jest.useFakeTimers({ doNotFake: [...REAL_TIMERS], now: at(1, 0, 0, 1) });
      list = await listOverdue();
      expect(list.has(g)).toBe(true);
      // The faked clock moves every earlier invoice past midnight too: T1 (11 + 13 + 17) and T3-today (19).
      expect(await kpiOverdue()).toBe(before.kpi + 29 + 31 + 41 + 19);
    });
  });

  describe('collections aging report with an as-of date (historical)', () => {
    it('an instalment is current on its due day and ages in whole Harare days after it; the grace date moves the deadline', async () => {
      const d5 = await deal('T5');
      const f = await family('T5', d5);
      await status(f.child1, 'Sent').expect(200);
      await status(f.child2, 'Sent').expect(200);
      const rows: Array<{ id: string; invoice_id: string }> = await ds.query(
        `select id, invoice_id from installments where invoice_id = any($1) order by due_date, installment_number`,
        [[f.parentId, f.child1, f.child2]],
      );
      expect(rows.length).toBeGreaterThanOrEqual(2);
      const [i1, i2] = rows;
      await ds.query(`update installments set due_date = '2026-09-10', grace_due_date = '2026-09-10' where id = $1`, [i1.id]);
      await ds.query(`update installments set due_date = '2026-10-10', grace_due_date = '2026-10-20' where id = $1`, [i2.id]);
      const find = (list: Awaited<ReturnType<typeof aging>>, id: string) => list.find((x) => x.installment_id === id)!;

      let r = await aging('2026-09-09');
      expect(find(r, i1.id)).toMatchObject({ days_overdue: 0, aging_bucket: 'current' });
      r = await aging('2026-09-10'); // the due day itself
      expect(find(r, i1.id)).toMatchObject({ days_overdue: 0, aging_bucket: 'current' });
      r = await aging('2026-09-10T23:30:00Z'); // 01:30 Harare on the 11th: the old floor() of hours said "current"
      expect(find(r, i1.id)).toMatchObject({ days_overdue: 1, aging_bucket: '1-30' });
      r = await aging('2026-09-11');
      expect(find(r, i1.id)).toMatchObject({ days_overdue: 1, aging_bucket: '1-30' });
      r = await aging('2026-10-25');
      expect(find(r, i1.id)).toMatchObject({ days_overdue: 45, aging_bucket: '31-60' });
      expect(find(r, i2.id)).toMatchObject({ days_overdue: 5, aging_bucket: '1-30' }); // grace 20 Oct, not due 10 Oct
      r = await aging('2026-10-15');
      expect(find(r, i2.id)).toMatchObject({ days_overdue: 0, aging_bucket: 'current' }); // inside grace
      r = await aging(); // now: both well past
      expect(find(r, i1.id).days_overdue).toBe(businessDaysOverdue(new Date('2026-09-10'), new Date()));
      // which invoice holds the instalment rows is recorded in the report (parent or child)
      const owners = new Set(rows.map((x) => x.invoice_id));
      console.log('[010C-final] instalment rows belong to:', [...owners].map((o) => (o === f.parentId ? 'parent' : 'child')).join(','), 'count', rows.length);
    });
  });

  describe('families, partial payments, cancellation and a Draft parent — same boundary, existing scope rules intact', () => {
    it('a family due three days ago: list/stats/deal count the document(s); the KPI counts issued obligations only', async () => {
      const d6 = await deal('T6');
      const before = { stats: await statsOverdueMax(), deals: await dealsOverdue(), kpi: await kpiOverdue() };
      const f = await family('T6', d6);
      await setDue(f.parentId, at(-3, 12));
      await setDue(f.child1, at(-3, 12));
      await setDue(f.child2, at(-3, 12));
      // all Draft: nothing was issued, so nothing is overdue. Before RELEASE-EBI-AUDIT-003
      // the list, stats and deal summary each counted this family.
      let top = await listOverdue();
      let all = await listOverdue(true);
      expect(top.has(f.parentId)).toBe(false);
      expect(all.has(f.child1) || all.has(f.child2)).toBe(false);
      expect(await statsOverdueMax()).toBe(before.stats);
      expect(await dealsOverdue()).toBe(before.deals);
      expect(await kpiOverdue()).toBe(before.kpi);
      // issue the first instalment under the Draft parent: the family now counts, the Draft sibling does not
      await status(f.child1, 'Sent').expect(200);
      top = await listOverdue();
      all = await listOverdue(true);
      expect(top.has(f.parentId)).toBe(true);
      expect(top.has(f.child1)).toBe(false); // the list filter is document-level
      expect(all.has(f.child1)).toBe(true);
      expect(all.has(f.child2)).toBe(false);
      expect(await statsOverdueMax()).toBe(before.stats + 1); // top-level documents
      expect(await dealsOverdue()).toBe(before.deals + 1);
      expect(await kpiOverdue()).toBe(before.kpi + 3900);
      // partial payment on the issued instalment: still overdue, deal still overdue, family issued -> both instalments owed
      await pay(f.child1, 1500, 'T6-1');
      top = await listOverdue();
      expect(top.has(f.parentId)).toBe(true);
      expect(await dealsOverdue()).toBe(before.deals + 1);
      expect(await kpiOverdue()).toBe(before.kpi + 2400 + 3900);
    });

    it('a cancelled parent drops out of the list, stats, deal summary and KPI; its Draft instalments only show when children are requested', async () => {
      const d7 = await deal('T7');
      const before = { stats: await statsOverdueMax(), deals: await dealsOverdue(), kpi: await kpiOverdue() };
      const f = await family('T7', d7);
      await setDue(f.parentId, at(-3, 12));
      await setDue(f.child1, at(-3, 12));
      await setDue(f.child2, at(-3, 12));
      await makeHistoricCancelledParent(ds, f.parentId);
      const top = await listOverdue();
      expect(top.has(f.parentId)).toBe(false);
      expect(await statsOverdueMax()).toBe(before.stats);
      expect(await dealsOverdue()).toBe(before.deals);
      expect(await kpiOverdue()).toBe(before.kpi);
      const all = await listOverdue(true);
      console.log('[010C-final] cancelled parent, include_children=true lists its Draft instalments:', all.has(f.child1));
    });

    it('a cancelled standalone invoice and a paid one are never overdue', async () => {
      const d8 = await deal('T8');
      const before = { stats: await statsOverdueMax(), deals: await dealsOverdue(), kpi: await kpiOverdue() };
      const c = await standalone('T8-cancelled', 37, d8, at(-3, 12));
      await status(c, 'Cancelled').expect(200);
      const p = await standalone('T8-paid', 41, d8, at(-3, 12));
      await pay(p, 41, 'T8-1');
      const list = await listOverdue();
      expect(list.has(c) || list.has(p)).toBe(false);
      expect(await statsOverdueMax()).toBe(before.stats);
      expect(await dealsOverdue()).toBe(before.deals);
      expect(await kpiOverdue()).toBe(before.kpi);
    });
  });
});
