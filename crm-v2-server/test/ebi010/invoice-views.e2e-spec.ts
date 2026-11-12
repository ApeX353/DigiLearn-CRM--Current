/**
 * EBI-FOCUS-002 — invoice views and cancellation accountability.
 *
 * The lists divide documents into Active/Open and Cancelled without changing any of
 * them, and what they show must agree with the Audit Trail about the same record.
 * Real routes through the real exception filter; synthetic data on a disposable
 * database. The one row-level write is the labelled historic fixture.
 */
import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ActivityLogsModule } from '../../src/activity-logs/activity-logs.module';
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

describe('EBI-FOCUS-002 — invoice views and cancellation accountability', () => {
  let db: DisposableDatabase;
  let t: TestApp;
  let fx: Fixtures;
  let ds: DataSource;
  let manager: FixtureUser;
  let rep: FixtureUser;
  const tokens: Record<string, string> = {};
  let termId: string;
  let leadId: string;
  let pipelineId: string;
  let stageId: string;

  const as = (who: string) => (m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    request(t.http)[m](`/api/v2${path}`).set('Authorization', `Bearer ${tokens[who]}`);
  const line = (total: number) => ({ description: 'synthetic', quantity: 1, unit_price: total, discount: 0, tax_rate: 0 });
  const idOf = (body: any): string => body?.data?.master_invoice?.id ?? body?.data?.id;
  const newSchool = async () => (await fx.school(`VIEW ${randomUUID().slice(0, 6)}`)).id;
  const newDeal = async (schoolId: string, owner: FixtureUser): Promise<string> =>
    (await fx.insertRow('deals', {
      id: randomUUID(), title: 'VIEW deal', lead_id: leadId, school_id: schoolId, pipeline_id: pipelineId,
      current_stage_id: stageId, assigned_to: owner.id, value: 7800, currency: 'USD',
    })).id as string;
  const plain = async (schoolId: string, total = 1000, dealId?: string, who = 'manager') =>
    idOf((await as(who)('post', '/invoices').send({ school_id: schoolId, deal_id: dealId, client_name: 'VIEW', items: [line(total)] }).expect(201)).body);
  const family = async (schoolId: string, dealId?: string) => {
    const parentId = idOf((await as('manager')('post', '/invoices')
      .send({ school_id: schoolId, deal_id: dealId, client_name: 'VIEW', payment_term_id: termId, installment_due_dates: agreedDates(2), items: [line(7800)] })
      .expect(201)).body);
    const kids: Array<{ id: string }> = await ds.query(`select id from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
    return { parentId, child1: kids[0].id, child2: kids[1].id };
  };
  const cancel = (id: string, who = 'manager') => as(who)('patch', `/invoices/${id}/status`).send({ status: 'Cancelled' });
  const view = async (schoolId: string, name: string, query: object = {}, who = 'manager') =>
    (await as(who)('get', '/invoices').query({ school_id: schoolId, view: name, limit: 100, ...query }).expect(200)).body;
  const ids = async (schoolId: string, name: string) => (await view(schoolId, name)).data.map((i: any) => i.id).sort();
  const stored = async (id: string) =>
    (await ds.query(`select status, payment_status, total::text, amount_paid::text, due_date, notes, parent_invoice_id, updated_at from invoices where id = $1`, [id]))[0];
  const moneyFingerprint = async () => (await ds.query(
    `select md5(coalesce((select string_agg(id::text||status||total||amount_paid||updated_at::text, ',' order by id) from invoices),'') ||
                coalesce((select string_agg(id::text||amount||updated_at::text, ',' order by id) from payments),'') ||
                coalesce((select string_agg(id::text||allocated_amount, ',' order by id) from payment_allocations),'') ||
                coalesce((select string_agg(id::text||value, ',' order by id) from deals),'')) f`))[0].f;
  const auditFor = async (reference: string, query: object = {}) =>
    (await as('admin')('get', '/activity-logs').query({ record: reference, limit: 50, ...query }).expect(200)).body;

  beforeAll(async () => {
    db = await DisposableDatabase.create();
    await db.runMigrations();
    t = await createTestApp(db, [RealErrorFilterModule, ActivityLogsModule, PaymentTermsModule, InvoicesModule, QuotesModule, PaymentsModule, ReportsModule, SchoolsModule, DealsModule]);
    ds = t.dataSource;
    fx = new Fixtures(ds, t.jwt);
    const realRole = async (name: string) => {
      const found: Array<{ id: string }> = await ds.query(`select id from roles where name = $1`, [name]);
      return found.length
        ? { id: found[0].id, name }
        : { id: (await fx.insertRow('roles', { name, description: 'view', is_active: true, is_system_role: true })).id as string, name };
    };
    const signIn = async (who: string, role: string) => {
      const r = await realRole(role);
      const user = await fx.user(who, [r]);
      tokens[who] = (await fx.bearer(user)).token;
      return { user, role: r };
    };
    const a = await signIn('admin', 'admin');
    await fx.insertRow('role_permissions', { role_id: a.role.id, permission_id: await fx.permission('manage', 'all') });
    const m = await signIn('manager', 'sales_manager');
    manager = m.user;
    const r = await signIn('rep', 'sales_rep');
    rep = r.user;
    await signIn('rep2', 'sales_rep');
    for (const role of [m.role, r.role]) {
      for (const action of ['read', 'update', 'create']) {
        await fx.insertRow('role_permissions', { role_id: role.id, permission_id: await fx.permission(action, 'Invoice') });
      }
    }
    termId = (await fx.insertRow('payment_terms', {
      name: 'Buy4Pay2 (synthetic)', type: 'custom', interest_rate: 0, interest_calculation_method: 'none',
      invoice_strategy: 'multiple_invoices', number_of_terms: 2, term_length_days: 30, days_until_due: 30,
      grace_period_days: 0, late_fee_percentage: 0, late_fee_amount: 0, is_active: true, is_default: false, display_order: 1,
    })).id as string;
    leadId = (await fx.lead('VIEW', manager.id, await newSchool())).id;
    pipelineId = (await fx.insertRow('pipelines', { name: `view pipeline ${randomUUID().slice(0, 6)}`, is_active: true })).id as string;
    stageId = (await fx.insertRow('stages', { pipeline_id: pipelineId, name: 'Proposal', order: 1, sla_days: 7 })).id as string;
  }, 600_000);

  afterAll(async () => {
    if (t) await t.close();
    if (db) await db.drop();
  });

  describe('views', () => {
    it('an EBI-shaped school: every document lands in the right view', async () => {
      const schoolId = await newSchool();
      const main = await plain(schoolId, 7800);
      await as('manager')('post', '/payments').send({ invoice_id: main, amount: 3900, payment_date: '2026-11-02', method: 'Cash', payment_method: 'Cash', reference: `V-${randomUUID().slice(0, 8)}` }).expect(201);
      const earlier = await plain(schoolId, 7800);
      await cancel(earlier).expect(200);
      const live = await family(schoolId);
      await cancel(live.child1).expect(200);
      const broken = await family(schoolId);
      await cancel(broken.child2).expect(200);
      await makeHistoricCancelledParent(ds, broken.parentId);

      expect(await ids(schoolId, 'issued')).toEqual([main]);
      expect(await ids(schoolId, 'drafts')).toEqual([live.parentId, broken.child1].sort());
      expect(await ids(schoolId, 'cancelled')).toEqual([earlier, live.child1, broken.parentId, broken.child2].sort());
      expect((await stored(main)).status).toBe('Partially-Paid');
      expect((await stored(live.parentId)).status).toBe('Draft');
      expect((await stored(live.child2)).status).toBe('Draft');
      expect((await stored(broken.child1)).status).toBe('Draft');
    });

    it('Issued, Drafts and Cancelled divide All, with nothing in two views', async () => {
      const schoolId = await newSchool();
      await plain(schoolId);
      const sent = await plain(schoolId);
      await ds.query(`update invoices set status = 'Sent' where id = $1`, [sent]);
      await cancel(await plain(schoolId)).expect(200);
      const f = await family(schoolId);
      await cancel(f.child2).expect(200);
      const issued = await ids(schoolId, 'issued');
      const drafts = await ids(schoolId, 'drafts');
      const cancelled = await ids(schoolId, 'cancelled');
      const all = await ids(schoolId, 'all');
      expect([...issued, ...drafts, ...cancelled].sort()).toEqual(all);
      expect(new Set([...issued, ...drafts, ...cancelled]).size).toBe(all.length);
      expect(issued).toEqual([sent]);
    });

    it('Sent, Partially-Paid, Paid and Overdue are Issued; a Draft never is', async () => {
      const schoolId = await newSchool();
      const made: string[] = [];
      for (const status of ['Sent', 'Partially-Paid', 'Paid', 'Overdue', 'Draft']) {
        const id = await plain(schoolId);
        await ds.query(`update invoices set status = $1 where id = $2`, [status, id]);
        made.push(id);
      }
      expect(await ids(schoolId, 'issued')).toEqual(made.slice(0, 4).sort());
      expect(await ids(schoolId, 'drafts')).toEqual([made[4]]);
    });

    it('the old Active view is gone, so nothing can present a Draft as current', async () => {
      await as('manager')('get', '/invoices').query({ view: 'active' }).expect(400);
    });

    it('a live instalment under a live parent stays inside its family', async () => {
      const schoolId = await newSchool();
      const f = await family(schoolId);
      expect(await ids(schoolId, 'drafts')).toEqual([f.parentId]);
      expect(await ids(schoolId, 'all')).toEqual([f.parentId]);
    });

    it('a Draft is in Drafts, keeps its status, and is not in Issued', async () => {
      const schoolId = await newSchool();
      const id = await plain(schoolId);
      expect((await stored(id)).status).toBe('Draft');
      expect(await ids(schoolId, 'drafts')).toEqual([id]);
      expect(await ids(schoolId, 'issued')).toEqual([]);
    });

    it('a family with a Draft instalment under an issued parent stays in Issued', async () => {
      const schoolId = await newSchool();
      const f = await family(schoolId);
      await ds.query(`update invoices set status = 'Partially-Paid' where id = $1`, [f.parentId]);
      expect(await ids(schoolId, 'issued')).toEqual([f.parentId]);
      expect(await ids(schoolId, 'drafts')).toEqual([]);
      expect((await stored(f.child2)).status).toBe('Draft');
    });

    it('an instalment names its parent, so the relationship shows on any list', async () => {
      const schoolId = await newSchool();
      const f = await family(schoolId);
      await cancel(f.child1).expect(200);
      const [{ n }] = await ds.query(`select invoice_number n from invoices where id = $1`, [f.parentId]);
      const [row] = (await view(schoolId, 'cancelled')).data;
      expect(row).toEqual(expect.objectContaining({ id: f.child1, parent_status: 'Draft', parent_invoice_number: n }));
      expect((await view(schoolId, 'drafts')).data[0].parent_invoice_number).toBeNull();
    });

    it('a live instalment under a cancelled parent says so, and keeps its own status', async () => {
      const schoolId = await newSchool();
      const f = await family(schoolId);
      await makeHistoricCancelledParent(ds, f.parentId);
      const rows = (await view(schoolId, 'drafts')).data;
      expect(rows).toHaveLength(2);
      for (const row of rows) expect([row.status, row.parent_status]).toEqual(['Draft', 'Cancelled']);
    });

    it('an invoice with no plan has no invented instalments', async () => {
      const schoolId = await newSchool();
      const id = await plain(schoolId, 7800);
      const detail = (await as('manager')('get', `/invoices/${id}`).expect(200)).body.data;
      expect(detail.child_invoices).toEqual([]);
      expect(detail.family_summary).toBeNull();
      const [{ n }] = await ds.query(`select count(*)::int n from installments where invoice_id = $1 or parent_invoice_id = $1`, [id]);
      expect(n).toBe(0);
    });

    it('pages cover the whole view with nothing repeated', async () => {
      const schoolId = await newSchool();
      for (let i = 0; i < 7; i += 1) await plain(schoolId);
      for (let i = 0; i < 5; i += 1) await cancel(await plain(schoolId)).expect(200);
      const seen: string[] = [];
      for (let page = 1; page <= 3; page += 1) {
        const body = await view(schoolId, 'drafts', { page, limit: 3 });
        expect(body.meta.totalItems).toBe(7);
        seen.push(...body.data.map((i: any) => i.id));
      }
      expect(new Set(seen).size).toBe(7);
      expect((await view(schoolId, 'cancelled', { limit: 2 })).meta.totalItems).toBe(5);
    });

    it('search and status work inside a view', async () => {
      const schoolId = await newSchool();
      const keep = await plain(schoolId);
      const gone = await plain(schoolId);
      await cancel(gone).expect(200);
      const number = (await stored(keep), (await ds.query(`select invoice_number n from invoices where id = $1`, [gone]))[0].n);
      expect((await view(schoolId, 'cancelled', { search: number })).data.map((i: any) => i.id)).toEqual([gone]);
      expect((await view(schoolId, 'drafts', { search: number })).data).toEqual([]);
      expect((await view(schoolId, 'all', { status: 'Cancelled' })).data.map((i: any) => i.id)).toEqual([gone]);
    });

    it('without a view the existing list is unchanged', async () => {
      const schoolId = await newSchool();
      const f = await family(schoolId);
      await cancel(f.child1).expect(200);
      const list = (await as('manager')('get', '/invoices').query({ school_id: schoolId, limit: 100 }).expect(200)).body.data;
      expect(list.map((i: any) => i.id)).toEqual([f.parentId]);
      const withKids = (await as('manager')('get', '/invoices').query({ school_id: schoolId, include_children: true, limit: 100 }).expect(200)).body.data;
      expect(withKids).toHaveLength(3);
    });

    it('an unknown view is refused', async () => {
      await as('manager')('get', '/invoices').query({ view: 'everything' }).expect(400);
    });

    it('views keep a rep to their own invoices', async () => {
      const schoolId = await newSchool();
      const repDeal = await newDeal(schoolId, rep);
      const own = await plain(schoolId, 500, repDeal, 'rep');
      const other = await plain(schoolId, 500);
      await cancel(other).expect(200);
      for (const name of ['issued', 'drafts', 'cancelled', 'all']) {
        const rows = (await view(schoolId, name, {}, 'rep')).data;
        expect(rows.every((i: any) => i.owner_id === rep.id)).toBe(true);
      }
      expect((await view(schoolId, 'drafts', {}, 'rep')).data.map((i: any) => i.id)).toEqual([own]);
      expect((await view(schoolId, 'all', {}, 'rep2')).data).toEqual([]);
    });

    it('reading views changes nothing financial', async () => {
      const schoolId = await newSchool();
      const f = await family(schoolId);
      await cancel(f.child1).expect(200);
      const before = await moneyFingerprint();
      for (const name of ['issued', 'drafts', 'cancelled', 'all']) await view(schoolId, name);
      await as('manager')('get', `/invoices/${f.parentId}`).expect(200);
      expect(await moneyFingerprint()).toBe(before);
    });
  });

  describe('a Draft is not customer debt', () => {
    const period = async () => (await as('admin')('get', '/invoices/stats').expect(200)).body.data.monthly;
    const schoolStats = async (id: string) => (await as('admin')('get', `/schools/${id}/stats`).expect(200)).body.data;

    it('the invoice figures count a Draft as a draft only', async () => {
      const schoolId = await newSchool();
      const before = await period();
      await plain(schoolId, 7800);
      const after = await period();
      expect(after.draft).toBe(before.draft + 1);
      expect(after.draftValue).toBe(before.draftValue + 7800);
      expect(after.totalValue).toBe(before.totalValue);
      expect(after.outstanding).toBe(before.outstanding);
      expect(after.outstandingValue).toBe(before.outstandingValue);
    });

    it('a school owes only what was issued: EBI-shaped, 3,900 and not 11,700', async () => {
      const schoolId = await newSchool();
      const main = await plain(schoolId, 7800);
      await as('manager')('post', '/payments').send({ invoice_id: main, amount: 3900, payment_date: '2026-11-02', method: 'Cash', payment_method: 'Cash', reference: `V-${randomUUID().slice(0, 8)}` }).expect(201);
      await family(schoolId);
      const stats = await schoolStats(schoolId);
      expect(stats.outstandingInvoices).toEqual({ count: 1, totalValue: 3900 });
    });

    it('a Draft keeps its full amount: nothing is written off to tidy the display', async () => {
      const schoolId = await newSchool();
      const id = await plain(schoolId, 7800);
      expect(await stored(id)).toEqual(expect.objectContaining({ status: 'Draft', total: '7800.00', amount_paid: '0.00' }));
    });
  });

  describe('deal screen data', () => {
    it('the deal returns parent and children once each, and the parent total is the sale', async () => {
      const schoolId = await newSchool();
      const dealId = await newDeal(schoolId, manager);
      const f = await family(schoolId, dealId);
      const invoices = (await as('admin')('get', `/deals/${dealId}`).expect(200)).body.data.invoices;
      expect(invoices.map((i: any) => i.id).sort()).toEqual([f.parentId, f.child1, f.child2].sort());
      const topLevel = invoices.filter((i: any) => !i.parent_invoice_id).reduce((sum: number, i: any) => sum + Number(i.total), 0);
      expect(topLevel).toBe(7800);
    });
  });

  describe('cancellation accountability', () => {
    it('a cancelled Draft moves view, keeps its record, and the audit trail agrees', async () => {
      const schoolId = await newSchool();
      const dealId = await newDeal(schoolId, manager);
      const id = await plain(schoolId, 1000, dealId);
      const [{ invoice_number: number }] = await ds.query(`select invoice_number from invoices where id = $1`, [id]);
      expect(await ids(schoolId, 'drafts')).toEqual([id]);
      const before = await stored(id);

      await cancel(id).expect(200);

      expect(await ids(schoolId, 'drafts')).toEqual([]);
      expect(await ids(schoolId, 'cancelled')).toEqual([id]);
      expect(await ids(schoolId, 'all')).toEqual([id]);
      const after = await stored(id);
      expect(after).toEqual({ ...before, status: 'Cancelled', updated_at: after.updated_at });

      const audit = await auditFor(number, { event: 'cancelled' });
      expect(audit.data).toHaveLength(1);
      const [event] = audit.data;
      expect(event).toEqual(expect.objectContaining({
        title: 'Invoice status: Draft → Cancelled', reference: number, actioned_by: manager.id,
        category: 'financial', old_values: { status: 'Draft' }, new_values: { status: 'Cancelled' }, deal_title: 'VIEW deal',
      }));
      expect(event.school_name).toContain('VIEW');

      // a refresh is a fresh read: both sides still agree
      expect((await as('manager')('get', `/invoices/${id}`).expect(200)).body.data.status).toBe('Cancelled');
      expect((await auditFor(number, { event: 'cancelled' })).meta.totalItems).toBe(1);
    });

    it('a blocked cancellation changes nothing and claims nothing', async () => {
      const schoolId = await newSchool();
      const id = await plain(schoolId, 7800);
      const [{ invoice_number: number }] = await ds.query(`select invoice_number from invoices where id = $1`, [id]);
      await as('manager')('post', '/payments').send({ invoice_id: id, amount: 3900, payment_date: '2026-11-02', method: 'Cash', payment_method: 'Cash', reference: `B-${randomUUID().slice(0, 8)}` }).expect(201);
      const before = await stored(id);
      const eventsBefore = (await auditFor(number)).meta.totalItems;

      const refused = await cancel(id).expect(409);
      expect(refused.body.code).toBe('INVOICE_HAS_RECORDED_PAYMENTS');

      expect(await stored(id)).toEqual(before);
      expect(await ids(schoolId, 'issued')).toEqual([id]);
      expect(await ids(schoolId, 'cancelled')).toEqual([]);
      expect((await auditFor(number, { event: 'cancelled' })).meta.totalItems).toBe(0);
      expect((await auditFor(number)).meta.totalItems).toBe(eventsBefore);
    });

    it('a refused rep attempt claims nothing either', async () => {
      const schoolId = await newSchool();
      const id = await plain(schoolId);
      const [{ invoice_number: number }] = await ds.query(`select invoice_number from invoices where id = $1`, [id]);
      await cancel(id, 'rep').expect(403);
      expect((await stored(id)).status).toBe('Draft');
      expect((await auditFor(number, { event: 'cancelled' })).meta.totalItems).toBe(0);
    });

    it('a parent refused over active instalments claims nothing', async () => {
      const schoolId = await newSchool();
      const f = await family(schoolId);
      const [{ invoice_number: number }] = await ds.query(`select invoice_number from invoices where id = $1`, [f.parentId]);
      await cancel(f.parentId).expect(409);
      expect((await auditFor(number, { event: 'cancelled' })).meta.totalItems).toBe(0);
    });

    it('the history link opens for a manager and cannot bypass access for a rep', async () => {
      const schoolId = await newSchool();
      const id = await plain(schoolId);
      const [{ invoice_number: number }] = await ds.query(`select invoice_number from invoices where id = $1`, [id]);
      await cancel(id).expect(200);
      for (const who of ['rep', 'rep2']) {
        const res = await as(who)('get', '/activity-logs').query({ record: number, limit: 50 }).expect(200);
        expect(res.body.meta.totalItems).toBe(0);
      }
      const res = await as('manager')('get', '/activity-logs').query({ record: number, limit: 50 }).expect(200);
      expect(res.body.meta.totalItems).toBeGreaterThan(0);
    });
  });
});
