/**
 * Campaign 001 — environment guard.
 *
 * The regression harness must never run with the application's real
 * environment. Production and local-dev launchers export DATABASE_*,
 * JWT_SECRET_TOKEN, CRM_API_KEY, SMTP_* and similar variables; if any of
 * them is present in the test process we refuse to start rather than risk
 * a test talking to a real database or signing tokens with a real key.
 *
 * The harness supplies its own configuration through ConfigModule `load`
 * (see test-config.ts) and reads only CRM_TEST_PG_* for the disposable
 * PostgreSQL target.
 */

const FORBIDDEN_PREFIXES = [
  'DATABASE_',
  'DB_',
  'SMTP_',
  'TWILIO_',
  'AWS_',
  'SENDGRID_',
  'BLOB_',
  'CAPROVER_',
];

const FORBIDDEN_KEYS = [
  'JWT_SECRET_TOKEN',
  'JWT_REFRESH_TOKEN',
  'CRM_API_KEY',
  'USER_EMAIL_CREDENTIALS_KEY',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'PORT',
  'CORS_ORIGIN',
];

export class InheritedEnvironmentError extends Error {
  constructor(public readonly offending: string[]) {
    super(
      `Refusing to run: the test process inherited application environment variables (${offending.join(', ')}). ` +
        'Start the tests from a shell that has none of DATABASE_*, DB_*, JWT_*, CRM_API_KEY or mail/SMS settings exported.',
    );
    this.name = 'InheritedEnvironmentError';
  }
}

export function findInheritedAppEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const offending: string[] = [];
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) continue;
    if (FORBIDDEN_KEYS.includes(key)) offending.push(key);
    else if (FORBIDDEN_PREFIXES.some((p) => key.startsWith(p))) offending.push(key);
  }
  if (env.NODE_ENV && env.NODE_ENV !== 'test') {
    offending.push(`NODE_ENV=${env.NODE_ENV}`);
  }
  return offending.sort();
}

export function assertNoInheritedAppEnv(env: NodeJS.ProcessEnv = process.env): void {
  const offending = findInheritedAppEnv(env);
  if (offending.length > 0) {
    throw new InheritedEnvironmentError(offending);
  }
}
