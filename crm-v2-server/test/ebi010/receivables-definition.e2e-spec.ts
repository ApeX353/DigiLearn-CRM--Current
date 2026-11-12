/**
 * RELEASE-EBI-AUDIT-003 — what counts as money owed.
 *
 * One population of disposable invoices in every state, then every figure that reads
 * receivables is checked against totals worked out by hand. A Draft has not been issued,
 * so it is shown beside the receivable and never inside it.
 *
 *   Owed (issued)                     C child1 3,900 + D 2,000 + E 2,000 + I 6,300 + K 100 = 14,300
 *   Not issued                        A 1,000 + B 7,800 + C child2 3,900 + J child2 3,900 = 16,600
 *   Neither: status Paid, nothing paid                                        J child1 3,900
 *   The figure before this change                                                     34,800
 *   Overdue (Harare day ended)        C child1 3,900 + D 2,000 + E 2,000 + I child1 2,400 = 10,300
 */
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { BUSINESS_UTC_OFFSET_MS } from '../../src/common/utils/business-day';
import { InvoicesModule } from '../../src/invoices/invoices.module';
import { PaymentsModule } from '../../src/payments/payments.module';
import { PaymentTermsModule } from '../../src/payment-terms/payment-terms.module';
import { QuotesModule } from '../../src/quotes/quotes.module';
import { ReportExportService } from '../../src/reports/report-export.service';
import { ReportsModule } from '../../src/reports/reports.module';
import { SchoolsModule } from '../../src/schools/schools.module';
import { agreedDates } from './support/agreed-dates';
import { makeHistoricCancelledParent } from './support/historic-state';
import { DisposableDatabase } from '../campaign001/support/disposable-db';
import { Fixtures, FixtureUser } from '../campaign001/support/fixtures';
import { TestApp, createTestApp } from '../campaign001/support/test-app';

const DAY = 24 * 60 * 60 * 1000;
const H = 60 * 60 * 1000;

