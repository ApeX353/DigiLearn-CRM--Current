/**
 * 010C — the cancellation rule and the overdue-date boundary.
 *
 * 1. Cancellation: an obligation under a cancelled parent is never counted,
 *    whatever its own status; a cancelled child is never counted while its
 *    siblings are; a parent holding money cannot be cancelled.
 * 2. Boundary: the KPI overdue amount (SQL) and Collections Due (in memory)
 *    judge "overdue" the same way, on the Africa/Harare calendar day, for due
 *    dates placed minutes either side of Harare midnight and for a YYYY-MM-DD
 *    date stored as UTC midnight.
 */
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InvoicesModule } from '../../src/invoices/invoices.module';
import { PaymentsModule } from '../../src/payments/payments.module';
import { PaymentTermsModule } from '../../src/payment-terms/payment-terms.module';
import { QuotesModule } from '../../src/quotes/quotes.module';
import { ReportsModule } from '../../src/reports/reports.module';
import { businessDateKey, isOverdueOn, overdueBefore } from '../../src/invoices/invoice-obligations';
import { makeHistoricCancelledParent } from './support/historic-state';
import { agreedDates } from './support/agreed-dates';
import { DisposableDatabase } from '../campaign001/support/disposable-db';
import { Fixtures, FixtureUser } from '../campaign001/support/fixtures';
import { TestApp, createTestApp } from '../campaign001/support/test-app';

const H = 60 * 60 * 1000;
const DAY = 24 * H;
const HARARE = 2 * H;

