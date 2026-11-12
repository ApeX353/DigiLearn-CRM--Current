import { BODY_LIMITS, MASKED, maskPii, maskTarget, sanitize, sanitizeHeaders } from './masking';

describe('masking', () => {
  it('hides values under secret-looking keys, at any depth', () => {
    const out = sanitize({
      email: 'rep@example.com',
      password: 'hunter2',
      nested: { refresh_token: 'abc', Authorization: 'Bearer x', apiKey: 'k', otp_code: '123456' },
      list: [{ smtp_pass: 'p' }],
    }) as Record<string, unknown>;
    expect(out.password).toBe(MASKED);
    const nested = out.nested as Record<string, unknown>;
    expect(nested.refresh_token).toBe(MASKED);
    expect(nested.Authorization).toBe(MASKED);
    expect(nested.apiKey).toBe(MASKED);
    expect(nested.otp_code).toBe(MASKED);
    expect((out.list as Array<Record<string, unknown>>)[0].smtp_pass).toBe(MASKED);
  });

  it('partially masks e-mail addresses and phone numbers inside strings', () => {
    expect(maskPii('contact kim.mpofu@digilearn.co.zw now')).toBe('contact k***@digilearn.co.zw now');
    expect(maskPii('call +263 77 123 4567 today')).toMatch(/^call \+263\*\*\*67 today$/);
    expect(maskPii('ref 12345')).toBe('ref 12345');
    // record ids are not phone numbers
    const uuidLine = 'Reactivation notify failed (7b6714fe-aeeb-4756-88e1-e299f35d1234): value too long';
    expect(maskPii(uuidLine)).toBe(uuidLine);
    expect(maskPii('call 0772 123 456 now')).toBe('call 0772***56 now');
  });

  it('drops bulk payload fields and truncates long strings', () => {
    const big = 'x'.repeat(10_000);
    const out = sanitize({ content: big, notes: big, small: 'ok' }) as Record<string, unknown>;
    expect(out.content).toBe('[10000 chars dropped]');
    expect(String(out.notes).length).toBeLessThan(BODY_LIMITS.perString + 40);
    expect(String(out.notes)).toContain('[10000 chars]');
    expect(out.small).toBe('ok');
  });

  it('bounds the total size and array length', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ i, text: 'y'.repeat(100) }));
    const out = sanitize({ rows }) as { rows: unknown[] };
    expect(out.rows.length).toBeLessThanOrEqual(BODY_LIMITS.arrayItems + 1);
    expect(JSON.stringify(out).length).toBeLessThan(BODY_LIMITS.total * 2);
  });

  it('never throws on awkward values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => sanitize(circular)).not.toThrow();
    expect(sanitize(Buffer.from('abc'))).toBe('[binary 3 bytes]');
    expect(sanitize(new Error('boom'))).toEqual({ name: 'Error', message: 'boom' });
    expect(sanitize(undefined)).toBeUndefined();
    expect(sanitize(null)).toBeNull();
    expect(sanitize(10n)).toBe('10');
  });

  it('keeps only the safe headers', () => {
    const out = sanitizeHeaders({
      authorization: 'Bearer secret',
      cookie: 'a=b',
      'user-agent': 'Mozilla',
      'x-request-id': 'abc',
    });
    expect(out).toEqual({ 'user-agent': 'Mozilla', 'x-request-id': 'abc' });
  });

  it('masks a delivery target', () => {
    expect(maskTarget('+263771234567')).toMatch(/^\+263\*\*\*67$/);
    expect(maskTarget(null)).toBeNull();
  });
});
