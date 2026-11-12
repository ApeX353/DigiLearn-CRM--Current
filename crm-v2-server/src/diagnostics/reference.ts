import { randomBytes } from 'crypto';

/**
 * Crockford base32: no I, L, O or U, so a reference read out over the phone
 * or typed from a screenshot cannot be mis-heard or mis-copied.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const REFERENCE_PREFIX = 'ERR-';
export const REFERENCE_PATTERN = /^ERR-[0-9A-HJKMNP-TV-Z]{6}$/;

/**
 * A short code a user can quote: `ERR-7K3M2Q`. Six base32 characters give
 * about a billion values; the unique index on `system_events.reference`
 * catches the rare collision and the writer retries once with a new code.
 */
export function newReference(): string {
  const bytes = randomBytes(6);
  let out = REFERENCE_PREFIX;
  for (let i = 0; i < 6; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}

/** Accepts what people actually type: lower case, missing dash, stray spaces. */
export function normalizeReference(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, '');
  const withDash = cleaned.startsWith('ERR') && !cleaned.startsWith('ERR-')
    ? `ERR-${cleaned.slice(3)}`
    : cleaned;
  return REFERENCE_PATTERN.test(withDash) ? withDash : null;
}
