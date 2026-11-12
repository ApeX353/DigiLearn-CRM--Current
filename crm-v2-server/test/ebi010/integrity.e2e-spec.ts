/**
 * 010D — financial reporting integrity: the collections export, the aging
 * report, the Executive KPI and Collections Due reconcile on one synthetic
 * book of obligations, under the cancellation rule, the grace-date deadline
 * and the Harare-day boundary.
 *
 * Before/after: the pre-010D export took every invoice with an unpaid balance
 * (parents, children, drafts and cancelled alike) and the aging report took
 * every unpaid instalment row whatever its invoice's status; both "naive"
 * figures are recomputed by SQL over the same rows so the report can show the
 * two numbers side by side.
 */
import request from 'supertest';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import { InvoicesModule } from '../../src/invoices/invoices.module';
import { PaymentsModule } from '../../src/payments/payments.module';
import { PaymentTermsModule } from '../../src/payment-terms/payment-terms.module';
import { QuotesModule } from '../../src/quotes/quotes.module';
import { ReportsModule } from '../../src/reports/reports.module';
import { ReportExportService } from '../../src/reports/report-export.service';
import { businessDateKey } from '../../src/invoices/invoice-obligations';
import { makeHistoricCancelledParent } from './support/historic-state';
import { agreedDates } from './support/agreed-dates';
import { agreedDates } from './support/agreed-dates';
import { DisposableDatabase } from '../campaign001/support/disposable-db';
import { Fixtures, FixtureUser } from '../campaign001/support/fixtures';
import { TestApp, createTestApp } from '../campaign001/support/test-app';

const H = 60 * 60 * 1000;
const DAY = 24 * H;
const HARARE = 2 * H;