describe('010C — cancellation rule and the overdue boundary around Harare midnight', () => {
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
  const setDue = (id: string, when: Date) => ds.query(`update invoices set due_date = $2, grace_due_date = $2 where id = $1`, [id, when]);
  const status = (id: string, s: string) => api('patch', `/invoices/${id}/status`).send({ status: s });
  const pay = (invoiceId: string, amount: number, ref: string) =>
    api('post', '/payments').send({ invoice_id: invoiceId, amount, payment_date: '2026-10-28', method: 'Cash', payment_method: 'Cash', reference: ref }).expect(201);
  const standaloneSent = async (label: string, total: number, due: Date) => {
    const id = createdId((await api('post', '/invoices').send({ school_id: schoolId, client_name: `${label}`, items: [line(total)] }).expect(201)).body);
    await setDue(id, due);
    await status(id, 'Sent').expect(200);
    return id;
  };
  const family = async (label: string) => {
    const parentId = createdId((await api('post', '/invoices')
      .send({ school_id: schoolId, client_name: `${label}`, payment_term_id: termId, installment_due_dates: agreedDates(2), items: [line(7800)] })
      .expect(201)).body);
    const kids: Array<{ id: string }> = await ds.query(`select id from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
    return { parentId, child1: kids[0].id, child2: kids[1].id };
  };
  const figures = async () => {
    const kpis = await api('get', '/dashboard/kpis').expect(200);
    const due = await api('get', '/dashboard/collections-due').expect(200);
    const rep = await api('get', '/reports/sales-performance').query({ period: 'year' }).expect(200);
    return {
      kpiOverdue: kpis.body.data.overdueAmount as number,
      overdue: due.body.data.overdue as number,
      dueToday: due.body.data.dueToday as number,
      dueIn7Days: due.body.data.dueIn7Days as number,
      overdueList: due.body.data.overdueList as Array<{ invoiceNumber: string; outstanding: number; daysOverdue: number; dueDate: string }>,
      outstanding: (rep.body.data?.outstanding ?? rep.body.outstanding) as number,
    };
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
    schoolId = (await fx.school('EBI010D')).id;
    termId = (await fx.insertRow('payment_terms', {
      name: 'Two instalments (synthetic)', type: 'custom', interest_rate: 0, interest_calculation_method: 'none',
      invoice_strategy: 'multiple_invoices', number_of_terms: 2, term_length_days: 30, days_until_due: 30,
      grace_period_days: 0, late_fee_percentage: 0, late_fee_amount: 0, is_active: true, is_default: false, display_order: 0,
    })).id;
  }, 600_000);

  afterAll(async () => {
    if (t) await t.close();
    if (db) await db.drop();
  });

  describe('cancellation policy', () => {
    it('an issued, overdue instalment under a cancelled parent is counted nowhere', async () => {
      const before = await figures();
      const f = await family('CP');
      await makeHistoricCancelledParent(ds, f.parentId);
      await setDue(f.child1, new Date(Date.now() - 3 * DAY));
      await status(f.child1, 'Sent').expect(200); // the child is issued after the parent was cancelled
      const after = await figures();
      expect(after.kpiOverdue).toBe(before.kpiOverdue);
      expect(after.overdue).toBe(before.overdue);
      expect(after.outstanding).toBe(before.outstanding);
    });

    it('a cancelled instalment is not counted while its live sibling is', async () => {
      const before = await figures();
      const f = await family('CC');
      await setDue(f.child1, new Date(Date.now() - 3 * DAY));
      await setDue(f.child2, new Date(Date.now() - 3 * DAY));
      await status(f.child1, 'Sent').expect(200);
      await status(f.child2, 'Sent').expect(200);
      await status(f.child2, 'Cancelled').expect(200);
      const after = await figures();
      expect(after.kpiOverdue - before.kpiOverdue).toBe(3900);
      expect(after.overdue - before.overdue).toBe(3900);
      expect(after.outstanding - before.outstanding).toBe(3900);
    });

    it('a parent whose instalment holds money cannot be cancelled; the child itself cannot either', async () => {
      const f = await family('CM');
      await pay(f.child1, 1000, 'CM-1');
      const parent = await status(f.parentId, 'Cancelled').expect(409);
      expect(String(parent.body.message)).toMatch(/recorded payments/);
      expect(parent.body.code).toBe('INVOICE_HAS_RECORDED_PAYMENTS');
      const child = await status(f.child1, 'Cancelled').expect(409);
      expect(child.body.code).toBe('INVOICE_HAS_RECORDED_PAYMENTS');
      const [row] = await ds.query(`select status from invoices where id = $1`, [f.parentId]);
      expect(row.status).toBe('Partially-Paid');
    });
  });

  describe('overdue boundary on the Harare calendar day', () => {
    // Harare "today" starts at this UTC instant.
    const now = new Date();
    const h = new Date(now.getTime() + HARARE);
    const todayStartUtc = Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate()) - HARARE;
    const todayKey = businessDateKey(now);
    const instants = {
      A_todayMidnightHarare: new Date(todayStartUtc), // 00:00 today Harare = 22:00 UTC yesterday
      B_todayEarlyHarare: new Date(todayStartUtc + 90 * 60 * 1000), // 01:30 today Harare = 23:30 UTC yesterday
      C_yesterdayLateHarare: new Date(todayStartUtc - 60 * 1000), // 23:59 yesterday Harare
      D_todayAsUtcMidnight: new Date(todayStartUtc + HARARE), // a YYYY-MM-DD input stored as 00:00 UTC = 02:00 today Harare
      E_todayLateHarare: new Date(todayStartUtc + DAY - 60 * 1000), // 23:59 today Harare
      F_tomorrowMidnightHarare: new Date(todayStartUtc + DAY), // 00:00 tomorrow Harare
    };

    it('the helper reads every instant on the right Harare day', () => {
      expect(businessDateKey(instants.A_todayMidnightHarare)).toBe(todayKey);
      expect(businessDateKey(instants.B_todayEarlyHarare)).toBe(todayKey);
      expect(businessDateKey(instants.C_yesterdayLateHarare)).not.toBe(todayKey);
      expect(businessDateKey(instants.D_todayAsUtcMidnight)).toBe(todayKey);
      expect(businessDateKey(instants.E_todayLateHarare)).toBe(todayKey);
      expect(businessDateKey(instants.F_tomorrowMidnightHarare)).not.toBe(todayKey);
      expect(overdueBefore(now).getTime()).toBe(todayStartUtc);
      expect(isOverdueOn(instants.C_yesterdayLateHarare, now)).toBe(true);
      expect(isOverdueOn(instants.A_todayMidnightHarare, now)).toBe(false);
    });

    it('KPI and Collections Due agree: only the obligation due before today (Harare) is overdue; the four due today are "due today"', async () => {
      const before = await figures();
      await standaloneSent('A', 11, instants.A_todayMidnightHarare);
      await standaloneSent('B', 13, instants.B_todayEarlyHarare);
      await standaloneSent('C', 17, instants.C_yesterdayLateHarare);
      await standaloneSent('D', 19, instants.D_todayAsUtcMidnight);
      await standaloneSent('E', 23, instants.E_todayLateHarare);
      await standaloneSent('F', 29, instants.F_tomorrowMidnightHarare);
      const after = await figures();
      expect(after.kpiOverdue - before.kpiOverdue).toBe(17);
      expect(after.overdue - before.overdue).toBe(17);
      expect(after.kpiOverdue).toBe(after.overdue);
      expect(after.dueToday - before.dueToday).toBe(11 + 13 + 19 + 23);
      expect(after.dueIn7Days - before.dueIn7Days).toBe(29);
      const c = after.overdueList.find((i) => i.outstanding === 17)!;
      expect(c).toBeDefined();
      expect(c.daysOverdue).toBe(1);
      expect(c.dueDate).toBe(businessDateKey(instants.C_yesterdayLateHarare));
    });

    it('the pre-010C KPI rule would have called three of the "due today" invoices overdue', async () => {
      // `due_date < now()` is true for A, B and D whenever the clock is past 02:00 Harare; C is overdue under both rules.
      const [{ naive }] = await ds.query(
        `select coalesce(sum(total - amount_paid),0)::text as naive from invoices where status = 'Sent' and client_name in ('A','B','C','D','E','F') and due_date < now()`,
      );
      const nowHarare = new Date(Date.now() + HARARE);
      const pastTwoAm = nowHarare.getUTCHours() >= 2;
      expect(Number(naive)).toBe(pastTwoAm ? 11 + 13 + 17 + 19 : 11 + 13 + 17);
    });
  });
});
