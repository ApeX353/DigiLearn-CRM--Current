/**
 * Campaign 001 — explicit test configuration.
 *
 * Supplied to ConfigModule through `load`, with env files ignored. Secrets
 * are generated per run so a token minted in one run can never be valid in
 * another, and no value here resembles a real deployment setting.
 */
import { randomBytes } from 'crypto';

export interface TestConfig {
  NODE_ENV: 'test';
  JWT_SECRET_TOKEN: string;
  JWT_EXPIRATION: string;
  JWT_REFRESH_EXPIRATION: string;
  CRM_API_KEY: string;
  EMAIL_FROM: string;
  CORS_ORIGIN: string;
  CORS_CREDENTIALS: string;
  DB_SYNCHRONIZE: 'false';
  DB_RUN_MIGRATIONS: 'false';
  DB_RUN_SEEDS: 'false';
  DB_LOGGING: 'false';
}

export function buildTestConfig(): TestConfig {
  return {
    NODE_ENV: 'test',
    JWT_SECRET_TOKEN: randomBytes(48).toString('hex'),
    JWT_EXPIRATION: '7',
    JWT_REFRESH_EXPIRATION: '15',
    CRM_API_KEY: randomBytes(24).toString('hex'),
    EMAIL_FROM: 'noreply@test.invalid',
    CORS_ORIGIN: 'http://localhost',
    CORS_CREDENTIALS: 'true',
    DB_SYNCHRONIZE: 'false',
    DB_RUN_MIGRATIONS: 'false',
    DB_RUN_SEEDS: 'false',
    DB_LOGGING: 'false',
  };
}