describe('010D — collections export, aging report, KPI and Collections Due reconcile', () => {
  let db: DisposableDatabase;
  let t: TestApp;
  let fx: Fixtures;
  let ds: DataSource;
  let admin: FixtureUser;
  let token: string;
  let schoolId: string;
  let termId: string;
  let graceTermId: string;
  let exportSvc: ReportExportService;

  const api = (m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    request(t.http)[m](`/api/v2${path}`).set('Authorization', `Bearer ${token}`);
  const createdId = (body: any): string => body?.data?.master_invoice?.id ?? body?.data?.id;
  const line = (total: number) => ({ description: 'synthetic', quantity: 1, unit_price: total, discount: 0, tax_rate: 0 });
  const status = (id: string, s: string) => api('patch', `/invoices/${id}/status`).send({ status: s });
  const pay = (invoiceId: string, amount: number, ref: string) =>
    api('post', '/payments').send({ invoice_id: invoiceId, amount, payment_date: '2026-10-28', method: 'Cash', payment_method: 'Cash', reference: ref }).expect(201);
  /** Moves an invoice's due date AND its instalment row's dates together, keeping the plan's grace spacing. */
  const setDue = async (id: string, due: Date, grace: Date = due) => {
    await ds.query(`update invoices set due_date = $2, grace_due_date = $3 where id = $1`, [id, due, grace]);
    await ds.query(`update installments set due_date = $2::date, grace_due_date = $3::date where invoice_id = $1`, [id, businessDateKey(due), businessDateKey(grace)]);
  };
  const standalone = async (label: string, total: number, due: Date, s = 'Sent') => {
    const id = createdId((await api('post', '/invoices').send({ school_id: schoolId, client_name: label, items: [line(total)] }).expect(201)).body);
    await setDue(id, due);
    if (s !== 'Draft') await status(id, s).expect(200);
    return id;
  };
  const family = async (label: string, term = termId) => {
    const parentId = createdId((await api('post', '/invoices')
      .send({ school_id: schoolId, client_name: label, payment_term_id: term, installment_due_dates: agreedDates(2), items: [line(7800)] })
      .expect(201)).body);
    const kids: Array<{ id: string }> = await ds.query(`select id from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
    return { parentId, child1: kids[0].id, child2: kids[1].id };
  };

  // ---- the figures
  const kpi = async () => (await api('get', '/dashboard/kpis').expect(200)).body.data.overdueAmount as number;
  const collectionsDue = async () => (await api('get', '/dashboard/collections-due').expect(200)).body.data as {
    overdue: number; dueToday: number; dueIn7Days: number; dueIn30Days: number;
    overdueList: Array<{ id: string; dueDate: string; deadline: string; daysOverdue: number; outstanding: number }>;
  };
  const aging = async (asOf?: string) => {
    const res = await api('get', '/collections/aging-report').query(asOf ? { as_of_date: asOf } : {}).expect(200);
    const body = res.body.data ?? res.body;
    return body as {
      installments: Array<{ installment_id: string; invoice_id: string; days_overdue: number; aging_bucket: string; balance: number }>;
      draft_installments: Array<{ installment_id: string; invoice_id: string; days_overdue: number; balance: number }>;
      buckets: Array<{ bucket: string; count: number; total_balance: number }>;
      total_outstanding: number;
    };
  };
  const agingOverdue = (a: Awaited<ReturnType<typeof aging>>) => a.installments.filter((i) => i.days_overdue > 0).reduce((s, i) => s + i.balance, 0);
  const agingCurrent = (a: Awaited<ReturnType<typeof aging>>) => a.installments.filter((i) => i.days_overdue === 0).reduce((s, i) => s + i.balance, 0);
  const exportData = (asOf?: string) => exportSvc.buildCollectionsReportData(asOf);
  const exportOverdue = (d: Awaited<ReturnType<typeof exportData>>) => d.totals['1-30'] + d.totals['31-60'] + d.totals['61-90'] + d.totals['90+'];
  const xlsxTotals = async (asOf?: string): Promise<number[]> => {
    const res = await api('get', '/reports/export/collections')
      .query({ format: 'xlsx', ...(asOf ? { as_of_date: asOf } : {}) })
      .buffer(true)
      .parse((r: any, cb: any) => { const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); })
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Buffer);
    const sheet = wb.getWorksheet('Collections Aging')!;
    const values = sheet.getRow(5).values as Array<number | undefined>;
    return values.slice(1, 7).map((v) => Number(v ?? 0));
  };
  const naiveExport = async (): Promise<number> => {
    const [{ v }] = await ds.query(`select coalesce(sum(total - amount_paid), 0)::numeric::float8 as v from invoices where payment_status in ('Unpaid','Partial') and due_date is not null and total - amount_paid > 0`);
    return Number(v);
  };
  const naiveAging = async (): Promise<number> => {
    const [{ v }] = await ds.query(`select coalesce(sum(greatest(0, amount - paid_amount)), 0)::numeric::float8 as v from installments where status <> 'paid'`);
    return Number(v);
  };

  const now = new Date();
  const h = new Date(now.getTime() + HARARE);
  const todayStartUtc = Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate()) - HARARE;
  const at = (dayOffset: number, hours = 12) => new Date(todayStartUtc + dayOffset * DAY + hours * H);

  beforeAll(async () => {
    db = await DisposableDatabase.create();
    await db.runMigrations();
    t = await createTestApp(db, [PaymentTermsModule, InvoicesModule, QuotesModule, PaymentsModule, ReportsModule]);
    ds = t.dataSource;
    fx = new Fixtures(ds, t.jwt);
    exportSvc = t.app.get(ReportExportService);
    const found: Array<{ id: string }> = await ds.query(`select id from roles where name = 'admin'`);
    const adminRole = found.length
      ? { id: found[0].id, name: 'admin' }
      : { id: (await fx.insertRow('roles', { name: 'admin', description: 'ebi010', is_active: true, is_system_role: false })).id as string, name: 'admin' };
    await fx.insertRow('role_permissions', { role_id: adminRole.id, permission_id: await fx.permission('manage', 'all'), conditions: null, is_active: true });
    admin = await fx.user('admin', [adminRole]);
    token = (await fx.bearer(admin)).token;
    schoolId = (await fx.school('EBI010F')).id;
    const term = (grace: number, name: string) => fx.insertRow('payment_terms', {
      name, type: 'custom', interest_rate: 0, interest_calculation_method: 'none',
      invoice_strategy: 'multiple_invoices', number_of_terms: 2, term_length_days: 30, days_until_due: 30,
      grace_period_days: grace, late_fee_percentage: 0, late_fee_amount: 0, is_active: true, is_default: false, display_order: 0,
    });
    termId = (await term(0, 'Two instalments (synthetic)')).id;
    graceTermId = (await term(30, 'Two instalments, 30-day grace (synthetic)')).id;
  }, 600_000);

  afterAll(async () => {
    if (t) await t.close();
    if (db) await db.drop();
  });

  it('an empty book reports zero everywhere', async () => {
    expect(await kpi()).toBe(0);
    expect((await collectionsDue()).overdue).toBe(0);
    expect((await aging()).total_outstanding).toBe(0);
    expect((await exportData()).grandTotal).toBe(0);
  });

  describe('the seven cancellation / payment cases, one by one', () => {
    it('1. a cancelled standalone invoice is nowhere', async () => {
      const id = await standalone('S1 cancelled', 1000, at(-10));
      await status(id, 'Cancelled').expect(200);
      expect(await kpi()).toBe(0);
      expect((await collectionsDue()).overdue).toBe(0);
      expect((await aging()).installments.length).toBe(0);
      expect((await exportData()).grandTotal).toBe(0);
      expect(await naiveExport()).toBe(1000); // the old export carried it
    });

    it('2 + 4. a cancelled child instalment is excluded while its live sibling counts (active parent)', async () => {
      const f = await family('A');
      await setDue(f.child1, at(-5));
      await setDue(f.child2, at(-5));
      await status(f.child2, 'Sent').expect(200);
      await status(f.child1, 'Cancelled').expect(200);
      const [{ s }] = await ds.query(`select status as s from installments where invoice_id = $1`, [f.child1]);
      expect(s).toBe('pending'); // the instalment row keeps its own status: this is why the old aging report still showed it
      const a = await aging();
      expect(a.installments.map((i) => i.invoice_id)).toEqual([f.child2]);
      expect(agingOverdue(a)).toBe(3900);
      expect(exportOverdue(await exportData())).toBe(3900);
      expect(await kpi()).toBe(3900);
      expect((await collectionsDue()).overdue).toBe(3900);
    });

    it('3. a cancelled summary parent with Draft children is nowhere', async () => {
      const f = await family('B');
      await setDue(f.child1, at(-5));
      await setDue(f.child2, at(-5));
      await makeHistoricCancelledParent(ds, f.parentId);
      const a = await aging();
      expect(a.installments.some((i) => [f.child1, f.child2].includes(i.invoice_id))).toBe(false);
      expect(agingOverdue(a)).toBe(3900);
      expect(exportOverdue(await exportData())).toBe(3900);
      expect(await kpi()).toBe(3900);
    });

    it('5. a partially paid active instalment keeps its real balance; its sibling is owed because the family has started paying, and is current', async () => {
      const f = await family('C');
      await setDue(f.child1, at(-20));
      await setDue(f.child2, at(10));
      await status(f.child1, 'Sent').expect(200);
      await pay(f.child1, 1500, 'C-1');
      const a = await aging();
      const c1 = a.installments.find((i) => i.invoice_id === f.child1)!;
      expect(c1).toMatchObject({ balance: 2400, days_overdue: 20, aging_bucket: '1-30' });
      expect(a.installments.find((i) => i.invoice_id === f.child2)).toMatchObject({ balance: 3900, days_overdue: 0, aging_bucket: 'current' });
      expect(agingOverdue(a)).toBe(3900 + 2400);
      const e = await exportData();
      expect(exportOverdue(e)).toBe(3900 + 2400);
      expect(e.totals.current).toBe(3900);
      expect(await kpi()).toBe(3900 + 2400);
      const cd = await collectionsDue();
      expect(cd.overdue).toBe(3900 + 2400);
      expect(cd.dueIn30Days).toBe(3900); // the family has started paying, so instalment 2 is an issued obligation due in 10 days
      const [alloc] = await ds.query(`select count(*)::int as n, sum(allocated_amount)::float8 as amt from payment_allocations`);
      expect(alloc).toEqual({ n: 1, amt: 1500 }); // one allocation, to instalment 1 only
    });

    it('6. a fully paid instalment is excluded; its unpaid sibling is 31-60 days overdue', async () => {
      const f = await family('D');
      await setDue(f.child1, at(-40));
      await setDue(f.child2, at(-40));
      await status(f.child1, 'Sent').expect(200);
      await status(f.child2, 'Sent').expect(200);
      await pay(f.child1, 3900, 'D-1');
      const a = await aging();
      expect(a.installments.find((i) => i.invoice_id === f.child1)).toBeUndefined();
      expect(a.installments.find((i) => i.invoice_id === f.child2)).toMatchObject({ balance: 3900, days_overdue: 40, aging_bucket: '31-60' });
      expect(agingOverdue(a)).toBe(3900 + 2400 + 3900);
      expect(exportOverdue(await exportData())).toBe(3900 + 2400 + 3900);
      expect(await kpi()).toBe(3900 + 2400 + 3900);
    });

    it('7. an active overdue instalment under a Draft parent is counted; its Draft sibling is listed apart and counted nowhere', async () => {
      const f = await family('E');
      await setDue(f.child1, at(-70));
      await setDue(f.child2, at(-70));
      await status(f.child1, 'Sent').expect(200);
      const [{ ps }] = await ds.query(`select status as ps from invoices where id = $1`, [f.parentId]);
      expect(ps).toBe('Draft');
      const a = await aging();
      expect(a.installments.find((i) => i.invoice_id === f.child1)).toMatchObject({ balance: 3900, days_overdue: 70, aging_bucket: '61-90' });
      expect(a.installments.find((i) => i.invoice_id === f.child2)).toBeUndefined();
      expect(a.draft_installments.find((i) => i.invoice_id === f.child2)).toMatchObject({ balance: 3900, days_overdue: 70 });
      // Before RELEASE-EBI-AUDIT-003 aging and the export were 3,900 higher than the KPI here.
      expect(agingOverdue(a)).toBe(3900 + 2400 + 3900 + 3900);
      expect(exportOverdue(await exportData())).toBe(3900 + 2400 + 3900 + 3900);
      expect(await kpi()).toBe(3900 + 2400 + 3900 + 3900); // the Draft sibling is not issued
      expect((await collectionsDue()).overdue).toBe(3900 + 2400 + 3900 + 3900);
    });
  });

  describe('standalone invoices, quotes and the grace date', () => {
    it('a standalone issued invoice is in the KPI, Collections Due and the export, but the aging page only lists instalment plans', async () => {
      await standalone('S8 old', 500, at(-100));
      await standalone('S9 today', 700, at(0, 0));
      expect(await kpi()).toBe(14100 + 500);
      const cd = await collectionsDue();
      expect(cd.overdue).toBe(14100 + 500);
      expect(cd.dueToday).toBe(700);
      const e = await exportData();
      expect(e.totals['90+']).toBe(500);
      expect(e.totals.current).toBe(3900 + 700);
      expect(agingOverdue(await aging())).toBe(14100); // no instalment rows for standalone invoices
    });

    it('a plan applied at quote stage creates no instalment rows in this lineage; rows without an invoice would be excluded anyway', async () => {
      const q = await api('post', '/quotes').send({ school_id: schoolId, client_name: 'Q1', payment_term_id: termId, installment_due_dates: agreedDates(2), items: [line(1000)] }).expect(201);
      const quoteId = q.body.data?.id ?? q.body.data?.master_quote?.id;
      const rows: Array<{ invoice_id: string | null }> = await ds.query(
        `select inst.invoice_id from installments inst join applied_payment_terms apt on apt.id = inst.applied_payment_term_id where apt.document_id = $1`,
        [quoteId],
      );
      // Observed: the quote path records the plan but creates its instalment rows only
      // when the quote becomes an invoice (010D), so there is nothing here to exclude.
      expect(rows.length).toBe(0);
      expect((await aging()).installments.some((i) => !i.invoice_id)).toBe(false);
      expect(await naiveAging()).toBe(33600); // A 7,800 + B 7,800 + C 6,300 + D 3,900 + E 7,800 — every unpaid row, cancelled families included (family F is created in the next test)
    });

    it('a 30-day grace plan: due 10 days ago, grace 20 days ahead → current everywhere; overdue everywhere once the grace day has ended', async () => {
      const f = await family('F', graceTermId);
      const [{ g }] = await ds.query(`select (grace_due_date - due_date) as g from installments where invoice_id = $1`, [f.child1]);
      expect(g).toBe(30); // the plan's grace is stored on the instalment and the child invoice
      await setDue(f.child1, at(-10), at(20));
      await setDue(f.child2, at(50), at(80));
      await status(f.child1, 'Sent').expect(200);
      expect(await kpi()).toBe(14600);
      const cd = await collectionsDue();
      expect(cd.overdue).toBe(14600);
      expect(cd.dueIn30Days).toBe(3900 + 3900);
      const row = cd.overdueList.find((i) => i.id === f.child1);
      expect(row).toBeUndefined();
      const a = await aging();
      expect(a.installments.find((i) => i.invoice_id === f.child1)).toMatchObject({ days_overdue: 0, aging_bucket: 'current' });
      const e = await exportData();
      expect(e.totals.current).toBe(3900 + 700 + 3900); // F's second instalment is a Draft under a Draft parent
      const item = e.buckets.current.find((i: any) => i.invoiceId === f.child1)!;
      expect(item.dueDateKey).toBe(businessDateKey(at(-10)));
      expect(item.deadline).toBe(businessDateKey(at(20)));
      // as-of after the grace day: overdue by whole days from the grace date, not the due date
      const a2 = await aging(businessDateKey(at(23)));
      expect(a2.installments.find((i) => i.invoice_id === f.child1)).toMatchObject({ days_overdue: 3, aging_bucket: '1-30' });
      const e2 = await exportData(businessDateKey(at(23)));
      expect(e2.buckets['1-30'].find((i: any) => i.invoiceId === f.child1)).toMatchObject({ daysOverdue: 3 });
    });
  });

  describe('reconciliation', () => {
    it('KPI = Collections Due = export overdue; aging differs only by the standalone invoices it does not list', async () => {
      const k = await kpi();
      const cd = await collectionsDue();
      const a = await aging();
      const e = await exportData();
      expect(k).toBe(cd.overdue);
      expect(k).toBe(14600);
      // The KPI and export no longer differ by the Draft sibling (E child2, 3,900).
      // aging overdue = export overdue − standalone S8 (500)
      expect(exportOverdue(e)).toBe(k);
      expect(agingOverdue(a)).toBe(exportOverdue(e) - 500);
      // current side: export = aging + standalone due today (700)
      expect(e.totals.current).toBe(agingCurrent(a) + 700);
      expect(e.grandTotal).toBe(a.total_outstanding + 500 + 700);
      expect(e.grandTotal).toBe(23100); // 30,900 before E and F's Draft instalments left it
      // Collections Due list rows carry both dates
      for (const row of cd.overdueList) {
        expect(row.deadline).toBeDefined();
        expect(row.deadline >= row.dueDate).toBe(true);
      }
    });

    it('the Excel export carries the same totals as the data the PDF is drawn from', async () => {
      const e = await exportData();
      const xl = await xlsxTotals();
      expect(xl).toEqual([e.totals.current, e.totals['1-30'], e.totals['31-60'], e.totals['61-90'], e.totals['90+'], e.grandTotal]);
      const pdf = await exportSvc.generateCollectionsReport('pdf');
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect(pdf.length).toBeGreaterThan(1000);
    });

    it('before / after: the old export and aging figures over the same rows', async () => {
      const e = await exportData();
      const a = await aging();
      const oldExport = await naiveExport();
      const oldAging = await naiveAging();
      console.log(`[010D] export grand total old ${oldExport} → new ${e.grandTotal}; aging outstanding old ${oldAging} → new ${a.total_outstanding}`);
      expect(oldExport).toBeGreaterThan(e.grandTotal);
      expect(oldAging).toBeGreaterThan(a.total_outstanding);
      expect(e.grandTotal).toBe(23100);
      const drafts = a.draft_installments.reduce((sum, row) => sum + row.balance, 0);
      expect(drafts).toBe(7800); // E child2 3,900 + F child2 3,900: moved out, not lost
      expect(e.grandTotal + drafts).toBe(30900);
      // A child2 3,900 + C 2,400 + 3,900 + D child2 3,900 + E 3,900 + F 3,900; before: E 7,800 + F 7,800 (a hand recount: a first draft of this line summed 33,600 by adding the standalone invoices the aging page never lists)
      expect(a.total_outstanding).toBe(21900); // 29,700 less those two Draft instalments
    });
  });
});
