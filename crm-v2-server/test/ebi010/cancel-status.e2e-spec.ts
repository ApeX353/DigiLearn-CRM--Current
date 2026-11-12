/**
 * EBI-FOCUS-001 Fix 1 — cancellation review, refusals and every screen.
 *
 * Each status change moves only the row it names. Cancelling is a manager's
 * decision, a parent with active instalments cannot be cancelled, money in the
 * payment or allocation records blocks the standard cancellation, and a split
 * family says so without relabelling the parent.
 *
 * Requests go through the real DiagnosticsExceptionFilter, because that is what
 * decides whether `code` and `details` reach the client; the harness default would
 * pass them through and prove nothing. Every read uses the route a screen uses, so
 * "refresh" is a fresh GET. Synthetic data on a disposable database.
 */
import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { DealsModule } from '../../src/deals/deals.module';
import { DiagnosticsExceptionFilter } from '../../src/diagnostics/diagnostics-exception.filter';
import { FAMILY_PAYMENTS_MESSAGE, RECORDED_PAYMENTS_MESSAGE } from '../../src/invoices/invoice-money-rules';
import { InvoicesModule } from '../../src/invoices/invoices.module';
import { PaymentsModule } from '../../src/payments/payments.module';
import { PaymentTermsModule } from '../../src/payment-terms/payment-terms.module';
import { QuotesModule } from '../../src/quotes/quotes.module';
import { ReportsModule } from '../../src/reports/reports.module';
import { makeHistoricCancelledInstalment, makeHistoricCancelledParent } from './support/historic-state';
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

const ACTIVE = 'INVOICE_HAS_ACTIVE_INSTALLMENTS';
const PAYMENTS = 'INVOICE_HAS_RECORDED_PAYMENTS';
const INVALID = 'INVALID_INVOICE_STATUS_TRANSITION';
const CONCURRENT = 'INVOICE_MODIFIED_CONCURRENTLY';
const FORBIDDEN = 'INVOICE_UPDATE_FORBIDDEN';
const NOT_FOUND = 'INVOICE_NOT_FOUND';
const PARENT_CANCELLED = 'INVOICE_PARENT_CANCELLED';

