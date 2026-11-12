import { newReference, normalizeReference, REFERENCE_PATTERN } from './reference';

describe('reference', () => {
  it('produces ERR- plus six Crockford base32 characters', () => {
    for (let i = 0; i < 200; i++) {
      const ref = newReference();
      expect(ref).toMatch(REFERENCE_PATTERN);
      expect(ref).not.toMatch(/[ILOU]/);
    }
  });

  it('rarely repeats', () => {
    const seen = new Set(Array.from({ length: 5000 }, newReference));
    expect(seen.size).toBeGreaterThan(4990);
  });

  it('accepts what people type', () => {
    expect(normalizeReference('err-7k3m2q')).toBe('ERR-7K3M2Q');
    expect(normalizeReference(' ERR7K3M2Q ')).toBe('ERR-7K3M2Q');
    expect(normalizeReference('ERR-7K3M2Q')).toBe('ERR-7K3M2Q');
    expect(normalizeReference('ERR-7K3M2')).toBeNull();
    expect(normalizeReference('ERR-7K3M2I')).toBeNull();
    expect(normalizeReference('not a ref')).toBeNull();
  });
});
