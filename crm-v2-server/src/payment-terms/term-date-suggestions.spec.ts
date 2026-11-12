import {
  DEFAULT_TERM_DATES,
  parseTermDateDefaults,
  suggestTermDates,
} from './term-date-suggestions';

describe('term date suggestions (EBI-FOCUS-001)', () => {
  it('starts from the next term after today, in the following year when needed', () => {
    expect(suggestTermDates(2, '2026-11-02')).toEqual(['2027-01-31', '2027-05-31']);
  });

  it('stays in this year while terms remain', () => {
    expect(suggestTermDates(2, '2027-03-01')).toEqual(['2027-05-31', '2027-09-30']);
  });

  it('counts a term falling today', () => {
    expect(suggestTermDates(1, '2027-05-31')).toEqual(['2027-05-31']);
  });

  it('moves on the day after a term', () => {
    expect(suggestTermDates(1, '2027-06-01')).toEqual(['2027-09-30']);
  });

  it('rolls over the year for a long plan', () => {
    expect(suggestTermDates(6, '2026-11-02')).toEqual([
      '2027-01-31', '2027-05-31', '2027-09-30',
      '2028-01-31', '2028-05-31', '2028-09-30',
    ]);
  });

  it('never generates a day the month does not have', () => {
    expect(DEFAULT_TERM_DATES.find((t) => t.month === 9)?.day).toBe(30);
    expect(suggestTermDates(1, '2027-08-01', [{ month: 9, day: 31 }])).toEqual(['2027-09-30']);
    expect(suggestTermDates(1, '2027-01-01', [{ month: 2, day: 31 }])).toEqual(['2027-02-28']);
    expect(suggestTermDates(1, '2028-01-01', [{ month: 2, day: 31 }])).toEqual(['2028-02-29']);
  });

  it('runs in order whatever order the setting lists them', () => {
    expect(suggestTermDates(2, '2027-01-01', [{ month: 9, day: 30 }, { month: 3, day: 1 }]))
      .toEqual(['2027-03-01', '2027-09-30']);
  });

  it('suggests nothing for no instalments', () => {
    expect(suggestTermDates(0, '2026-11-02')).toEqual([]);
  });

  it('reads a configured list, and falls back on anything unusable', () => {
    const configured = [{ month: 2, day: 15 }];
    expect(parseTermDateDefaults(JSON.stringify(configured))).toEqual(configured);
    expect(parseTermDateDefaults(configured)).toEqual(configured);
    for (const bad of [undefined, null, '', 'not json', '[]', '[{"month":13,"day":1}]', '[{"month":1}]']) {
      expect(parseTermDateDefaults(bad)).toEqual(DEFAULT_TERM_DATES);
    }
  });
});
