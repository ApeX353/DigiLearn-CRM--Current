import { addBusinessHours } from './business-hours';

// Weekends are judged in Africa/Harare (UTC+2). Times below are UTC.
describe('addBusinessHours (SLAW1 — SLA clock pauses on weekends)', () => {
  it('adds calendar hours normally within the working week', () => {
    // Tuesday 08:00 UTC + 6h => Tuesday 14:00 (no weekend crossed)
    const start = new Date('2026-07-28T08:00:00Z'); // Tue
    const due = addBusinessHours(start, 6);
    expect(due.toISOString()).toBe('2026-07-28T14:00:00.000Z');
  });

  it('skips the weekend so a Friday SLA lands on Monday', () => {
    // Friday 10:00 UTC + 24 business-hours => Monday 10:00 UTC
    const start = new Date('2026-07-31T10:00:00Z'); // Fri
    const due = addBusinessHours(start, 24);
    expect(due.getUTCDay()).toBe(1); // Monday
    expect(due.toISOString()).toBe('2026-08-03T10:00:00.000Z');
  });

  it('does not let a due date fall on Saturday or Sunday', () => {
    // Friday 20:00 UTC (Sat 22:00 boundary aside) + several hours
    for (let h = 1; h <= 40; h++) {
      const due = addBusinessHours(new Date('2026-07-31T12:00:00Z'), h);
      const harareDay = new Date(due.getTime() + 2 * 3600000).getUTCDay();
      expect(harareDay).not.toBe(6); // never Saturday (Harare)
      expect(harareDay).not.toBe(0); // never Sunday (Harare)
    }
  });

  it('a lead created on the weekend effectively starts Monday', () => {
    // Saturday 09:00 UTC + 8h => should be Monday morning, not Saturday
    const due = addBusinessHours(new Date('2026-08-01T09:00:00Z'), 8); // Sat
    expect(due.getUTCDay()).toBe(1); // Monday
  });
});
