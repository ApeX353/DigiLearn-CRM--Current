// Dev-only helper — resets a rep password
const argon2 = require('@node-rs/argon2');
const { Client } = require('pg');

(async () => {
  const targets = [
    { email: 'rep1@digilearn.com', password: 'Rep1!234' },
    { email: 'rep2@digilearn.com', password: 'Rep2!234' },
  ];
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: process.env.DATABASE_PASSWORD || '7354',
    database: 'digilearn_crm',
  });
  await client.connect();
  for (const t of targets) {
    const hash = await argon2.hash(t.password);
    const res = await client.query(
      `UPDATE account_security
         SET password_hash = $1,
             requires_password_change = false,
             locked_until = NULL,
             failed_login_attempts = 0,
             updated_at = NOW()
       WHERE user_id = (SELECT id FROM users WHERE email = $2)
       RETURNING user_id`,
      [hash, t.email]
    );
    console.log('reset', t.email, '→', t.password, 'rows:', res.rowCount);
  }
  await client.end();
})();
