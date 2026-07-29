/**
 * SLAW1: the sales team does not work weekends, so the SLA clock must
 * pause over them. Add `hours` of business time to `start`, skipping
 * Saturdays and Sundays — an hour that falls on a weekend does not count
 * toward the deadline. Weekends are judged in Africa/Harare (UTC+2), the
 * business's timezone, so the boundary is correct even though the server
 * stores UTC.
 *
 * Example: a lead created Friday 15:00 with a 24-hour SLA is now due the
 * following Monday 15:00, not Saturday.
 */
export function addBusinessHours(start: Date, hours: number): Date {
  const d = new Date(start);
  let remaining = Math.max(0, Math.round(hours));
  while (remaining > 0) {
    d.setUTCHours(d.getUTCHours() + 1);
    // Day-of-week in Harare time (UTC+2).
    const harareDay = new Date(d.getTime() + 2 * 3_600_000).getUTCDay();
    if (harareDay !== 0 && harareDay !== 6) {
      remaining -= 1; // only weekday hours count down the SLA
    }
  }
  return d;
}