describe('RELEASE-EBI-AUDIT-003 — a Draft is not money owed', () => {
  let db: DisposableDatabase;
  let t: TestApp;
  let fx: Fixtures;
  let ds: DataSource;
  let admin: FixtureUser;
  let token: string;
  let repToken: string;
  let schoolId: string;
  let termId: string;
  const ids: Record<string, string> = {};

  const api = (m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    request(t.http)[m](`/api/v2${path}`).set('Authorization', `Bearer ${token}`);
  const createdId = (body: any): string => body?.data?.master_invoice?.id ?? body?.data?.id;
  const line = (total: number) => ({ description: 'synthetic', quantity: 1, unit_price: total, discount: 0, tax_rate: 0 });
  const status = (id: string, s: string) => api('patch', `/invoices/${id}/status`).send({ status: s }).expect(200);
  const pay = (invoiceId: string, amount: number) =>
    api('post', '/payments').send({ invoice_id: invoiceId, amount, payment_date: '2026-10-28', method: 'Cash', payment_method: 'Cash', reference: `R-${randomUUID().slice(0, 8)}` }).expect(201);
  const setDue = (id: string, when: Date) =>
    ds.query(`update invoices set due_date = $2, grace_due_date = $2 where id = $1`, [id, when]);

  const h = new Date(Date.now() + BUSINESS_UTC_OFFSET_MS);
  const todayStartUtc = Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate()) - BUSINESS_UTC_OFFSET_MS;
  const at = (dayOffset: number, hours = 12) => new Date(todayStartUtc + dayOffset * DAY + hours * H);

  const family = async (school: string, dueChild1 = at(-1), dueChild2 = at(-1)) => {
    const parentId = createdId((await api('post', '/invoices')
      .send({ school_id: school, client_name: 'RECV', payment_term_id: termId, installment_due_dates: agreedDates(2), items: [line(7800)] })
      .expect(201)).body);
    const kids: Array<{ id: string }> = await ds.query(`select id from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
    await setDue(kids[0].id, dueChild1);
    await setDue(kids[1].id, dueChild2);
    await setDue(parentId, dueChild1);
    return { parentId, child1: kids[0].id, child2: kids[1].id };
  };
  const plain = async (school: string, total: number, due = at(-1)) => {
    const id = createdId((await api('post', '/invoices').send({ school_id: school, client_name: 'RECV', items: [line(total)] }).expect(201)).body);
    await setDue(id, due);
    return id;
  };

  const sales = async (who = token) => {
    const res = await request(t.http).get('/api/v2/reports/sales-performance').set('Authorization', `Bearer ${who}`).query({ period: 'year' }).expect(200);
    return (res.body.data ?? res.body) as {
      outstanding: number;
      draftNotIssued: number;
      familiesToReview: { count: number; value: number };
    };
  };
  const finance = async () => {
    const res = await api('get', '/reports/finance').expect(200);
    return (res.body.data ?? res.body) as {
      outstandingInvoices: Array<{ id: string; amountDue: number }>;
      upcomingInstallments: Array<{ amount: number }>;
    };
  };
  const aging = async () => {
    const res = await api('get', '/collections/aging-report').expect(200);
    return (res.body.data ?? res.body) as {
      installments: Array<{ invoice_id: string; balance: number }>;
      draft_installments: Array<{ invoice_id: string; balance: number }>;
      buckets: Array<{ total_balance: number }>;
      customers: Array<{ total_balance: number }>;
      total_outstanding: number;
    };
  };
  const statsOverdue = async () => (await api('get', '/invoices/stats').expect(200)).body.data.yearly as Record<string, number>;
  const listOverdue = async (include_children = false) =>
    new Set(((await api('get', '/invoices').query({ overdue: true, include_children, limit: 100 }).expect(200)).body.data as Array<{ id: string }>).map((i) => i.id));
  const sum = (rows: Array<{ balance: number }>) => rows.reduce((total, row) => total + row.balance, 0);

  beforeAll(async () => {
    db = await DisposableDatabase.create();
    await db.runMigrations();
    t = await createTestApp(db, [PaymentTermsModule, InvoicesModule, QuotesModule, PaymentsModule, ReportsModule, SchoolsModule]);
    ds = t.dataSource;
    fx = new Fixtures(ds, t.jwt);
    const role = async (name: string) => {
      const found: Array<{ id: string }> = await ds.query(`select id from roles where name = $1`, [name]);
      return found.length
        ? { id: found[0].id, name }
        : { id: (await fx.insertRow('roles', { name, description: 'recv', is_active: true, is_system_role: false })).id as string, name };
    };
    const adminRole = await role('admin');
    await fx.insertRow('role_permissions', { role_id: adminRole.id, permission_id: await fx.permission('manage', 'all'), conditions: null, is_active: true });
    admin = await fx.user('admin', [adminRole]);
    token = (await fx.bearer(admin)).token;
    const repRole = await role('sales_rep');
    await fx.insertRow('role_permissions', { role_id: repRole.id, permission_id: await fx.permission('read', 'Report'), conditions: null, is_active: true });
    repToken = (await fx.bearer(await fx.user('rep', [repRole]))).token;
    schoolId = (await fx.school('RECV')).id;
    termId = (await fx.insertRow('payment_terms', {
      name: 'Two instalments (synthetic)', type: 'custom', interest_rate: 0, interest_calculation_method: 'none',
      invoice_strategy: 'multiple_invoices', number_of_terms: 2, term_length_days: 30, days_until_due: 30,
      grace_period_days: 0, late_fee_percentage: 0, late_fee_amount: 0, is_active: true, is_default: false, display_order: 0,
    })).id;

    ids.A = await plain(schoolId, 1000); // Draft, past due
    const b = await family(schoolId); // Draft family, past due
    ids.Bparent = b.parentId; ids.Bchild1 = b.child1; ids.Bchild2 = b.child2;
    const c = await family(schoolId, at(-1), at(40)); // Draft parent, first instalment sent
    ids.Cparent = c.parentId; ids.Cchild1 = c.child1; ids.Cchild2 = c.child2;
    await status(c.child1, 'Sent');
    ids.D = await plain(schoolId, 2000);
    await status(ids.D, 'Sent');
    ids.E = await plain(schoolId, 3000);
    await pay(ids.E, 1000); // Partially-Paid, 2,000 left
    ids.F = await plain(schoolId, 500);
    await pay(ids.F, 500); // Paid
    ids.G = await plain(schoolId, 900);
    await status(ids.G, 'Cancelled');
    const hFamily = await family(schoolId); // cancelled parent, Draft instalments
    ids.Hparent = hFamily.parentId; ids.Hchild1 = hFamily.child1;
    await makeHistoricCancelledParent(ds, hFamily.parentId);
    const i = await family(schoolId, at(-1), at(5)); // has started paying: both instalments owed
    ids.Iparent = i.parentId; ids.Ichild1 = i.child1; ids.Ichild2 = i.child2;
    await status(i.child1, 'Sent');
    await pay(i.child1, 1500);
    const j = await family(schoolId); // INV-2026-0070's shape: Paid, Unpaid, no money, Draft parent
    ids.Jparent = j.parentId; ids.Jchild1 = j.child1; ids.Jchild2 = j.child2;
    await ds.query(`update invoices set status = 'Paid', payment_status = 'Unpaid', amount_paid = 0 where id = $1`, [j.child1]);
    ids.K = await plain(schoolId, 100, at(0, 12)); // sent and due today: owed, not overdue
    await status(ids.K, 'Sent');
  }, 600_000);

  afterAll(async () => {
    if (t) await t.close();
    if (db) await db.drop();
  });

  describe('before and after, over the same rows', () => {
    it('the old figure splits exactly into owed, not issued and the Paid anomaly', async () => {
      const [{ old }] = await ds.query(`
        select coalesce(sum(greatest(i.total - i.amount_paid, 0)), 0)::float8 as old
          from invoices i left join invoices p on p.id = i.parent_invoice_id
         where not i.is_summary_invoice and i.status <> 'Cancelled' and (p.id is null or p.status <> 'Cancelled')`);
      const { outstanding, draftNotIssued } = await sales();
      expect(old).toBe(34800);
      expect(outstanding).toBe(14300);
      expect(draftNotIssued).toBe(16600);
      expect(outstanding + draftNotIssued + 3900).toBe(old);
    });
  });

  describe('every receivable figure agrees', () => {
    it('Sales Performance, the collections export and the Finance list are the same 14,300', async () => {
      expect((await sales()).outstanding).toBe(14300);
      const exported = await t.app.get(ReportExportService).buildCollectionsReportData();
      expect(exported.grandTotal).toBe(14300);
      const listed = (await finance()).outstandingInvoices;
      expect(listed.reduce((total, row) => total + row.amountDue, 0)).toBe(14300);
    });

    it('the Finance list has one row per obligation: no Draft, no parent, nothing cancelled', async () => {
      const listed = (await finance()).outstandingInvoices.map((row) => row.id).sort();
      expect(listed).toEqual([ids.Cchild1, ids.D, ids.E, ids.Ichild1, ids.Ichild2, ids.K].sort());
    });

    it('the KPI, Collections Due and the export agree on 10,300 overdue', async () => {
      const kpi = (await api('get', '/dashboard/kpis').expect(200)).body.data.overdueAmount;
      const due = (await api('get', '/dashboard/collections-due').expect(200)).body.data;
      const { totals } = await t.app.get(ReportExportService).buildCollectionsReportData();
      expect(kpi).toBe(10300);
      expect(due.overdue).toBe(10300);
      expect(totals['1-30'] + totals['31-60'] + totals['61-90'] + totals['90+']).toBe(10300);
    });

    it('aging counts issued schedules, and lists Draft instalments outside every total', async () => {
      const report = await aging();
      expect(report.installments.map((row) => row.invoice_id).sort()).toEqual([ids.Cchild1, ids.Ichild1, ids.Ichild2].sort());
      expect(report.total_outstanding).toBe(3900 + 2400 + 3900);
      expect(report.buckets.reduce((total, b) => total + b.total_balance, 0)).toBe(10200);
      expect(report.customers.reduce((total, c) => total + c.total_balance, 0)).toBe(10200);
      expect(report.draft_installments.map((row) => row.invoice_id).sort()).toEqual([ids.Bchild1, ids.Bchild2, ids.Cchild2, ids.Jchild2].sort());
      expect(sum(report.draft_installments)).toBe(15600);
    });

    it('a family is never counted twice: the parents appear in no receivable', async () => {
      const report = await aging();
      const rows = [...report.installments, ...report.draft_installments].map((row) => row.invoice_id);
      for (const parent of [ids.Bparent, ids.Cparent, ids.Iparent, ids.Jparent]) expect(rows).not.toContain(parent);
      const listed = (await finance()).outstandingInvoices.map((row) => row.id);
      for (const parent of [ids.Bparent, ids.Cparent, ids.Iparent, ids.Jparent]) expect(listed).not.toContain(parent);
    });

    it('nothing cancelled counts, Draft or not', async () => {
      const report = await aging();
      const rows = [...report.installments, ...report.draft_installments].map((row) => row.invoice_id);
      expect(rows).not.toContain(ids.G);
      expect(rows).not.toContain(ids.Hchild1);
      expect((await listOverdue(true)).has(ids.Hparent)).toBe(false);
      expect((await finance()).outstandingInvoices.map((row) => row.id)).not.toContain(ids.G);
    });

    it('Paid owes nothing, and a Paid row with no money behind it is in neither figure', async () => {
      const report = await aging();
      const rows = [...report.installments, ...report.draft_installments].map((row) => row.invoice_id);
      expect(rows).not.toContain(ids.F);
      expect(rows).not.toContain(ids.Jchild1);
      expect((await finance()).outstandingInvoices.map((row) => row.id)).not.toContain(ids.Jchild1);
      const [row] = await ds.query(`select status, payment_status, amount_paid::float8 as paid from invoices where id = $1`, [ids.Jchild1]);
      expect(row).toEqual({ status: 'Paid', payment_status: 'Unpaid', paid: 0 });
    });
  });

  describe('document-level overdue', () => {
    it('a Draft is not overdue; a Draft parent is once an instalment under it has been sent', async () => {
      const top = await listOverdue();
      expect([...top].sort()).toEqual([ids.Cparent, ids.D, ids.E, ids.Iparent].sort());
      const all = await listOverdue(true);
      expect([...all].sort()).toEqual([ids.Cparent, ids.Cchild1, ids.D, ids.E, ids.Iparent, ids.Ichild1].sort());
    });

    it('the stats count those four and keep Drafts in their own figure', async () => {
      const stats = await statsOverdue();
      expect(stats.overdue).toBe(4);
      expect(stats.overdueValue).toBe(7800 + 2000 + 2000 + 6300);
      expect(stats.draft).toBe(4);
      expect(stats.draftValue).toBe(1000 + 7800 + 7800 + 7800);
    });

    it('the Harare rule is unchanged: due today is not overdue, even when issued', async () => {
      expect((await listOverdue()).has(ids.K)).toBe(false);
      await setDue(ids.K, at(-1, 21.99));
      expect((await listOverdue()).has(ids.K)).toBe(true);
      await setDue(ids.K, at(0, 0));
      expect((await listOverdue()).has(ids.K)).toBe(false);
    });

    it('a Draft moves into the figures the moment it is issued, and not before', async () => {
      const id = await plain(schoolId, 250);
      const before = await sales();
      expect((await listOverdue()).has(id)).toBe(false);
      await status(id, 'Sent');
      const after = await sales();
      expect(after.outstanding - before.outstanding).toBe(250);
      expect(after.draftNotIssued - before.draftNotIssued).toBe(-250);
      expect((await listOverdue()).has(id)).toBe(true);
      await status(id, 'Cancelled');
      expect((await sales()).outstanding).toBe(before.outstanding);
    });
  });

  describe('access and writes', () => {
    it('a rep sees only their own figures, Draft value included', async () => {
      expect(await sales(repToken)).toEqual(expect.objectContaining({ outstanding: 0, draftNotIssued: 0 }));
    });

    it('reading every report changes no invoice, payment or instalment', async () => {
      const fingerprint = async () => (await ds.query(`select md5(
        coalesce((select string_agg(id::text||status||total||amount_paid||payment_status||updated_at::text, ',' order by id) from invoices),'') ||
        coalesce((select string_agg(id::text||amount, ',' order by id) from payments),'') ||
        coalesce((select string_agg(id::text||status||amount||paid_amount, ',' order by id) from installments),'')) f`))[0].f;
      const before = await fingerprint();
      await sales();
      await finance();
      await aging();
      await statsOverdue();
      await listOverdue(true);
      await api('get', '/dashboard/kpis').expect(200);
      await t.app.get(ReportExportService).buildCollectionsReportData();
      expect(await fingerprint()).toBe(before);
    });
  });

  describe('an EBI-shaped school', () => {
    it('owes 3,900 on the partly paid invoice; its Draft family is shown apart and its cancelled records count nowhere', async () => {
      const school = (await fx.school('RECV EBI')).id;
      const before = await sales();
      const main = await plain(school, 7800, at(180));
      await pay(main, 3900);
      const later = await family(school, at(25), at(55));
      await status(later.child1, 'Cancelled');
      const earlier = await family(school, at(2), at(32));
      await status(earlier.child2, 'Cancelled');
      await makeHistoricCancelledParent(ds, earlier.parentId);
      await status(await plain(school, 7800), 'Cancelled');

      const after = await sales();
      expect(after.outstanding - before.outstanding).toBe(3900);
      expect(after.draftNotIssued - before.draftNotIssued).toBe(3900);
      const stats = (await api('get', `/schools/${school}/stats`).expect(200)).body.data;
      expect(stats.outstandingInvoices).toEqual({ count: 1, totalValue: 3900 });
      const report = await aging();
      expect(report.draft_installments.map((row) => row.invoice_id)).toContain(later.child2);
      expect(report.draft_installments.map((row) => row.invoice_id)).not.toContain(earlier.child1);
      const [row] = await ds.query(`select status, total::float8 as total, amount_paid::float8 as paid from invoices where id = $1`, [main]);
      expect(row).toEqual({ status: 'Partially-Paid', total: 7800, paid: 3900 });
    });
  });

  // Last: it moves instalment dates, which nothing above depends on.
  describe('Finance upcoming instalments', () => {
    it('lists issued obligations only', async () => {
      await ds.query(`update installments set due_date = $1, grace_due_date = $1`, [at(10)]);
      const upcoming = (await finance()).upcomingInstallments;
      expect(upcoming).toHaveLength(3);
      expect(upcoming.reduce((total, row) => total + row.amount, 0)).toBe(11700);
    });
  });

  // The Technical Lead's clarification: a Draft instalment of an issued sale is still
  // part of the debt. Each case reads the change it makes, so they stay independent.
  describe('each kind of family', () => {
    const snapshot = async () => {
      const report = await aging();
      return {
        ...(await sales()),
        kpi: (await api('get', '/dashboard/kpis').expect(200)).body.data.overdueAmount as number,
        aging: report.total_outstanding,
        agingDrafts: sum(report.draft_installments),
      };
    };
    type Snapshot = Awaited<ReturnType<typeof snapshot>>;
    const moved = (before: Snapshot, after: Snapshot) => ({
      outstanding: after.outstanding - before.outstanding,
      draft: after.draftNotIssued - before.draftNotIssued,
      overdue: after.kpi - before.kpi,
    });
    const statusOf = async (id: string) =>
      (await ds.query(`select status from invoices where id = $1`, [id]))[0].status as string;

    it('standalone Draft: not issued, not owed, not overdue', async () => {
      const before = await snapshot();
      await plain(schoolId, 1000);
      expect(moved(before, await snapshot())).toEqual({ outstanding: 0, draft: 1000, overdue: 0 });
    });

    it('entirely Draft family: 7,800 not issued, once, and nothing owed', async () => {
      const before = await snapshot();
      await family(schoolId);
      expect(moved(before, await snapshot())).toEqual({ outstanding: 0, draft: 7800, overdue: 0 });
    });

    it('issued parent with Draft children: the 7,800 is owed once, overdue only as each falls due, and the children stay Draft', async () => {
      const f = await family(schoolId, at(-1), at(40));
      const before = await snapshot();
      await status(f.parentId, 'Sent');
      const after = await snapshot();
      expect(moved(before, after)).toEqual({ outstanding: 7800, draft: -7800, overdue: 3900 });
      expect(after.aging - before.aging).toBe(7800);
      expect(after.agingDrafts - before.agingDrafts).toBe(-7800);
      expect(await statusOf(f.child1)).toBe('Draft');
      expect(await statusOf(f.child2)).toBe('Draft');
    });

    it('partly paid parent with a Draft child: the remaining 6,300 is owed once, and the payment stays where it was allocated', async () => {
      const f = await family(schoolId, at(-1), at(40));
      await status(f.child1, 'Sent');
      const before = await snapshot();
      await pay(f.child1, 1500);
      const after = await snapshot();
      expect(await statusOf(f.parentId)).toBe('Partially-Paid');
      expect(await statusOf(f.child2)).toBe('Draft');
      // Before: 3,900 owed and 3,900 not issued. After: 2,400 + 3,900, and only the first overdue.
      expect(moved(before, after)).toEqual({ outstanding: 2400, draft: -3900, overdue: -1500 });
      const [{ allocated }] = await ds.query(
        `select coalesce(sum(a.allocated_amount), 0)::float8 allocated from payment_allocations a
           join payments p on p.id = a.payment_id where p.invoice_id = $1`,
        [f.child1],
      );
      expect(allocated).toBe(1500);
    });

    it('fully paid parent: nothing owed and nothing pending', async () => {
      const f = await family(schoolId, at(-1), at(40));
      await status(f.child1, 'Sent');
      await status(f.child2, 'Sent');
      const before = await snapshot();
      await pay(f.child1, 3900);
      await pay(f.child2, 3900);
      const after = await snapshot();
      expect(await statusOf(f.parentId)).toBe('Paid');
      expect(moved(before, after)).toEqual({ outstanding: -7800, draft: 0, overdue: -3900 });
    });

    it('a paid instalment with a stale schedule row is not shown as owed under a part-paid parent', async () => {
      const f = await family(schoolId, at(-1), at(40));
      await status(f.child1, 'Sent');
      await pay(f.child1, 3900);
      expect(await statusOf(f.child1)).toBe('Paid');
      expect(await statusOf(f.parentId)).toBe('Partially-Paid');
      await ds.query(`update installments set status = 'pending', paid_amount = 0 where invoice_id = $1`, [f.child1]);
      const report = await aging();
      expect(report.installments.map((row) => row.invoice_id)).not.toContain(f.child1);
      expect(report.draft_installments.map((row) => row.invoice_id)).not.toContain(f.child1);
      expect(report.installments.map((row) => row.invoice_id)).toContain(f.child2);
    });

    it('a Draft instalment left under a Paid parent is in neither figure', async () => {
      const f = await family(schoolId, at(-1), at(40));
      const before = await snapshot();
      await ds.query(`update invoices set status = 'Paid', payment_status = 'Paid', amount_paid = total where id = $1`, [f.parentId]);
      const after = await snapshot();
      expect(moved(before, after)).toEqual({ outstanding: 0, draft: -7800, overdue: 0 });
      expect(await statusOf(f.child2)).toBe('Draft');
    });

    it('cancelled parent with active children: in no figure, flagged for review, and left as it is', async () => {
      const f = await family(schoolId);
      const before = await snapshot();
      await makeHistoricCancelledParent(ds, f.parentId);
      const after = await snapshot();
      expect(moved(before, after)).toEqual({ outstanding: 0, draft: -7800, overdue: 0 });
      expect(after.familiesToReview.count - before.familiesToReview.count).toBe(2);
      expect(after.familiesToReview.value - before.familiesToReview.value).toBe(7800);
      expect(await statusOf(f.child1)).toBe('Draft');
      expect(await statusOf(f.child2)).toBe('Draft');
    });

    it('a part-paid instalment under a cancelled parent keeps its balance on the review figure', async () => {
      const f = await family(schoolId);
      await status(f.child1, 'Sent');
      await pay(f.child1, 1000);
      const before = await snapshot();
      await makeHistoricCancelledParent(ds, f.parentId);
      const after = await snapshot();
      expect(after.outstanding - before.outstanding).toBe(-(2900 + 3900));
      expect(after.familiesToReview.value - before.familiesToReview.value).toBe(2900 + 3900);
    });

    it('double counting: the parent balance always equals the children, and only the children are summed', async () => {
      const f = await family(schoolId, at(-1), at(40));
      await status(f.child1, 'Sent');
      await pay(f.child1, 1500);
      const before = (await finance()).outstandingInvoices;
      const [{ parent, children }] = await ds.query(
        `select (select (total - amount_paid)::float8 from invoices where id = $1) parent,
                (select sum(total - amount_paid)::float8 from invoices where parent_invoice_id = $1) children`,
        [f.parentId],
      );
      expect(parent).toBe(6300);
      expect(children).toBe(6300);
      const rows = before.filter((row) => [f.parentId, f.child1, f.child2].includes(row.id));
      expect(rows.map((row) => row.id).sort()).toEqual([f.child1, f.child2].sort());
      expect(rows.reduce((total, row) => total + row.amountDue, 0)).toBe(6300);
    });
  });
});
