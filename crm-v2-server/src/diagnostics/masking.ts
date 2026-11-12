/**
 * What may be written into a diagnostics row.
 *
 * Request bodies are stored so a failure can be reproduced, but the store is
 * read by people and kept for 30 days, so: secrets are replaced by key name,
 * personal contact details are partially hidden, and everything is cut to a
 * size that cannot bloat the table (the xlsx import posts up to 25 MB).
 */

const SECRET_KEY = /pass(word)?|passwd|secret|token|authorization|cookie|api[-_]?key|otp|credential|smtp_pass|private[-_]?key|signature/i;
/** Large payload carriers that are never useful in a trace. */
const BULK_KEY = /^(content|file|data|attachment|base64|screenshot|buffer)$/i;

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
/**
 * A phone number is a run of digits with the usual separators. The guards on
 * both sides stop it matching the digit runs inside a uuid or any other hex
 * id ("7b6714fe-aeeb-4756-88e1-…" used to come out as "4756***88"), which
 * broke grouping of repeated errors by record id.
 */
const PHONE = /(?<![0-9A-Za-z-])(\+?\d[\d\s().-]{6,}\d)(?![0-9A-Za-z-])/g;

export const MASKED = '[hidden]';

export interface TruncateOptions {
  /** Longest string kept, in characters. */
  perString: number;
  /** Rough cap on the serialised size of the whole value. */
  total: number;
  /** Deepest nesting kept. */
  depth: number;
  /** Longest array kept. */
  arrayItems: number;
}

export const BODY_LIMITS: TruncateOptions = {
  perString: 2048,
  total: 8192,
  depth: 6,
  arrayItems: 50,
};

export const RESPONSE_LIMITS: TruncateOptions = {
  perString: 2048,
  total: 2048,
  depth: 4,
  arrayItems: 20,
};

export function maskPii(value: string): string {
  return value
    .replace(EMAIL, (_m, first: string, domain: string) => `${first}***${domain}`)
    .replace(PHONE, (m: string) => {
      const digits = m.replace(/\D/g, '');
      if (digits.length < 7) return m;
      return `${m.slice(0, 4)}***${digits.slice(-2)}`;
    });
}

/**
 * Deep-copies `value` with secret keys hidden, bulk keys dropped when large,
 * contact details partially masked and every dimension bounded. Never throws:
 * a value it cannot handle becomes a short placeholder.
 */
export function sanitize(
  value: unknown,
  limits: TruncateOptions = BODY_LIMITS,
): unknown {
  const budget = { left: limits.total };
  try {
    return walk(value, limits, budget, 0);
  } catch {
    return '[unserialisable]';
  }
}

function walk(
  value: unknown,
  limits: TruncateOptions,
  budget: { left: number },
  depth: number,
): unknown {
  if (value === null || value === undefined) return value;
  if (budget.left <= 0) return '[truncated]';

  if (typeof value === 'string') {
    const masked = maskPii(value);
    const cut =
      masked.length > limits.perString
        ? `${masked.slice(0, limits.perString)}…[${masked.length} chars]`
        : masked;
    budget.left -= cut.length;
    return cut;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    budget.left -= 8;
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return `[binary ${value.byteLength} bytes]`;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: maskPii(value.message).slice(0, limits.perString),
    };
  }
  if (depth >= limits.depth) return '[nested]';

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value.slice(0, limits.arrayItems)) {
      out.push(walk(item, limits, budget, depth + 1));
      if (budget.left <= 0) break;
    }
    if (value.length > limits.arrayItems) out.push(`[+${value.length - limits.arrayItems} more]`);
    return out;
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) {
        out[key] = MASKED;
        continue;
      }
      if (BULK_KEY.test(key) && typeof v === 'string' && v.length > limits.perString) {
        out[key] = `[${v.length} chars dropped]`;
        continue;
      }
      out[key] = walk(v, limits, budget, depth + 1);
      if (budget.left <= 0) {
        out['…'] = '[truncated]';
        break;
      }
    }
    return out;
  }
  return String(value);
}

/** Headers worth keeping on a trace, with credentials removed. */
export function sanitizeHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string> {
  const keep = ['user-agent', 'content-type', 'content-length', 'accept', 'origin', 'referer', 'x-request-id', 'x-automation', 'x-forwarded-for'];
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const name of keep) {
    const v = headers[name];
    const s = Array.isArray(v) ? v.join(',') : v;
    if (typeof s === 'string') out[name] = maskPii(s).slice(0, 300);
  }
  return out;
}

/** A phone number or e-mail safe to store as a delivery target. */
export function maskTarget(target: string | null | undefined): string | null {
  if (!target) return null;
  return maskPii(target).slice(0, 120);
}
