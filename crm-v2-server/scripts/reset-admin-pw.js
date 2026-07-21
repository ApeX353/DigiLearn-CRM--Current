/**
 * Dev-only helper — resets admin@digilearn.com's password to
 * `Admin!234` via argon2 so the test harness can authenticate and
 * exercise the /schools endpoint. NOT shipped.
 */
const argon2 = require('@node-rs/argon2');
const { Client } = require('pg');

async function main() {
  const password = 'Admin!234';
  const hash = await argon2.hash(password);
  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || '7354',
    database: process.env.DATABASE_NAME || 'digilearn_crm',
  });
  await client.connect();
  const res = await client.query(
    `UPDATE account_security
       SET password_hash = $1,
           failed_login_attempts = 0,
           locked_until = NULL,
           requires_password_change = false,
           email_verified = true
     WHERE user_id = (SELECT id FROM users WHERE email = 'admin@digilearn.com')`,
    [hash],
  );
  console.log('rows updated:', res.rowCount, 'password now:', password);
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
