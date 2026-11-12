/**
 * Campaign 001 — harness self-test.
 *
 * Proves the isolation rules before any application code is exercised:
 *  - inherited application environment is refused;
 *  - non-loopback hosts and non-harness database names are refused;
 *  - a disposable PostgreSQL 16 database is created, the application's own
 *    migrations run on it under explicit control, and it is dropped.
 */
import { Client } from 'pg';
import {
  DisposableDatabase,
  UnsafeDatabaseTargetError,
  assertDisposableName,
  assertLoopbackHost,
  assertServerIsLocal,
  readAdminTarget,
} from './support/disposable-db';
import { InheritedEnvironmentError, assertNoInheritedAppEnv, findInheritedAppEnv } from './support/env-guard';

describe('campaign001 harness: isolation rules', () => {
  it('refuses to start when application environment variables are inherited', () => {
    const polluted = { ...process.env, DATABASE_HOST: 'db.internal', JWT_SECRET_TOKEN: 'x' };
    expect(findInheritedAppEnv(polluted)).toEqual(['DATABASE_HOST', 'JWT_SECRET_TOKEN']);
    expect(() => assertNoInheritedAppEnv(polluted)).toThrow(InheritedEnvironmentError);
  });

  it('refuses NODE_ENV other than test', () => {
    expect(findInheritedAppEnv({ NODE_ENV: 'production' })).toEqual(['NODE_ENV=production']);
  });

  it('the current test process itself carries no application environment', () => {
    expect(findInheritedAppEnv(process.env)).toEqual([]);
  });

  it('refuses a non-loopback database host', () => {
    expect(() => assertLoopbackHost('db.example.internal')).toThrow(UnsafeDatabaseTargetError);
    expect(() => assertLoopbackHost('10.0.0.5')).toThrow(UnsafeDatabaseTargetError);
    expect(() => assertLoopbackHost('127.0.0.1')).not.toThrow();
  });

  it('refuses database names it did not generate (operational and local-dev names)', () => {
    for (const name of ['digilearn_crm', 'postgres', 'crm_test', 'crm_test_prod', 'digilearn_crm_v2_live']) {
      expect(() => assertDisposableName(name)).toThrow(UnsafeDatabaseTargetError);
    }
    expect(() => assertDisposableName('crm_test_20261023_120000_0a1b2c')).not.toThrow();
  });

  it('refuses to read an admin password from DATABASE_PASSWORD or a default', () => {
    expect(() => readAdminTarget({ CRM_TEST_PG_HOST: '127.0.0.1' })).toThrow(UnsafeDatabaseTargetError);
    expect(() =>
      readAdminTarget({ CRM_TEST_PG_HOST: 'db.remote', CRM_TEST_PG_ADMIN_PASSWORD: 'x' }),
    ).toThrow(UnsafeDatabaseTargetError);
  });
});

describe('campaign001 harness: disposable PostgreSQL 16 database', () => {
  let db: DisposableDatabase;

  afterAll(async () => {
    if (db) await db.drop();
  });

  it('creates an empty database on the loopback PG16 server', async () => {
    db = await DisposableDatabase.create();
    expect(db.name).toMatch(/^crm_test_/);
    expect(db.serverVersion.startsWith('16.')).toBe(true);
  });

  it('production-isolation gate: the server itself reports a loopback address and a local data directory', () => {
    expect(['127.0.0.1', '::1', 'localhost']).toContain(db.serverIdentity.server_addr?.replace(/\/\d+$/, ''));
    expect(db.serverIdentity.data_directory).toMatch(/^([A-Za-z]:[\\/]|\/)/);
    expect(db.serverIdentity.data_directory.startsWith('\\\\')).toBe(false);
    // Record the evidence in the test output for the run log.
    // eslint-disable-next-line no-console
    process.stdout.write(
      `[campaign001 gate] server=${db.serverIdentity.server_addr}:${db.serverIdentity.server_port} ` +
        `data_directory=${db.serverIdentity.data_directory} version=${db.serverVersion} database=${db.name}\n`,
    );
  });

  it('production-isolation gate: a server that reports a non-loopback address or network data directory is refused', () => {
    expect(() =>
      assertServerIsLocal({ server_addr: '10.0.0.8', server_port: 5432, data_directory: '/var/lib/postgresql/data', listen_addresses: '*' }),
    ).toThrow(UnsafeDatabaseTargetError);
    expect(() =>
      assertServerIsLocal({ server_addr: '127.0.0.1', server_port: 5433, data_directory: '\\\\nas\\pgdata', listen_addresses: '*' }),
    ).toThrow(UnsafeDatabaseTargetError);
    expect(() =>
      assertServerIsLocal({ server_addr: null, server_port: null, data_directory: 'C:/x', listen_addresses: '*' }),
    ).toThrow(UnsafeDatabaseTargetError);
  });

  it('runs every application migration on the empty database under explicit control', async () => {
    const executed = await db.runMigrations();
    expect(executed.length).toBeGreaterThanOrEqual(37);
    expect(executed[0]).toMatch(/^InitialSchema/);
    expect(executed[executed.length - 1]).toMatch(/^FinanceConstraints/);
    const applied = await db.appliedMigrationNames();
    expect(applied).toEqual(executed);
  });

  it('left the schema with the finance constraints production received on 21 Oct', async () => {
    const client = new Client({ ...db.target, database: db.name });
    await client.connect();
    try {
      const rows = await client.query<{ conname: string }>(
        `select conname from pg_constraint where conname in
           ('payments_invoice_fk','payments_amount_positive',
            'installments_invoice_fk','installments_amounts_nonnegative','invoices_amounts_nonnegative',
            'payment_allocations_amount_positive')
         order by conname`,
      );
      expect(rows.rows.map((r) => r.conname)).toEqual([
        'installments_amounts_nonnegative',
        'installments_invoice_fk',
        'invoices_amounts_nonnegative',
        'payment_allocations_amount_positive',
        'payments_amount_positive',
        'payments_invoice_fk',
      ]);
      // The one-reference-per-invoice rule is a unique index, not a constraint.
      const idx = await client.query('select 1 from pg_indexes where indexname = $1', ['payments_invoice_reference_uq']);
      expect(idx.rowCount).toBe(1);
    } finally {
      await client.end();
    }
  });

  it('drops only its own database', async () => {
    const name = db.name;
    await db.drop();
    const target = readAdminTarget();
    const client = new Client({ ...target, database: target.maintenanceDb });
    await client.connect();
    try {
      const gone = await client.query('select 1 from pg_database where datname = $1', [name]);
      expect(gone.rowCount).toBe(0);
      const others = await client.query<{ n: string }>(
        `select count(*)::text as n from pg_database where datname not like 'crm_test_%' and not datistemplate`,
      );
      expect(Number(others.rows[0].n)).toBeGreaterThanOrEqual(1);
    } finally {
      await client.end();
    }
  });
});
