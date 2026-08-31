import {
  startOfBusinessDay,
  endOfBusinessDay,
  startOfBusinessMonth,
  startOfBusinessQuarter,
  startOfBusinessYear,
  daysInBusinessMonth,
  businessDaysSpanned,
} from './business-day';

/**
 * These pin the exact bug that prompted the helper: the servers run UTC, and
 * every window used to be built from SERVER local time, so the business day
 * began at 02:00 in Harare. The 00:00-02:00 cases below are the ones that
 * were wrong, and they are the ones that will break first if anyone
 * "simplifies" this back to new Date(y, m, d).
 */
describe('business-day (Africa/Harare, UTC+2)', () => {
  it('starts the day at 22:00 UTC the previous day', () => {
    // 28 Aug 08:14 UTC = 28 Aug 10:14 Harare -> day began 27 Aug 22:00 UTC.
    const start = startOfBusinessDay(new Date('2026-08-28T08:14:00Z'));
    expect(start.toISOString()).toBe('2026-08-27T22:00:00.000Z');
  });

  it('puts 00:30 Harare in TODAY, not yesterday', () => {
    // 00:30 Harare on 28 Aug is 22:30 UTC on 27 Aug. Under the old UTC-day
    // logic this fell into 27 Aug and a rep's work vanished from "today".
    const t = new Date('2026-08-27T22:30:00Z');
    expect(startOfBusinessDay(t).toISOString()).toBe(
      '2026-08-27T22:00:00.000Z',
    );
    expect(endOfBusinessDay(t).toISOString()).toBe(
      '2026-08-28T21:59:59.999Z',
    );
  });

  it('keeps 01:59 Harare and 02:01 Harare in the SAME day', () => {
    // The old boundary fell between these two. They are one day apart only
    // if the day rolls at midnight UTC, which is the bug.
    const before = startOfBusinessDay(new Date('2026-08-27T23:59:00Z'));
    const after = startOfBusinessDay(new Date('2026-08-28T00:01:00Z'));
    expect(before.toISOString()).toBe(after.toISOString());
  });

  it('spans exactly 24 hours', () => {
    const d = new Date('2026-08-28T08:14:00Z');
    const ms = endOfBusinessDay(d).getTime() - startOfBusinessDay(d).getTime();
    expect(ms).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('starts month, quarter and year on Harare boundaries', () => {
    const d = new Date('2026-08-28T08:14:00Z');
    expect(startOfBusinessMonth(d).toISOString()).toBe(
      '2026-07-31T22:00:00.000Z',
    );
    // August sits in Q3, which starts 1 July.
    expect(startOfBusinessQuarter(d).toISOString()).toBe(
      '2026-06-30T22:00:00.000Z',
    );
    expect(startOfBusinessYear(d).toISOString()).toBe(
      '2025-12-31T22:00:00.000Z',
    );
  });

  it('counts days in the month for pro-rating targets', () => {
    expect(daysInBusinessMonth(new Date('2026-08-28T08:14:00Z'))).toBe(31);
    expect(daysInBusinessMonth(new Date('2026-02-10T08:14:00Z'))).toBe(28);
    expect(daysInBusinessMonth(new Date('2026-04-10T08:14:00Z'))).toBe(30);
  });

  it('spans at least one day, so a target is never divided by zero', () => {
    const d = new Date('2026-08-28T08:14:00Z');
    expect(businessDaysSpanned(startOfBusinessDay(d), endOfBusinessDay(d))).toBe(1);
    expect(
      businessDaysSpanned(startOfBusinessMonth(d), endOfBusinessDay(d)),
    ).toBe(28);
  });
});
