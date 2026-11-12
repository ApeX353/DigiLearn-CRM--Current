/**
 * AUDIT-TRAIL-001 Slice 1 — the Audit Trail's categories, filters, wording and access.
 *
 * Runs the real activity-log routes through the real exception filter. Rows are made by
 * real actions where the wording matters; a batch is inserted directly only to give the
 * paging tests a known population, and nothing here changes a row once written.
 */
import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ActivityLogsModule } from '../../src/activity-logs/activity-logs.module';
import { auditCategory, auditTitle, emptyLookups, MANAGER_AUDIT_ENTITIES } from '../../src/activity-logs/audit-presentation';
import { DealsModule } from '../../src/deals/deals.module';
import { DiagnosticsExceptionFilter } from '../../src/diagnostics/diagnostics-exception.filter';
import { InvoicesModule } from '../../src/invoices/invoices.module';
import { PaymentsModule } from '../../src/payments/payments.module';
import { PaymentTermsModule } from '../../src/payment-terms/payment-terms.module';
import { QuotesModule } from '../../src/quotes/quotes.module';
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

describe('AUDIT-TRAIL-001 — categories, filters, wording and access', () => {
  let db: DisposableDatabase;
  let t: TestApp;
  let fx: Fixtures;
  let ds: DataSource;
  let admin: FixtureUser;
  let rep: FixtureUser;
  let otherRep: FixtureUser;
  const tokens: Record<string, string> = {};
  let schoolId: string;
  let invoiceId: string;
  let invoiceNumber: string;
  const stamp = randomUUID().slice(0, 8);

  const as = (who: string | null) => (m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => {
    const req = request(t.http)[m](`/api/v2${path}`);
    return who ? req.set('Authorization', `Bearer ${tokens[who]}`) : req;
  };
  const adminGet = (path: string, query: object = {}) => as('admin')('get', path).query(query).expect(200);
  const line = (total: number) => ({ description: 'synthetic', quantity: 1, unit_price: total, discount: 0, tax_rate: 0 });
  const seed = (values: object) => fx.insertRow('activity_logs', {
    entity: 'Lead', entity_id: randomUUID(), action: 'update', summary: `seed ${stamp}`, actioned_by: admin.id, ...values,
  });
  /** Every row of a filtered list, page by page, in order. */
  const walk = async (query: object, limit = 25) => {
    const ids: string[] = [];
    for (let page = 1; ; page += 1) {
      const res = await adminGet('/activity-logs', { ...query, page, limit });
      ids.push(...res.body.data.map((r: any) => r.id));
      if (page >= res.body.meta.totalPages) return ids;
    }
  };

  beforeAll(async () => {
    db = await DisposableDatabase.create();
    await db.runMigrations();
    t = await createTestApp(db, [RealErrorFilterModule, ActivityLogsModule, PaymentTermsModule, InvoicesModule, QuotesModule, PaymentsModule, DealsModule]);
    ds = t.dataSource;
    fx = new Fixtures(ds, t.jwt);
    const realRole = async (name: string) => {
      const found: Array<{ id: string }> = await ds.query(`select id from roles where name = $1`, [name]);
      return found.length
        ? { id: found[0].id, name }
        : { id: (await fx.insertRow('roles', { name, description: 'audit', is_active: true, is_system_role: true })).id as string, name };
    };
    const signIn = async (who: string, role: string) => {
      const r = await realRole(role);
      const user = await fx.user(who, [r]);
      tokens[who] = (await fx.bearer(user)).token;
      return { user, role: r };
    };
    const a = await signIn('admin', 'admin');
    admin = a.user;
    await fx.insertRow('role_permissions', { role_id: a.role.id, permission_id: await fx.permission('manage', 'all') });
    await signIn('support', 'admin_support');
    await signIn('manager', 'sales_manager');
    await signIn('manager role', 'manager');
    await signIn('finance role', 'finance');
    {
      const both = await fx.user('both', [await realRole('sales_manager'), await realRole('admin_support')]);
      tokens.both = (await fx.bearer(both)).token;
    }
    rep = (await signIn('rep', 'sales_rep')).user;
    otherRep = (await signIn('rep2', 'sales_rep')).user;
    schoolId = (await fx.school('AUDIT')).id;

    const created = await as('admin')('post', '/invoices').send({ school_id: schoolId, client_name: 'AUDIT', items: [line(7800)] }).expect(201);
    invoiceId = created.body.data?.master_invoice?.id ?? created.body.data?.id;
    invoiceNumber = (await ds.query(`select invoice_number from invoices where id = $1`, [invoiceId]))[0].invoice_number;
    await as('admin')('patch', `/invoices/${invoiceId}/status`).send({ status: 'Cancelled' }).expect(200);
    for (let i = 0; i < 12; i += 1) await seed({ entity: 'Invoice', summary: `paged ${stamp}` });
    for (let i = 0; i < 12; i += 1) await seed({ summary: `paged ${stamp}` });
    await seed({ entity: 'deal', new_values: { value: 900 }, old_values: { value: 800 } });
    await seed({ entity: 'Deal', new_values: { value: 950 }, old_values: { value: 900 } });
    await seed({ entity: 'deal', new_values: { position: 2 }, old_values: { position: 1 } });
    await seed({ entity: 'deal', old_values: null, new_values: null });
    await seed({ entity: 'Lead', actioned_by: rep.id, summary: `rep own ${stamp}` });
    await seed({ entity: 'Invoice', actioned_by: otherRep.id, summary: `colleague ${stamp}` });
  }, 600_000);

  afterAll(async () => {
    if (t) await t.close();
    if (db) await db.drop();
  });

  // ---- 1
  describe('1 category completeness', () => {
    it('All is exactly Financial plus Other, with nothing in both', async () => {
      const all = await walk({});
      const financial = await walk({ category: 'financial' });
      const other = await walk({ category: 'other' });
      expect(new Set([...financial, ...other])).toEqual(new Set(all));
      expect(financial.length + other.length).toBe(all.length);
      expect(financial.filter((id) => other.includes(id))).toEqual([]);
    });

    it('the tab counts agree with the lists', async () => {
      const { all, financial, other } = (await adminGet('/activity-logs/category-counts')).body.data;
      expect(all).toBe(financial + other);
      expect((await adminGet('/activity-logs', { category: 'financial', limit: 1 })).body.meta.totalItems).toBe(financial);
      expect((await adminGet('/activity-logs', { category: 'other', limit: 1 })).body.meta.totalItems).toBe(other);
    });

    it('rows are labelled as the server filtered them', async () => {
      for (const category of ['financial', 'other'] as const) {
        const res = await adminGet('/activity-logs', { category, limit: 100 });
        for (const row of res.body.data) {
          expect(row.category).toBe(category);
          expect(auditCategory(row)).toBe(category);
        }
      }
    });

    it('an event type nobody has classified is kept, under Other, never dropped', async () => {
      const row = await seed({ entity: 'SomethingNew', action: 'mystery_action', summary: `unknown ${stamp}` });
      const other = await adminGet('/activity-logs', { category: 'other', record: `unknown ${stamp}` });
      expect(other.body.data.map((r: any) => r.id)).toEqual([row.id]);
      expect(other.body.data[0].title).toBeNull();
      expect((await adminGet('/activity-logs', { category: 'financial', record: `unknown ${stamp}` })).body.meta.totalItems).toBe(0);
      expect((await adminGet('/activity-logs', { record: `unknown ${stamp}` })).body.meta.totalItems).toBe(1);
    });

    it('a deal row is financial only when it carries a value, in either casing', () => {
      expect(auditCategory({ entity: 'deal', old_values: { value: 1 }, new_values: { value: 2 } })).toBe('financial');
      expect(auditCategory({ entity: 'Deal', old_values: null, new_values: { value: 2 } })).toBe('financial');
      expect(auditCategory({ entity: 'deal', old_values: { position: 1 }, new_values: { position: 2 } })).toBe('other');
      expect(auditCategory({ entity: 'deal', old_values: null, new_values: null })).toBe('other');
    });
  });

  // ---- 2
  describe('2 filtering across pages', () => {
    it('a filter applies to the whole result, not the loaded page', async () => {
      const ids = await walk({ category: 'financial', record: `paged ${stamp}` }, 5);
      expect(ids).toHaveLength(12);
      expect(new Set(ids).size).toBe(12);
    });

    it('paging repeats and loses nothing, even when rows share a timestamp', async () => {
      await ds.query(`update activity_logs set created_at = '2026-01-01 00:00:00' where summary = $1`, [`paged ${stamp}`]);
      const ids = await walk({ record: `paged ${stamp}` }, 7);
      expect(ids).toHaveLength(24);
      expect(new Set(ids).size).toBe(24);
      // The tie-break is what makes this repeatable: rows with one timestamp come in id order.
      expect(ids).toEqual([...ids].sort().reverse());
    });
  });

  // ---- 3
  describe('3 combined filters', () => {
    it('reference, date, category, event and actor work together', async () => {
      const filters = { record: invoiceNumber, category: 'financial', event: 'cancelled', actioned_by: admin.id, start_date: '2020-01-01T00:00:00Z', end_date: '2099-01-01T00:00:00Z' };
      const res = await adminGet('/activity-logs', filters);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].entity_id).toBe(invoiceId);
    });

    it('each extra filter narrows it: another actor, a past range, another event', async () => {
      const base = { record: invoiceNumber, event: 'cancelled' };
      for (const extra of [{ actioned_by: rep.id }, { end_date: '2020-01-01T00:00:00Z' }, { category: 'other' }]) {
        expect((await adminGet('/activity-logs', { ...base, ...extra })).body.meta.totalItems).toBe(0);
      }
      expect((await adminGet('/activity-logs', { record: invoiceNumber, event: 'payment_recorded' })).body.meta.totalItems).toBe(0);
    });

    it('a record id and a reference find the same history', async () => {
      const byNumber = await walk({ record: invoiceNumber });
      expect(byNumber.length).toBeGreaterThanOrEqual(2);
      expect(new Set(await walk({ record: invoiceId }))).toEqual(new Set(await walk({ entity_id: invoiceId })));
    });

    it('search text is literal: % and _ match nothing special, and SQL is inert', async () => {
      expect((await adminGet('/activity-logs', { record: '%' })).body.meta.totalItems).toBe(0);
      expect((await adminGet('/activity-logs', { record: `'; drop table activity_logs; --` })).body.meta.totalItems).toBe(0);
      expect((await ds.query(`select count(*)::int n from activity_logs`))[0].n).toBeGreaterThan(0);
    });

    it('a date bound is a moment, whatever the zone it is written in', async () => {
      const row = await seed({ summary: `dated ${stamp}` });
      await ds.query(`update activity_logs set created_at = '2026-10-28 07:27:18' where id = $1`, [row.id]);
      const query = { record: `dated ${stamp}` };
      expect((await adminGet('/activity-logs', { ...query, start_date: '2026-10-28T00:00:00+02:00', end_date: '2026-10-28T23:59:59+02:00' })).body.meta.totalItems).toBe(1);
      expect((await adminGet('/activity-logs', { ...query, start_date: '2026-10-28T09:27:19+02:00' })).body.meta.totalItems).toBe(0);
      expect((await adminGet('/activity-logs', { ...query, end_date: '2026-10-28T09:27:17+02:00' })).body.meta.totalItems).toBe(0);
    });

    it('an unknown category or event is refused, not ignored', async () => {
      await as('admin')('get', '/activity-logs').query({ category: 'secret' }).expect(400);
      await as('admin')('get', '/activity-logs').query({ event: 'anything' }).expect(400);
    });
  });

  // ---- 4
  describe('4 accurate before and after', () => {
    const row = (overrides: object) => ({ entity: 'Invoice', entity_id: 'x', action: 'update', summary: '', ...overrides });

    it('a real cancellation reads with its reference and transition', async () => {
      const res = await adminGet('/activity-logs', { record: invoiceNumber, event: 'cancelled' });
      expect(res.body.data[0]).toEqual(expect.objectContaining({
        title: 'Invoice status: Draft → Cancelled', reference: invoiceNumber, category: 'financial', actioned_by: admin.id,
      }));
    });

    it('a real payment reads with its amount and invoice', async () => {
      const made = await as('admin')('post', '/invoices').send({ school_id: schoolId, client_name: 'AUDIT', items: [line(7800)] }).expect(201);
      const id = made.body.data?.master_invoice?.id ?? made.body.data?.id;
      const [{ invoice_number }] = await ds.query(`select invoice_number from invoices where id = $1`, [id]);
      await as('admin')('post', '/payments').send({ invoice_id: id, amount: 3900, payment_date: '2026-11-02', method: 'Cash', payment_method: 'Cash', reference: `AUD-${stamp}` }).expect(201);
      const res = await adminGet('/activity-logs', { record: `AUD-${stamp}`, event: 'payment_recorded' });
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe(`Payment recorded: 3,900.00 on ${invoice_number}`);
    });

    it('a quotation status shows what was recorded', () => {
      expect(auditTitle(row({ entity: 'Quote', old_values: { status: 'Draft' }, new_values: { status: 'Sent' } }), emptyLookups()))
        .toBe('Quotation status: Draft → Sent');
    });

    it('conversion does not repeat its hard-coded previous status', () => {
      const title = auditTitle(row({
        entity: 'Quote', summary: 'Quote QUO-2026-0104 accepted and converted to invoice INV-2026-0090',
        old_values: { status: 'Sent' }, new_values: { status: 'Accepted' },
      }), emptyLookups());
      expect(title).toBe('Quotation accepted and converted to an invoice');
      expect(title).not.toContain('Sent');
    });

    it('a reassignment names people, and never invents one', () => {
      const lookups = emptyLookups();
      lookups.users.set('u1', 'Busi Ncube');
      lookups.users.set('u2', 'Kim Mpofu');
      const lead = (from: string | null, to: string | null) => row({ entity: 'Lead', old_values: { assigned_to: from }, new_values: { assigned_to: to } });
      expect(auditTitle(lead('u1', 'u2'), lookups)).toBe('Lead reassigned: Busi Ncube → Kim Mpofu');
      expect(auditTitle(lead(null, 'u2'), lookups)).toBe('Lead reassigned: Unassigned → Kim Mpofu');
      expect(auditTitle(lead('gone', 'u2'), lookups)).toBe('Lead reassigned: a user no longer on record → Kim Mpofu');
    });

    it('a staff role change shows both sides when recorded', () => {
      expect(auditTitle(row({ entity: 'User', old_values: { role: 'sales_rep' }, new_values: { role: 'sales_manager' } }), emptyLookups()))
        .toBe('Staff role: sales_rep → sales_manager');
    });

    it('a deal value change shows both sides', () => {
      expect(auditTitle(row({ entity: 'deal', old_values: { value: 800 }, new_values: { value: 900 } }), emptyLookups()))
        .toBe('Deal value: 800.00 → 900.00');
    });

    it('with no recorded before value there is no invented transition', () => {
      expect(auditTitle(row({ new_values: { status: 'Cancelled' } }), emptyLookups())).toBeNull();
      expect(auditTitle(row({ old_values: { notes: 'a' }, new_values: { notes: 'b' } }), emptyLookups())).toBeNull();
    });

    it('a row with no recorded actor stays that way', async () => {
      await seed({ actioned_by: null, summary: `no actor ${stamp}` });
      const res = await adminGet('/activity-logs', { record: `no actor ${stamp}` });
      expect(res.body.data[0].actioned_by).toBeNull();
      expect(res.body.data[0].user).toBeNull();
    });
  });

  // ---- 6 and 7
  describe('6, 7 permissions and direct API access', () => {
    it.each(['admin', 'support'])('%s sees the whole trail', async (who) => {
      const res = await as(who)('get', '/activity-logs').query({ limit: 100, record: `colleague ${stamp}` }).expect(200);
      expect(res.body.meta.totalItems).toBe(1);
    });

    it('a rep sees only their own actions', async () => {
      const res = await as('rep')('get', '/activity-logs').query({ limit: 100, record: `colleague ${stamp}` }).expect(200);
      expect(res.body.meta.totalItems).toBe(0);
    });

    it('a rep cannot widen it by naming someone else', async () => {
      const res = await as('rep')('get', '/activity-logs').query({ actioned_by: otherRep.id, limit: 100 }).expect(200);
      expect(res.body.data.every((r: any) => r.actioned_by === rep.id)).toBe(true);
      expect(res.body.meta.totalItems).toBeGreaterThan(0);
    });

    it('category, event and record filters cannot widen it either', async () => {
      for (const query of [{ category: 'financial' }, { category: 'other' }, { event: 'cancelled' }, { record: invoiceNumber }, { entity_id: invoiceId }]) {
        const res = await as('rep')('get', '/activity-logs').query({ ...query, limit: 100 }).expect(200);
        expect(res.body.data.every((r: any) => r.actioned_by === rep.id)).toBe(true);
      }
    });

    it('the tab counts and the people list are scoped the same way', async () => {
      const counts = (await as('rep')('get', '/activity-logs/category-counts').expect(200)).body.data;
      const list = (await as('rep')('get', '/activity-logs').query({ limit: 1 }).expect(200)).body.meta.totalItems;
      expect(counts.all).toBe(list);
      const people = (await as('rep')('get', '/activity-logs/actors').expect(200)).body.data;
      expect(people.map((p: any) => p.id)).toEqual([rep.id]);
      const everyone = (await as('admin')('get', '/activity-logs/actors').expect(200)).body.data;
      expect(everyone.map((p: any) => p.id)).toEqual(expect.arrayContaining([admin.id, rep.id, otherRep.id]));
    });

    it('a rep cannot read the history of a record they do not own', async () => {
      const res = await as('rep')('get', `/activity-logs/entity/Invoice/${invoiceId}`).expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('a wildcard entity name does not get round that', async () => {
      const res = await as('rep')('get', `/activity-logs/entity/${encodeURIComponent('%')}/${invoiceId}`).expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('a rep sees the whole history of a record they own', async () => {
      const made = await as('admin')('post', '/invoices').send({ school_id: schoolId, client_name: 'AUDIT', items: [line(100)] }).expect(201);
      const id = made.body.data?.master_invoice?.id ?? made.body.data?.id;
      await ds.query(`update invoices set owner_id = $2 where id = $1`, [id, rep.id]);
      const res = await as('rep')('get', `/activity-logs/entity/Invoice/${id}`).expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].actioned_by).toBe(admin.id);
    });

    it('a rep still sees their own action on a record they no longer own', async () => {
      const logged = await seed({ entity: 'Lead', actioned_by: rep.id, summary: `former ${stamp}` });
      const res = await as('rep')('get', `/activity-logs/entity/Lead/${logged.entity_id}`).expect(200);
      expect(res.body.data.map((r: any) => r.id)).toEqual([logged.id]);
    });

    it.each(['admin', 'support', 'manager'])('%s keeps any record history', async (who) => {
      const res = await as(who)('get', `/activity-logs/entity/Invoice/${invoiceId}`).expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('no login gets nothing, on any route', async () => {
      for (const path of ['/activity-logs', '/activity-logs/category-counts', '/activity-logs/actors', `/activity-logs/entity/Invoice/${invoiceId}`]) {
        await as(null)('get', path).expect(401);
      }
    });

    it('a malformed record id is refused cleanly', async () => {
      await as('admin')('get', '/activity-logs/entity/Invoice/not-a-uuid').expect(400);
    });
  });

  // ---- 8
  describe('RELEASE-EBI-AUDIT-003 sales manager access', () => {
    const hidden = `hidden ${stamp}`;
    const managerGet = (path: string, query: object = {}) => as('manager')('get', path).query(query).expect(200);
    const hiddenTypes = ['User', 'Role', 'Setting', 'BugReport', 'ManagedFile', 'JobRun', 'DeliveryAttempt', 'LeadImportBatch', 'SomethingNew'];
    let userRowId: string;
    let onlyHiddenActor: FixtureUser;

    beforeAll(async () => {
      onlyHiddenActor = await fx.user('hidden actor', []);
      for (const entity of hiddenTypes) {
        await seed({ entity, summary: `${hidden} ${entity}`, actioned_by: onlyHiddenActor.id });
      }
      await seed({ entity: 'user', summary: `${hidden} lower`, actioned_by: admin.id });
      userRowId = (await seed({ entity: 'User', summary: `${hidden} by admin`, actioned_by: admin.id })).entity_id as string;
      for (const entity of ['Activity', 'School', 'Payment', 'Quote', 'Stage', 'Contact']) {
        await seed({ entity, summary: `crm ${stamp} ${entity}`, actioned_by: otherRep.id });
      }
    });

    it('reads colleagues\' financial and CRM records, whoever acted', async () => {
      const financial = await managerGet('/activity-logs', { category: 'financial', record: `crm ${stamp}`, limit: 50 });
      expect(financial.body.data.map((r: any) => r.entity).sort()).toEqual(['Payment', 'Quote']);
      const other = await managerGet('/activity-logs', { category: 'other', record: `crm ${stamp}`, limit: 50 });
      expect(other.body.data.map((r: any) => r.entity).sort()).toEqual(['Activity', 'Contact', 'School', 'Stage']);
      expect(other.body.data.every((r: any) => r.actioned_by === otherRep.id)).toBe(true);
      expect((await managerGet('/activity-logs', { record: invoiceNumber })).body.meta.totalItems).toBeGreaterThan(0);
    });

    it('reads no staff, role, settings, file, system or unclassified row by searching', async () => {
      expect((await adminGet('/activity-logs', { record: hidden })).body.meta.totalItems).toBe(hiddenTypes.length + 2);
      expect((await managerGet('/activity-logs', { record: hidden })).body.meta.totalItems).toBe(0);
    });

    it.each([...['User', 'user', 'USER', 'Role', 'Setting', 'SomethingNew']])('naming entity %s reads nothing', async (entity) => {
      expect((await managerGet('/activity-logs', { entity })).body.meta.totalItems).toBe(0);
    });

    it('naming a hidden row by id reads nothing, by either filter', async () => {
      expect((await adminGet('/activity-logs', { record: userRowId })).body.meta.totalItems).toBe(1);
      expect((await managerGet('/activity-logs', { record: userRowId })).body.meta.totalItems).toBe(0);
      expect((await managerGet('/activity-logs', { entity_id: userRowId })).body.meta.totalItems).toBe(0);
    });

    it('filtering by a person shows their CRM rows and never their hidden ones', async () => {
      const res = await managerGet('/activity-logs', { actioned_by: admin.id, limit: 100 });
      expect(res.body.meta.totalItems).toBeGreaterThan(0);
      expect(res.body.data.map((r: any) => r.entity.toLowerCase())).not.toContain('user');
      expect((await managerGet('/activity-logs', { actioned_by: onlyHiddenActor.id })).body.meta.totalItems).toBe(0);
    });

    it('every row of the whole unfiltered trail is a permitted type', async () => {
      const seen = new Set<string>();
      for (let page = 1; ; page += 1) {
        const res = await managerGet('/activity-logs', { page, limit: 100 });
        res.body.data.forEach((r: any) => seen.add(r.entity.toLowerCase()));
        if (page >= res.body.meta.totalPages) break;
      }
      expect([...seen].filter((entity) => !MANAGER_AUDIT_ENTITIES.includes(entity))).toEqual([]);
    });

    it('the counts agree with the list and hide the same rows', async () => {
      const counts = (await managerGet('/activity-logs/category-counts')).body.data;
      const list = (await managerGet('/activity-logs', { limit: 1 })).body.meta.totalItems;
      expect(counts.all).toBe(list);
      expect(counts.financial + counts.other).toBe(counts.all);
      const everything = (await adminGet('/activity-logs/category-counts')).body.data;
      expect(everything.all).toBeGreaterThan(counts.all);
      expect((await managerGet('/activity-logs/category-counts', { record: hidden })).body.data.all).toBe(0);
    });

    it('the people filter names only those with readable rows', async () => {
      const people = (await managerGet('/activity-logs/actors')).body.data.map((p: any) => p.id);
      expect(people).toContain(otherRep.id);
      expect(people).not.toContain(onlyHiddenActor.id);
      const all = (await adminGet('/activity-logs/actors')).body.data.map((p: any) => p.id);
      expect(all).toContain(onlyHiddenActor.id);
    });

    it.each(['User', 'user', 'Role', 'SomethingNew'])('the record route reads no %s history', async (entity) => {
      const res = await managerGet(`/activity-logs/entity/${entity}/${userRowId}`);
      expect(res.body.data).toEqual([]);
    });

    it('a request cannot grant itself access', async () => {
      const res = await as('manager')('get', '/activity-logs').query({ record: hidden, allowed_entities: 'user' });
      expect(res.body.meta?.totalItems ?? 0).toBe(0);
      const undefinedList = await as('manager')('get', '/activity-logs').query({ record: hidden, allowed_entities: '' });
      expect(undefinedList.body.meta?.totalItems ?? 0).toBe(0);
    });

    it('a rep is unchanged: their own rows only, hidden or not, and no colleague', async () => {
      const res = await as('rep')('get', '/activity-logs').query({ actioned_by: otherRep.id, limit: 100 }).expect(200);
      expect(res.body.data.every((r: any) => r.actioned_by === rep.id)).toBe(true);
      expect((await as('rep')('get', '/activity-logs').query({ record: `crm ${stamp}` }).expect(200)).body.meta.totalItems).toBe(0);
      const people = (await as('rep')('get', '/activity-logs/actors').expect(200)).body.data.map((p: any) => p.id);
      expect(people.every((id: string) => id === rep.id)).toBe(true);
    });

    it.each(['manager role', 'finance role'])('the %s still has no trail', async (who) => {
      await as(who)('get', '/activity-logs').expect(403);
      await as(who)('get', '/activity-logs/category-counts').expect(403);
      await as(who)('get', '/activity-logs/actors').expect(403);
    });

    it('no token, no trail', async () => {
      await as(null)('get', '/activity-logs').expect(401);
    });

    it('someone who is both a sales manager and support keeps the whole trail', async () => {
      expect((await as('both')('get', '/activity-logs').query({ record: hidden }).expect(200)).body.meta.totalItems).toBe(hiddenTypes.length + 2);
    });
  });

  describe('RELEASE-EBI-AUDIT-003 which system this is', () => {
    const original = process.env.NODE_ENV;
    afterAll(() => {
      process.env.NODE_ENV = original;
    });

    it.each(['staging', 'production'])('the trail says it came from %s', async (name) => {
      process.env.NODE_ENV = name;
      const res = await adminGet('/activity-logs', { limit: 1 });
      expect(res.body.environment).toBe(name);
    });
  });

  describe('8 read-only history', () => {
    it.each([
      ['post', '/activity-logs'],
      ['put', `/activity-logs/${randomUUID()}`],
      ['patch', `/activity-logs/${randomUUID()}`],
      ['delete', `/activity-logs/${randomUUID()}`],
    ] as const)('%s %s does not exist', async (method, path) => {
      await as('admin')(method, path).expect(404);
    });

    it('reading and presenting rows changes nothing stored', async () => {
      const fingerprint = async () => (await ds.query(
        `select md5(string_agg(id::text || entity || action || summary || coalesce(old_values::text,'') || coalesce(new_values::text,'') || updated_at::text, ',' order by id)) f from activity_logs`))[0].f;
      const before = await fingerprint();
      await walk({});
      await adminGet('/activity-logs/category-counts');
      await adminGet('/activity-logs/actors');
      expect(await fingerprint()).toBe(before);
    });
  });
});
