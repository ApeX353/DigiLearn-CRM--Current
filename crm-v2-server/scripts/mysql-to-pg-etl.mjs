#!/usr/bin/env node
/**
 * MySQL -> PostgreSQL data migration for the DigiLearn CRM takeover.
 *
 * Copies data from the legacy MySQL database (Simba build) into the new
 * PostgreSQL schema (Dube build). The PG schema must already exist — boot the
 * server once (migrations + seeds) before running this.
 *
 * Strategy: introspect both sides, copy every table that exists in BOTH
 * databases, matching columns by name. Tables/columns that only exist in the
 * new schema are left as the migrations/seeds created them. FK order is
 * irrelevant because the load runs with session_replication_role=replica.
 * Seeded rows in copied tables are replaced by the live rows (re-run seeds
 * afterwards by booting the server again — they are idempotent and will
 * re-add any NEW permissions the legacy data doesn't have).
 *
 * Usage (from crm-v2-server/, needs `npm i --no-save mysql2`):
 *   node scripts/mysql-to-pg-etl.mjs [--dry-run]
 *
 * Config via env (defaults = local takeover setup):
 *   MYSQL_HOST/PORT/USER/PASSWORD/DB   (default 127.0.0.1:3306 root '' digilearn_crm_v2_live)
 *   DATABASE_HOST/PORT/USERNAME/PASSWORD/NAME (PG; default 127.0.0.1:5432 postgres/localdev digilearn_crm)
 */
import mysql from 'mysql2/promise';
import pg from 'pg';

const DRY = process.argv.includes('--dry-run');
const BATCH = 500;

const my = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: +(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DB || 'digilearn_crm_v2_live',
  dateStrings: false,
});

const pgc = new pg.Client({
  host: process.env.DATABASE_HOST || '127.0.0.1',
  port: +(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'localdev',
  database: process.env.DATABASE_NAME || 'digilearn_crm',
});
await pgc.connect();

const [myTables] = await my.query(
  `SELECT table_name AS t FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
);
const pgTables = (
  await pgc.query(
    `SELECT table_name AS t FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name <> 'migrations'`,
  )
).rows;

const mySet = new Set(myTables.map((r) => r.t));
const common = pgTables.map((r) => r.t).filter((t) => mySet.has(t));
const onlyMy = [...mySet].filter((t) => !common.includes(t));
const onlyPg = pgTables.map((r) => r.t).filter((t) => !mySet.has(t));

console.log(`Common tables to copy: ${common.length}`);
if (onlyMy.length) console.log(`MySQL-only (NOT copied — verify!): ${onlyMy.join(', ')}`);
if (onlyPg.length) console.log(`PG-only (left to migrations/seeds): ${onlyPg.join(', ')}`);

async function pgColumns(table) {
  const { rows } = await pgc.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return rows;
}

function convert(value, pgType) {
  if (value === null || value === undefined) return null;
  switch (pgType.data_type) {
    case 'boolean':
      if (Buffer.isBuffer(value)) return value[0] === 1;
      return value === 1 || value === '1' || value === true;
    case 'json':
    case 'jsonb': {
      // mysql2 parses native-JSON columns into JS values, so a stored
      // "some text" arrives as a bare string that PG would reject. Only
      // pass strings through when they are already valid JSON text.
      if (typeof value === 'string') {
        try {
          JSON.parse(value);
          return value;
        } catch {
          return JSON.stringify(value);
        }
      }
      return JSON.stringify(value);
    }
    default:
      if (Buffer.isBuffer(value)) return value.toString('utf8');
      return value;
  }
}

const q = (id) => `"${id.replace(/"/g, '""')}"`;
const report = [];
let failed = 0;

if (!DRY) await pgc.query(`SET session_replication_role = replica`);

for (const table of common) {
  const cols = await pgColumns(table);
  const [myCols] = await my.query(
    `SELECT column_name AS c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  const mySetCols = new Set(myCols.map((r) => r.c));
  const shared = cols.filter((c) => mySetCols.has(c.column_name));
  const skippedCols = [...mySetCols].filter(
    (c) => !shared.some((s) => s.column_name === c),
  );

  const [rows] = await my.query(
    `SELECT ${shared.map((c) => `\`${c.column_name}\``).join(', ')} FROM \`${table}\``,
  );
  const [[{ n: myCount }]] = await my.query(`SELECT COUNT(*) n FROM \`${table}\``);

  if (DRY) {
    report.push({ table, rows: myCount, copied: '(dry)', skippedCols: skippedCols.join(',') || '-' });
    continue;
  }

  try {
    await pgc.query('BEGIN');
    await pgc.query(`DELETE FROM ${q(table)}`); // replica mode: no FK checks
    let copied = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      if (!batch.length) break;
      const colNames = shared.map((c) => q(c.column_name)).join(', ');
      const params = [];
      const tuples = batch
        .map((row) => {
          const ph = shared.map((c) => {
            params.push(convert(row[c.column_name], c));
            return `$${params.length}`;
          });
          return `(${ph.join(', ')})`;
        })
        .join(', ');
      await pgc.query(`INSERT INTO ${q(table)} (${colNames}) VALUES ${tuples}`, params);
      copied += batch.length;
    }
    await pgc.query('COMMIT');
    const status = copied === myCount ? 'OK' : 'MISMATCH';
    report.push({ table, rows: myCount, copied, status, skippedCols: skippedCols.join(',') || '-' });
  } catch (err) {
    await pgc.query('ROLLBACK');
    failed++;
    report.push({ table, rows: myCount, copied: 0, status: `FAILED: ${err.message.slice(0, 120)}` });
  }
}

if (!DRY) {
  await pgc.query(`SET session_replication_role = DEFAULT`);
  // Fix any integer sequences (most PKs are UUIDs, but be thorough)
  const { rows: seqCols } = await pgc.query(`
    SELECT table_name, column_name, pg_get_serial_sequence(quote_ident(table_name), column_name) AS seq
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_default LIKE 'nextval%'`);
  for (const s of seqCols.filter((s) => s.seq)) {
    await pgc.query(
      `SELECT setval($1, COALESCE((SELECT MAX(${q(s.column_name)}) FROM ${q(s.table_name)}), 1))`,
      [s.seq],
    );
  }
}

console.table(report);
console.log(failed ? `\n${failed} table(s) FAILED — see above.` : '\nAll tables copied.');
await my.end();
await pgc.end();
process.exit(failed ? 1 : 0);
