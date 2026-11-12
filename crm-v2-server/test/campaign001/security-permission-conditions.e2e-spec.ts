/**
 * Campaign 001 — F02 permission-condition regression tests.
 *
 * Runs the REAL LeadsModule behind the REAL global guard chain (throttler →
 * ApiKeyGuard → JwtAuthGuard/JwtStrategy → RolesGuard/CASL →
 * PasswordChangeGuard) on the unmodified baseline 5b9c72ce.
 *
 * Expected behaviour is the SECURE behaviour described in
 * docs/technical-lead/001-SECURITY-REPAIR-PLAN.md (F02). Where the baseline
 * is known to fail open, the test is still written against the secure
 * expectation; a red result is the documented defect, not a broken test.
 *
 * Routes under test (both carry @CheckPermission('read','Lead')):
 *   GET /api/v2/leads        — list, scoped by AbilityScopeService
 *   GET /api/v2/leads/:id    — detail, checked by canReadLead
 */
import request from 'supertest';
import { LeadsModule } from '../../src/leads/leads.module';
import { DisposableDatabase } from './support/disposable-db';
import { Fixtures, FixtureUser } from './support/fixtures';
import { TestApp, createTestApp, gatewayStub, schedulerRegistry } from './support/test-app';

const OWN_LEADS = '{"assigned_to":"${id}"}';
const MALFORMED = '{"assigned_to": ${id}'; // unquoted placeholder + missing brace → invalid JSON