describe('EBI-FOCUS-001 Fix 1 — cancellation review, refusals and every screen', () => {
  let db: DisposableDatabase;
  let t: TestApp;
  let fx: Fixtures;
  let ds: DataSource;
  let admin: FixtureUser;
  let rep: FixtureUser;
  let token: string;
  let managerToken: string;
  let repToken: string;
  let otherRepToken: string;
  let schoolId: string;
  let termId: string;
  let leadId: string;
  let pipelineId: string;
  let stageId: string;

  const as = (bearer: string, m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    request(t.http)[m](`/api/v2${path}`).set('Authorization', `Bearer ${bearer}`);
  const api = (m: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => as(token, m, path);
  const line = (total: number) => ({ description: 'synthetic', quantity: 1, unit_price: total, discount: 0, tax_rate: 0 });
  const createdId = (body: any): string => body?.data?.master_invoice?.id ?? body?.data?.id;
  const setStatus = (id: string, status: string, bearer = token) =>
    as(bearer, 'patch', `/invoices/${id}/status`).send({ status });
  const review = (id: string, bearer = token) => as(bearer, 'get', `/invoices/${id}/cancellation-review`);
  const ref = () => `FIX1-${randomUUID().slice(0, 8)}`;
  const pay = (invoiceId: string, amount: number, reference = ref()) =>
    api('post', '/payments').send({ invoice_id: invoiceId, amount, payment_date: '2026-11-02', method: 'Cash', payment_method: 'Cash', reference });

  const newDeal = async (label: string): Promise<string> =>
    (await fx.insertRow('deals', {
      id: randomUUID(), title: `${label} deal`, lead_id: leadId, school_id: schoolId, pipeline_id: pipelineId,
      current_stage_id: stageId, assigned_to: admin.id, value: 7800, currency: 'USD',
    })).id as string;
  const newPlain = async (label: string, dealId: string, total = 1000) =>
    createdId((await api('post', '/invoices')
      .send({ school_id: schoolId, deal_id: dealId, client_name: label, items: [line(total)] }).expect(201)).body);
  const newFamily = async (label: string, dealId: string) => {
    const parentId = createdId((await api('post', '/invoices')
      .send({ school_id: schoolId, deal_id: dealId, client_name: label, payment_term_id: termId, installment_due_dates: agreedDates(2), items: [line(7800)] })
      .expect(201)).body);
    const kids: Array<{ id: string }> = await ds.query(
      `select id from invoices where parent_invoice_id = $1 order by due_date`, [parentId]);
    return { parentId, child1: kids[0].id, child2: kids[1].id };
  };
  const giveToRep = (parentId: string) =>
    ds.query(`update invoices set owner_id = $2 where id = $1 or parent_invoice_id = $1`, [parentId, rep.id]);

  /** One invoice as each screen's route returns it, on a fresh read. */
  const read = async (id: string, dealId: string) => {
    const detail = await api('get', `/invoices/${id}`).expect(200);
    const listed = await api('get', '/invoices').query({ deal_id: dealId, include_children: true, limit: 100 }).expect(200);
    const school = await api('get', '/invoices').query({ school_id: schoolId, include_children: true, limit: 100 }).expect(200);
    const deal = await api('get', `/deals/${dealId}`).expect(200);
    return {
      detail: detail.body.data ?? detail.body,
      list: (listed.body.data as any[]).find((i) => i.id === id),
      school: (school.body.data as any[]).find((i) => i.id === id),
      deal: ((deal.body.data ?? deal.body).invoices as any[]).find((i) => i.id === id),
    };
  };
  const shownOn = async (id: string, dealId: string) => {
    const r = await read(id, dealId);
    return { detail: r.detail.status, list: r.list.status, school: r.school.status, deal: r.deal.status };
  };
  const everywhere = (status: string) => ({ detail: status, list: status, school: status, deal: status });
  const familyOn = async (id: string, dealId: string) => {
    const r = await read(id, dealId);
    return [r.detail.family_summary, r.list.family_summary, r.school.family_summary, r.deal.family_summary];
  };
  const dbRow = async (id: string) =>
    (await ds.query(`select status, payment_status, total::text, amount_paid::text, notes, updated_at from invoices where id = $1`, [id]))[0];
  const dbStatus = async (id: string): Promise<string> => (await dbRow(id)).status;
  const snapshot = (...ids: string[]) => Promise.all(ids.map(dbRow));
  const logCount = async (id: string): Promise<number> =>
    Number((await ds.query(`select count(*) n from activity_logs where entity = 'Invoice' and entity_id = $1`, [id]))[0].n);

  beforeAll(async () => {
    db = await DisposableDatabase.create();
    await db.runMigrations();
    t = await createTestApp(db, [RealErrorFilterModule, PaymentTermsModule, InvoicesModule, QuotesModule, PaymentsModule, ReportsModule, DealsModule]);
    ds = t.dataSource;
    fx = new Fixtures(ds, t.jwt);
    // @Roles matches real names, and fx.role() would suffix them.
    const realRole = async (name: string) => {
      const found: Array<{ id: string }> = await ds.query(`select id from roles where name = $1`, [name]);
      const role = found.length
        ? { id: found[0].id, name }
        : { id: (await fx.insertRow('roles', { name, description: 'fix1', is_active: true, is_system_role: true })).id as string, name };
      return role;
    };
    const adminRole = await realRole('admin');
    await fx.insertRow('role_permissions', { role_id: adminRole.id, permission_id: await fx.permission('manage', 'all') });
    admin = await fx.user('admin', [adminRole]);
    token = (await fx.bearer(admin)).token;
    const managerRole = await realRole('sales_manager');
    const repRole = await realRole('sales_rep');
    for (const role of [managerRole, repRole]) {
      for (const action of ['read', 'update']) {
        await fx.insertRow('role_permissions', { role_id: role.id, permission_id: await fx.permission(action, 'Invoice') });
      }
    }
    managerToken = (await fx.bearer(await fx.user('manager', [managerRole]))).token;
    rep = await fx.user('rep', [repRole]);
    repToken = (await fx.bearer(rep)).token;
    otherRepToken = (await fx.bearer(await fx.user('rep2', [repRole]))).token;
    schoolId = (await fx.school('FIX1')).id;
    termId = (await fx.insertRow('payment_terms', {
      name: 'Buy4Pay2 (synthetic)', type: 'custom', interest_rate: 0, interest_calculation_method: 'none',
      invoice_strategy: 'multiple_invoices', number_of_terms: 2, term_length_days: 30, days_until_due: 30,
      grace_period_days: 0, late_fee_percentage: 0, late_fee_amount: 0, is_active: true, is_default: false, display_order: 1,
    })).id as string;
    leadId = (await fx.lead('FIX1', admin.id, schoolId)).id;
    pipelineId = (await fx.insertRow('pipelines', { name: `fix1 pipeline ${randomUUID().slice(0, 6)}`, is_active: true })).id as string;
    stageId = (await fx.insertRow('stages', { pipeline_id: pipelineId, name: 'Proposal', order: 1, sla_days: 7 })).id as string;
  }, 600_000);

  afterAll(async () => {
    if (t) await t.close();
    if (db) await db.drop();
  });

  // ---- 1
  it('1 a standalone unpaid invoice is cancelled and reads Cancelled on every route', async () => {
    const dealId = await newDeal('plain');
    const id = await newPlain('plain', dealId);
    await setStatus(id, 'Cancelled').expect(200);
    expect(await shownOn(id, dealId)).toEqual(everywhere('Cancelled'));
    expect((await read(id, dealId)).deal.family_summary).toBeNull();
  });

  // ---- 2
  it('2 a parent with active children is blocked with a structured conflict, and nothing moves', async () => {
    const dealId = await newDeal('refuse');
    const { parentId, child1, child2 } = await newFamily('refuse', dealId);
    const before = await snapshot(parentId, child1, child2);
    const res = await setStatus(parentId, 'Cancelled').expect(409);
    expect(res.body.code).toBe(ACTIVE);
    expect(res.body.details.active_instalments).toBe(2);
    expect(res.body.details.total_instalments).toBe(2);
    expect(res.body.details.instalments.map((i: any) => i.status)).toEqual(['Draft', 'Draft']);
    expect(res.body.message).toContain('genuinely not due');
    expect(await snapshot(parentId, child1, child2)).toEqual(before);
  });

  it('2 one live child is enough to block', async () => {
    const dealId = await newDeal('refuse-one');
    const { parentId, child1, child2 } = await newFamily('refuse-one', dealId);
    await setStatus(child1, 'Cancelled').expect(200);
    const res = await setStatus(parentId, 'Cancelled').expect(409);
    expect(res.body.details.active_instalments).toBe(1);
    expect(await dbStatus(parentId)).toBe('Draft');
    expect(await dbStatus(child2)).toBe('Draft');
  });

  it('2 a direct PUT is blocked the same way, and its other fields are not saved', async () => {
    const dealId = await newDeal('put');
    const { parentId, child1 } = await newFamily('put', dealId);
    const before = await snapshot(parentId, child1);
    const res = await api('put', `/invoices/${parentId}`).send({ status: 'Cancelled', notes: 'must not be saved' }).expect(409);
    expect(res.body.code).toBe(ACTIVE);
    expect(await snapshot(parentId, child1)).toEqual(before);
  });

  // ---- 3
  it('3 a parent whose children are all cancelled, with no payments, can be cancelled as its own decision', async () => {
    const dealId = await newDeal('last');
    const { parentId, child1, child2 } = await newFamily('last', dealId);
    await setStatus(child1, 'Cancelled').expect(200);
    await setStatus(child2, 'Cancelled').expect(200);
    expect(await shownOn(parentId, dealId)).toEqual(everywhere('Draft'));
    expect((await read(parentId, dealId)).deal.family_summary).toEqual({ instalments: 2, cancelled: 2 });
    await setStatus(parentId, 'Cancelled').expect(200);
    expect(await shownOn(parentId, dealId)).toEqual(everywhere('Cancelled'));
  });

  // ---- 4
  it('4 a parent whose child holds money is blocked on the required wording and lists that child', async () => {
    const dealId = await newDeal('money');
    const { parentId, child1, child2 } = await newFamily('money', dealId);
    await pay(child1, 1000).expect(201);
    const before = await snapshot(parentId, child1, child2);
    const res = await setStatus(parentId, 'Cancelled').expect(409);
    expect(res.body.code).toBe(PAYMENTS);
    expect(res.body.message).toBe(RECORDED_PAYMENTS_MESSAGE);
    expect(res.body.details.instalments.map((i: any) => i.status)).toEqual(['Partially-Paid']);
    expect(await snapshot(parentId, child1, child2)).toEqual(before);
  });

  it('4 a child holding money is blocked', async () => {
    const dealId = await newDeal('child-money');
    const { child1 } = await newFamily('child-money', dealId);
    await pay(child1, 1000).expect(201);
    const res = await setStatus(child1, 'Cancelled').expect(409);
    expect(res.body.code).toBe(PAYMENTS);
    expect(await dbStatus(child1)).toBe('Partially-Paid');
  });

  it('4 a standalone invoice with a payment is blocked', async () => {
    const dealId = await newDeal('plain-money');
    const id = await newPlain('plain-money', dealId, 7800);
    await pay(id, 3900).expect(201);
    const res = await setStatus(id, 'Cancelled').expect(409);
    expect(res.body.code).toBe(PAYMENTS);
    expect(await dbRow(id)).toEqual(expect.objectContaining({ status: 'Partially-Paid', amount_paid: '3900.00' }));
  });

  it('4 a payment record blocks cancellation when every cached figure reads zero', async () => {
    const dealId = await newDeal('stale-payment');
    const { child1 } = await newFamily('stale-payment', dealId);
    await fx.payment(child1, 500); // a lagging cache, as on production: the row exists, amount_paid is 0
    expect((await dbRow(child1)).amount_paid).toBe('0.00');
    const res = await setStatus(child1, 'Cancelled').expect(409);
    expect(res.body.code).toBe(PAYMENTS);
    expect(await dbStatus(child1)).toBe('Draft');
  });

  it('4 an allocation record blocks cancellation when the payment sits on another invoice', async () => {
    const dealId = await newDeal('stale-allocation');
    const { child1, child2 } = await newFamily('stale-allocation', dealId);
    const payment = await fx.payment(child2, 500);
    const [installment] = await ds.query(`select id from installments where invoice_id = $1`, [child1]);
    await fx.insertRow('payment_allocations', {
      payment_id: payment.id, installment_id: installment.id, allocated_amount: 500, allocation_order: 1, allocation_date: '2026-11-02',
    });
    const res = await setStatus(child1, 'Cancelled').expect(409);
    expect(res.body.code).toBe(PAYMENTS);
    expect(await dbStatus(child1)).toBe('Draft');
  });

  it('4 a parent with a stale zero is still blocked by its child records', async () => {
    const dealId = await newDeal('stale-parent');
    const { parentId, child1, child2 } = await newFamily('stale-parent', dealId);
    await pay(child1, 1000).expect(201);
    await ds.query(`update invoices set amount_paid = 0 where id = $1`, [parentId]); // a lagging cache
    const res = await setStatus(parentId, 'Cancelled').expect(409);
    expect(res.body.code).toBe(PAYMENTS);
    expect(await dbStatus(child2)).toBe('Draft');
  });

  it('4 a cancelled instalment refuses a payment while its live sibling still accepts one', async () => {
    const dealId = await newDeal('pay-after');
    const { child1, child2 } = await newFamily('pay-after', dealId);
    await setStatus(child1, 'Cancelled').expect(200);
    await pay(child1, 100).expect(400);
    await pay(child2, 100).expect(201);
  });

  // ---- 5
  it('5 cancelling one child changes only that row, its audit trail and no amount', async () => {
    const dealId = await newDeal('one');
    const { parentId, child1, child2 } = await newFamily('one', dealId);
    const before = await snapshot(parentId, child2);
    const logs = [await logCount(parentId), await logCount(child1), await logCount(child2)];
    const total = (await dbRow(child1)).total;
    await setStatus(child1, 'Cancelled').expect(200);
    expect(await shownOn(child1, dealId)).toEqual(everywhere('Cancelled'));
    expect(await snapshot(parentId, child2)).toEqual(before);
    expect([await logCount(parentId), await logCount(child1), await logCount(child2)]).toEqual([logs[0], logs[1] + 1, logs[2]]);
    expect((await dbRow(child1)).total).toBe(total);
  });

  it('5 the parent keeps its status and every route reports the split separately', async () => {
    const dealId = await newDeal('split');
    const { parentId, child1, child2 } = await newFamily('split', dealId);
    await setStatus(child1, 'Cancelled').expect(200);
    expect(await shownOn(parentId, dealId)).toEqual(everywhere('Draft'));
    expect(await shownOn(child2, dealId)).toEqual(everywhere('Draft'));
    const split = { instalments: 2, cancelled: 1 };
    expect(await familyOn(parentId, dealId)).toEqual([split, split, split, split]);
    const top = await api('get', '/invoices').query({ deal_id: dealId, limit: 100 }).expect(200);
    expect((top.body.data as any[]).map((i) => [i.id, i.status, i.family_summary])).toEqual([[parentId, 'Draft', split]]);
  });

  it('5 an instalment reports its parent status separately from its own', async () => {
    const dealId = await newDeal('own');
    const { parentId, child1 } = await newFamily('own', dealId);
    await makeHistoricCancelledParent(ds, parentId);
    const r = await read(child1, dealId);
    expect([r.deal.status, r.deal.parent_status]).toEqual(['Draft', 'Cancelled']);
    expect([r.detail.status, r.detail.parent_status]).toEqual(['Draft', 'Cancelled']);
  });

  // ---- 6
  it('6 reopening a parent does not revive its cancelled children', async () => {
    const dealId = await newDeal('reopen');
    const { parentId, child1, child2 } = await newFamily('reopen', dealId);
    await setStatus(child1, 'Cancelled').expect(200);
    await setStatus(child2, 'Cancelled').expect(200);
    await setStatus(parentId, 'Cancelled').expect(200);
    await setStatus(parentId, 'Draft').expect(200);
    expect(await shownOn(parentId, dealId)).toEqual(everywhere('Draft'));
    expect(await shownOn(child1, dealId)).toEqual(everywhere('Cancelled'));
    expect(await shownOn(child2, dealId)).toEqual(everywhere('Cancelled'));
    await setStatus(child1, 'Draft').expect(200); // its own explicit request
    expect(await dbStatus(child2)).toBe('Cancelled');
  });

  it('6 reopening a child under a cancelled parent is refused on both routes', async () => {
    const dealId = await newDeal('reopen-child');
    const { parentId, child1, child2 } = await newFamily('reopen-child', dealId);
    await setStatus(child1, 'Cancelled').expect(200);
    await setStatus(child2, 'Cancelled').expect(200);
    await setStatus(parentId, 'Cancelled').expect(200);
    const res = await setStatus(child1, 'Draft').expect(409);
    expect(res.body.code).toBe(INVALID);
    expect(res.body.message).toContain('Reopen the parent first');
    await api('put', `/invoices/${child1}`).send({ status: 'Sent' }).expect(409);
    expect(await dbStatus(child1)).toBe('Cancelled');
  });

  // ---- 7
  it('7 a receipt landing while a cancellation waits for the row is seen, and the cancellation is refused', async () => {
    const dealId = await newDeal('race-held');
    const { child1 } = await newFamily('race-held', dealId);
    const held = ds.createQueryRunner();
    await held.connect();
    await held.startTransaction();
    try {
      await held.query(`select id from invoices where id = $1 for update`, [child1]);
      const cancelling = setStatus(child1, 'Cancelled').then((r) => r);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await held.query(`update invoices set amount_paid = 500, status = 'Partially-Paid' where id = $1`, [child1]);
      await held.commitTransaction();
      const res = await cancelling;
      expect(res.status).toBe(409);
      expect(res.body.code).toBe(PAYMENTS);
      expect(await dbStatus(child1)).toBe('Partially-Paid');
    } finally {
      await held.release();
    }
  });

  it('7 a receipt racing a cancellation never leaves money on a cancelled row', async () => {
    for (let i = 0; i < 5; i++) {
      const dealId = await newDeal(`race-${i}`);
      const { parentId, child1 } = await newFamily(`race-${i}`, dealId);
      const [cancel, payment] = await Promise.all([setStatus(child1, 'Cancelled'), pay(child1, 500)]);
      expect(cancel.status).toBeLessThan(500);
      expect(payment.status).toBeLessThan(500);
      const row = await dbRow(child1);
      expect(row.status === 'Cancelled' && Number(row.amount_paid) > 0).toBe(false);
      expect((await dbRow(parentId)).status).not.toBe('Cancelled');
    }
  });

  it('7 cancelling a parent racing the reopening of a child never leaves a live child under it', async () => {
    for (let i = 0; i < 5; i++) {
      const dealId = await newDeal(`race-family-${i}`);
      const { parentId, child1, child2 } = await newFamily(`race-family-${i}`, dealId);
      await setStatus(child1, 'Cancelled').expect(200);
      await setStatus(child2, 'Cancelled').expect(200);
      const [cancel, reopen] = await Promise.all([setStatus(parentId, 'Cancelled'), setStatus(child2, 'Draft')]);
      expect(cancel.status).toBeLessThan(500);
      expect(reopen.status).toBeLessThan(500);
      expect(await dbStatus(parentId) === 'Cancelled' && await dbStatus(child2) !== 'Cancelled').toBe(false);
    }
  });

  it('7 a screen acting on a stale status is refused, and nothing is saved', async () => {
    const dealId = await newDeal('stale-screen');
    const id = await newPlain('stale-screen', dealId);
    await setStatus(id, 'Sent').expect(200);
    const res = await api('patch', `/invoices/${id}/status`).send({ status: 'Cancelled', expected_status: 'Draft' }).expect(409);
    expect(res.body.code).toBe(CONCURRENT);
    expect(res.body.details.current_status).toBe('Sent');
    expect(await dbStatus(id)).toBe('Sent');
  });

  // ---- 8
  it('8 a rep cannot cancel by direct API even on their own invoice, and sees no financial detail', async () => {
    const dealId = await newDeal('rep');
    const { parentId, child1 } = await newFamily('rep', dealId);
    await giveToRep(parentId);
    await pay(child1, 1000).expect(201);
    const before = await snapshot(parentId, child1);
    for (const res of [
      await setStatus(parentId, 'Cancelled', repToken),
      await setStatus(child1, 'Cancelled', repToken),
      await as(repToken, 'put', `/invoices/${parentId}`).send({ status: 'Cancelled' }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(FORBIDDEN);
      expect(res.body.details).toBeUndefined();
      expect(res.body.message).not.toMatch(/INV-|payment|\d/);
    }
    expect(await snapshot(parentId, child1)).toEqual(before);
  });

  it('8 a rep cannot read the review, and another rep invoice is refused on the same code', async () => {
    const dealId = await newDeal('rep-review');
    const { parentId } = await newFamily('rep-review', dealId);
    await giveToRep(parentId);
    await review(parentId, repToken).expect(403);
    const other = await as(otherRepToken, 'patch', `/invoices/${parentId}/status`).send({ status: 'Sent' }).expect(403);
    expect(other.body.code).toBe(FORBIDDEN);
    expect(other.body.details).toBeUndefined();
  });

  // ---- 9
  it('9 a sales manager can cancel, and only the row named moves', async () => {
    const dealId = await newDeal('manager');
    const { parentId, child1, child2 } = await newFamily('manager', dealId);
    const plain = await newPlain('manager-plain', dealId);
    await setStatus(plain, 'Cancelled', managerToken).expect(200);
    await setStatus(child1, 'Cancelled', managerToken).expect(200);
    expect(await dbStatus(plain)).toBe('Cancelled');
    expect(await dbStatus(child2)).toBe('Draft');
    expect(await dbStatus(parentId)).toBe('Draft');
  });

  // ---- Decision 1: money anywhere in the payment plan
  const moneyOn = async (invoiceId: string) => fx.payment(invoiceId, 500);
  const allocate = async (paymentId: string, invoiceId: string) => {
    const [installment] = await ds.query(`select id from installments where invoice_id = $1`, [invoiceId]);
    await fx.insertRow('payment_allocations', {
      payment_id: paymentId, installment_id: installment.id, allocated_amount: 500, allocation_order: 1, allocation_date: '2026-11-02',
    });
  };
  const expectFamilyRefusal = (res: request.Response) => {
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(PAYMENTS);
    expect(res.body.message).toBe(FAMILY_PAYMENTS_MESSAGE);
  };

  it('D1 an unpaid child is refused when its sibling has a payment, naming that sibling', async () => {
    const dealId = await newDeal('sibling');
    const { parentId, child1, child2 } = await newFamily('sibling', dealId);
    await pay(child2, 1000).expect(201);
    const before = await snapshot(parentId, child1, child2);
    const res = await setStatus(child1, 'Cancelled');
    expectFamilyRefusal(res);
    expect(res.body.details.instalments.map((i: any) => i.status)).toEqual(['Partially-Paid']);
    expect(await snapshot(parentId, child1, child2)).toEqual(before);
  });

  it('D1 sibling money counts when only the payment record shows it', async () => {
    const dealId = await newDeal('sibling-record');
    const { child1, child2 } = await newFamily('sibling-record', dealId);
    await moneyOn(child2);
    expect((await dbRow(child2)).amount_paid).toBe('0.00');
    expectFamilyRefusal(await setStatus(child1, 'Cancelled'));
    expect(await dbStatus(child1)).toBe('Draft');
  });

  it('D1 sibling money counts when only an allocation shows it', async () => {
    const dealId = await newDeal('sibling-allocation');
    const { child1, child2 } = await newFamily('sibling-allocation', dealId);
    const elsewhere = await newPlain('elsewhere', dealId);
    await allocate((await moneyOn(elsewhere)).id, child2);
    expectFamilyRefusal(await setStatus(child1, 'Cancelled'));
    expect(await dbStatus(child1)).toBe('Draft');
  });

  it('D1 money on a sibling that is itself cancelled still counts', async () => {
    const dealId = await newDeal('sibling-cancelled');
    const { child1, child2 } = await newFamily('sibling-cancelled', dealId);
    await moneyOn(child2);
    await makeHistoricCancelledInstalment(ds, child2);
    expectFamilyRefusal(await setStatus(child1, 'Cancelled'));
  });

  it('D1 a direct PUT is refused the same way, and its other fields are not saved', async () => {
    const dealId = await newDeal('sibling-put');
    const { child1, child2 } = await newFamily('sibling-put', dealId);
    await pay(child2, 1000).expect(201);
    const before = await dbRow(child1);
    expectFamilyRefusal(await api('put', `/invoices/${child1}`).send({ status: 'Cancelled', notes: 'must not be saved' }));
    expect(await dbRow(child1)).toEqual(before);
  });

  it('D1 the review tells the manager the same thing before they try', async () => {
    const dealId = await newDeal('sibling-review');
    const { child1, child2 } = await newFamily('sibling-review', dealId);
    await pay(child2, 1000).expect(201);
    const { body: { data } } = await review(child1).expect(200);
    const write = await setStatus(child1, 'Cancelled');
    expect(data.blocked.code).toBe(write.body.code);
    expect(data.blocked.message).toBe(write.body.message);
    expect(data.blocked.details).toEqual(write.body.details);
  });

  it('D1 an unpaid child is still cancellable when nothing in the plan holds money', async () => {
    const dealId = await newDeal('sibling-clean');
    const { child1, child2 } = await newFamily('sibling-clean', dealId);
    await setStatus(child1, 'Cancelled').expect(200);
    expect(await dbStatus(child2)).toBe('Draft');
  });

  it('D1 a receipt on a sibling landing while the cancellation waits is seen, and it is refused', async () => {
    const dealId = await newDeal('sibling-held');
    const { child1, child2 } = await newFamily('sibling-held', dealId);
    const held = ds.createQueryRunner();
    await held.connect();
    await held.startTransaction();
    try {
      await held.query(`select id from invoices where id = $1 for update`, [child2]);
      const cancelling = setStatus(child1, 'Cancelled').then((r) => r);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await held.query(`update invoices set amount_paid = 500, status = 'Partially-Paid' where id = $1`, [child2]);
      await held.commitTransaction();
      expectFamilyRefusal(await cancelling);
      expect(await dbStatus(child1)).toBe('Draft');
    } finally {
      await held.release();
    }
  });

  it('D1 a cancellation holding the family makes a sibling receipt wait, so neither is lost', async () => {
    for (let i = 0; i < 5; i++) {
      const dealId = await newDeal(`sibling-race-${i}`);
      const { child1, child2 } = await newFamily(`sibling-race-${i}`, dealId);
      const [cancel, payment] = await Promise.all([setStatus(child1, 'Cancelled'), pay(child2, 500)]);
      expect([200, 409]).toContain(cancel.status);
      expect(payment.status).toBe(201);
      expect(await dbStatus(child1)).toBe(cancel.status === 200 ? 'Cancelled' : 'Draft');
      expect((await dbRow(child2)).amount_paid).toBe('500.00');
    }
  });

  // ---- payments under a cancelled parent
  const paymentCount = async (id: string) =>
    Number((await ds.query(`select count(*) n from payments where invoice_id = $1`, [id]))[0].n);

  it('P1 a payment on a live child of a cancelled parent is refused, and nothing is recorded', async () => {
    const dealId = await newDeal('under');
    const { parentId, child1 } = await newFamily('under', dealId);
    await makeHistoricCancelledParent(ds, parentId);
    const before = await snapshot(parentId, child1);
    const commandCount = async () => (await ds.query(`select count(*)::int n from payment_commands`))[0].n;
    const commandsBefore = await commandCount();
    const res = await pay(child1, 100).expect(409);
    expect(res.body.code).toBe(PARENT_CANCELLED);
    expect(await snapshot(parentId, child1)).toEqual(before);
    expect(await paymentCount(child1)).toBe(0);
    expect(await commandCount()).toBe(commandsBefore);
  });

  it('P1 a rep on their own invoice is refused the same way by direct API', async () => {
    const dealId = await newDeal('under-rep');
    const { parentId, child1 } = await newFamily('under-rep', dealId);
    await giveToRep(parentId);
    await makeHistoricCancelledParent(ds, parentId);
    const res = await as(repToken, 'post', '/payments')
      .send({ invoice_id: child1, amount: 100, payment_date: '2026-11-02', method: 'Cash', payment_method: 'Cash', reference: ref() })
      .expect(409);
    expect(res.body.code).toBe(PARENT_CANCELLED);
    expect(await paymentCount(child1)).toBe(0);
  });

  it('P1 editing a receipt amount there is refused, and editing its notes is not', async () => {
    const dealId = await newDeal('under-edit');
    const { parentId, child1 } = await newFamily('under-edit', dealId);
    const created = await pay(child1, 500).expect(201);
    await makeHistoricCancelledParent(ds, parentId);
    const id = created.body.data?.id ?? created.body.id;
    const res = await api('put', `/payments/${id}`).send({ amount: 700 }).expect(409);
    expect(res.body.code).toBe(PARENT_CANCELLED);
    await api('put', `/payments/${id}`).send({ notes: 'a note' }).expect(200);
    const [row] = await ds.query(`select amount::text from payments where id = $1`, [id]);
    expect(row.amount).toBe('500.00');
  });

  it('P1 manually allocating a receipt there is refused, and nothing is allocated', async () => {
    const dealId = await newDeal('under-allocate');
    const { parentId, child1 } = await newFamily('under-allocate', dealId);
    const payment = await fx.payment(child1, 500);
    await makeHistoricCancelledParent(ds, parentId);
    const res = await api('post', `/payment-terms/allocate/${payment.id}`).expect(409);
    expect(res.body.code).toBe(PARENT_CANCELLED);
    const [{ n }] = await ds.query(`select count(*)::int n from payment_allocations where payment_id = $1`, [payment.id]);
    expect(n).toBe(0);
  });

  it('P1 a correction stays possible: a manager can still remove that receipt', async () => {
    const dealId = await newDeal('under-remove');
    const { parentId, child1 } = await newFamily('under-remove', dealId);
    const created = await pay(child1, 500).expect(201);
    await makeHistoricCancelledParent(ds, parentId);
    await api('delete', `/payments/${created.body.data?.id ?? created.body.id}`).expect(200);
    expect(await paymentCount(child1)).toBe(0);
  });

  it('P1 a live family is unaffected: payment records and allocates', async () => {
    const dealId = await newDeal('live-family');
    const { child1 } = await newFamily('live-family', dealId);
    await pay(child1, 500).expect(201);
    expect((await dbRow(child1)).amount_paid).toBe('500.00');
    const [{ n }] = await ds.query(`select count(*)::int n from payment_allocations a join payments p on p.id = a.payment_id where p.invoice_id = $1`, [child1]);
    expect(n).toBeGreaterThan(0);
  });

  // ---- other codes
  it('an unknown invoice answers INVOICE_NOT_FOUND on every route', async () => {
    const missing = randomUUID();
    for (const res of [
      await setStatus(missing, 'Cancelled'),
      await api('put', `/invoices/${missing}`).send({ status: 'Cancelled' }),
      await review(missing),
      await api('get', `/invoices/${missing}`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(NOT_FOUND);
    }
  });

  it('a status that contradicts the money is an invalid transition', async () => {
    const dealId = await newDeal('invalid');
    const id = await newPlain('invalid', dealId);
    const paid = await setStatus(id, 'Paid').expect(409);
    expect(paid.body.code).toBe(INVALID);
    const partial = await setStatus(id, 'Partially-Paid').expect(409);
    expect(partial.body.code).toBe(INVALID);
    expect(await dbStatus(id)).toBe('Draft');
  });

  it('a status that does not exist is refused as malformed, with the same code', async () => {
    const dealId = await newDeal('garbage');
    const id = await newPlain('garbage', dealId);
    const res = await setStatus(id, 'Written-Off').expect(400);
    expect(res.body.code).toBe(INVALID);
  });

  // ---- the review the manager sees
  it('the review shows a child with its parent and siblings, and permits cancelling only that child', async () => {
    const dealId = await newDeal('review-child');
    const { parentId, child1, child2 } = await newFamily('review-child', dealId);
    await setStatus(child2, 'Cancelled').expect(200);
    const { body: { data } } = await review(child1).expect(200);
    expect(data.invoice.id).toBe(child1);
    expect(data.parent.id).toBe(parentId);
    expect(data.instalments.map((i: any) => [i.id, i.status])).toEqual([[child1, 'Draft'], [child2, 'Cancelled']]);
    expect([data.active_instalments, data.total_instalments]).toEqual([1, 2]);
    expect(data.blocked).toBeNull();
  });

  it('the review of a parent reports the same refusal the write gives, and changes nothing', async () => {
    const dealId = await newDeal('review-parent');
    const { parentId, child1, child2 } = await newFamily('review-parent', dealId);
    const before = await snapshot(parentId, child1, child2);
    const { body: { data } } = await review(parentId).expect(200);
    const write = await setStatus(parentId, 'Cancelled').expect(409);
    expect(data.blocked.code).toBe(write.body.code);
    expect(data.blocked.message).toBe(write.body.message);
    expect(data.blocked.details).toEqual(write.body.details);
    expect(await snapshot(parentId, child1, child2)).toEqual(before);
  });

  it('the review of a paid invoice carries the required wording', async () => {
    const dealId = await newDeal('review-paid');
    const id = await newPlain('review-paid', dealId, 7800);
    await pay(id, 3900).expect(201);
    const { body: { data } } = await review(id).expect(200);
    expect(data.blocked.code).toBe(PAYMENTS);
    expect(data.blocked.message).toBe(RECORDED_PAYMENTS_MESSAGE);
    expect(data.parent).toBeNull();
  });
});
