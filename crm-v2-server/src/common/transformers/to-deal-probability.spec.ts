import { toDealProbability } from './to-deal-probability';

describe('toDealProbability', () => {
  it('passes whole numbers straight through', () => {
    expect(toDealProbability(25)).toBe(25);
    expect(toDealProbability(0)).toBe(0);
    expect(toDealProbability(100)).toBe(100);
  });

  it('rounds fractional stage probabilities to fit the integer column', () => {
    expect(toDealProbability(25.5)).toBe(26);
    expect(toDealProbability(25.4)).toBe(25);
  });

  it('handles the numeric-as-string values the pg driver returns', () => {
    expect(toDealProbability('25.50')).toBe(26);
    expect(toDealProbability('75.00')).toBe(75);
  });

  it('degrades missing or unparseable input to 0 rather than NaN', () => {
    expect(toDealProbability(null)).toBe(0);
    expect(toDealProbability(undefined)).toBe(0);
    expect(toDealProbability('')).toBe(0);
    expect(toDealProbability('not a number')).toBe(0);
  });
});