describe('F02 — permission conditions (real guards, real CASL, real PostgreSQL)', () => {
  let db: DisposableDatabase;
  let t: TestApp;
  let fx: Fixtures;

  let repA: FixtureUser;
  let repB: FixtureUser;
  let admin: FixtureUser;
  let repMalformed: FixtureUser;
  let repCondManageAll: FixtureUser;
  let repInvertedManageAll: FixtureUser;
  let repMalformedDeny: FixtureUser;
  let repInactive: FixtureUser;

  let tokenA: string;
  let tokenB: string;
  let tokenAdmin: string;

  let leadA1: { id: string; name: string };
  let leadB1: { id: string; name: string };
  let leadM1: { id: string; name: string };

  const list = (token: string) =>
    request(t.http).get('/api/v2/leads').set('Authorization', `Bearer ${token}`);
  const detail = (token: string, id: string) =>
    request(t.http).get(`/api/v2/leads/${id}`).set('Authorization', `Bearer ${token}`);
  const idsOf = (res: request.Response): string[] =>
    (res.body?.data ?? []).map((l: any) => l.id).sort();

  beforeAll(async () => {
    db = await DisposableDatabase.create();
    await db.runMigrations();
    t = await createTestApp(db, [LeadsModule]);
    fx = new Fixtures(t.dataSource, t.jwt);

    // Roles — every grant is explicit and synthetic.
    const scopedRep = await fx.role('rep_scoped', [
      { action: 'read', subject: 'Lead', conditions: OWN_LEADS },
    ]);
    const adminRole = await fx.role('admin_all', [
      { action: 'manage', subject: 'all', conditions: null },
    ]);
    const malformedRep = await fx.role('rep_malformed', [
      { action: 'read', subject: 'Lead', conditions: MALFORMED },
    ]);
    const condManageAll = await fx.role('rep_cond_manage_all', [
      { action: 'manage', subject: 'all', conditions: OWN_LEADS },
    ]);
    const invertedManageAll = await fx.role('rep_inverted_manage_all', [
      { action: 'read', subject: 'Lead', conditions: null },
      { action: 'manage', subject: 'all', conditions: null, inverted: true },
    ]);
    const malformedDeny = await fx.role('rep_malformed_deny', [
      { action: 'read', subject: 'Lead', conditions: null },
      { action: 'read', subject: 'Lead', conditions: MALFORMED, inverted: true },
    ]);

    repA = await fx.user('repA', [scopedRep]);
    repB = await fx.user('repB', [scopedRep]);
    admin = await fx.user('admin', [adminRole]);
    repMalformed = await fx.user('repM', [malformedRep]);
    repCondManageAll = await fx.user('repC', [condManageAll]);
    repInvertedManageAll = await fx.user('repI', [invertedManageAll]);
    repMalformedDeny = await fx.user('repD', [malformedDeny]);
    repInactive = await fx.user('repX', [scopedRep], { isActive: false });

    tokenA = (await fx.bearer(repA)).token;
    tokenB = (await fx.bearer(repB)).token;
    tokenAdmin = (await fx.bearer(admin)).token;

    const school = await fx.school('F02');
    leadA1 = await fx.lead('A1', repA.id, school.id);
    leadB1 = await fx.lead('B1', repB.id, school.id);
    leadM1 = await fx.lead('M1', repMalformed.id, school.id);
  }, 180_000);

  afterAll(async () => {
    if (t) await t.close();
    if (db) await db.drop();
  });

  // ---------------------------------------------------------------- baseline

  describe('harness guarantees inside the running application', () => {
    it('registered no cron jobs, intervals or timeouts (background jobs disabled)', () => {
      expect(schedulerRegistry.getCronJobs().size).toBe(0);
      expect(schedulerRegistry.getIntervals()).toEqual([]);
      expect(schedulerRegistry.getTimeouts()).toEqual([]);
    });

    it('delivered nothing over WebSockets while fixtures were created', () => {
      expect(gatewayStub.calls.filter((c) => c.method !== 'isUserConnected')).toEqual([]);
    });
  });

  describe('authentication (real JwtStrategy against auth_sessions)', () => {
    it('rejects a request without a token', async () => {
      const res = await request(t.http).get('/api/v2/leads');
      expect(res.status).toBe(401);
    });

    it('rejects an expired access token', async () => {
      const session = await fx.session(repA);
      const expired = fx.token(repA, session, { expiresIn: '-10s' });
      const res = await list(expired);
      expect(res.status).toBe(401);
    });

    it('rejects a token whose session has been revoked', async () => {
      const session = await fx.session(repA);
      const token = fx.token(repA, session);
      expect((await list(token)).status).toBe(200);
      await fx.revokeSession(session);
      expect((await list(token)).status).toBe(401);
    });

    it('rejects a token for a session that does not exist', async () => {
      const token = fx.token(repA, { id: '00000000-0000-4000-8000-000000000000', userId: repA.id });
      expect((await list(token)).status).toBe(401);
    });

    it('rejects a deactivated user even with an active session', async () => {
      const { token } = await fx.bearer(repInactive);
      expect((await list(token)).status).toBe(401);
    });

    it('rejects a token signed with a different secret', async () => {
      const session = await fx.session(repA);
      const forged = require('jsonwebtoken').sign(
        { sub: repA.id, email: repA.email, roles: repA.roleNames, sessionId: session.id },
        'not-the-secret',
      );
      expect((await list(forged)).status).toBe(401);
    });
  });

  // -------------------------------------------- scenarios 1-4: valid policy

  describe('two unrelated representatives with valid conditional read permission', () => {
    it('rep A lists only leads assigned to A', async () => {
      const res = await list(tokenA);
      expect(res.status).toBe(200);
      expect(idsOf(res)).toEqual([leadA1.id]);
    });

    it('rep B lists only leads assigned to B', async () => {
      const res = await list(tokenB);
      expect(res.status).toBe(200);
      expect(idsOf(res)).toEqual([leadB1.id]);
    });

    it('rep A can read A1 in detail', async () => {
      const res = await detail(tokenA, leadA1.id);
      expect(res.status).toBe(200);
      expect(res.body?.data?.id).toBe(leadA1.id);
    });

    it('rep A cannot read B1 in detail and the response carries no lead content', async () => {
      const res = await detail(tokenA, leadB1.id);
      expect([403, 404]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toContain(leadB1.name);
    });

    it('rep B cannot read A1 in detail', async () => {
      const res = await detail(tokenB, leadA1.id);
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('legitimate administrator (unconditional manage all)', () => {
    it('lists every lead', async () => {
      const res = await list(tokenAdmin);
      expect(res.status).toBe(200);
      const ids = idsOf(res);
      expect(ids).toEqual(expect.arrayContaining([leadA1.id, leadB1.id, leadM1.id]));
    });

    it('reads any lead in detail', async () => {
      expect((await detail(tokenAdmin, leadB1.id)).status).toBe(200);
    });
  });

  // ------------------------------------------- scenario 5: malformed JSON

  describe('F02 — malformed permission-condition JSON must not widen access', () => {
    it('a rep whose read-Lead condition is malformed JSON does not see other reps’ leads in the list', async () => {
      const { token } = await fx.bearer(repMalformed);
      const res = await list(token);
      // Secure outcomes: a scoped list (own lead only) or an outright refusal.
      if (res.status === 200) {
        const ids = idsOf(res);
        expect(ids).not.toContain(leadA1.id);
        expect(ids).not.toContain(leadB1.id);
      } else {
        expect(res.status).toBe(403);
      }
    });

    it('a rep whose read-Lead condition is malformed JSON cannot read another rep’s lead in detail', async () => {
      const { token } = await fx.bearer(repMalformed);
      const res = await detail(token, leadA1.id);
      expect(res.status).not.toBe(200);
      expect([403, 404]).toContain(res.status);
    });
  });

  // ------------------------------- scenario 6: conditional / inverted manage all

  describe('F02 — conditional and inverted manage/all rules', () => {
    it('a CONDITIONAL manage/all grant is scoped by its condition, not promoted to universal access', async () => {
      const { token } = await fx.bearer(repCondManageAll);
      const res = await list(token);
      if (res.status === 200) {
        const ids = idsOf(res);
        expect(ids).not.toContain(leadA1.id);
        expect(ids).not.toContain(leadB1.id);
      } else {
        expect(res.status).toBe(403);
      }
    });

    it('an INVERTED manage/all rule denies rather than grants', async () => {
      const { token } = await fx.bearer(repInvertedManageAll);
      const res = await list(token);
      expect(res.status).toBe(403);
    });

    it('a malformed DENY rule fails closed (the user gains nothing from the broken deny)', async () => {
      const { token } = await fx.bearer(repMalformedDeny);
      const res = await list(token);
      // Either refusal, or a list that still excludes other reps' leads, is acceptable.
      if (res.status === 200) {
        const ids = idsOf(res);
        expect(ids).not.toContain(leadA1.id);
        expect(ids).not.toContain(leadB1.id);
      } else {
        expect(res.status).toBe(403);
      }
    });
  });
});
