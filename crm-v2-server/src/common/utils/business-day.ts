/**
 * Calendar boundaries in the business's timezone, Africa/Harare (UTC+2).
 *
 * The servers run UTC and the database stores `timestamp without time zone`
 * in UTC, which is correct and should stay that way. What was wrong is that
 * every dashboard date filter built its window with `new Date(y, m, d)` —
 * SERVER local time — so "Today" began at midnight UTC, i.e. 02:00 in Harare.
 *
 * The practical damage: work logged between midnight and 2am local counted
 * against the previous day, and the daily counters reset at 2am rather than
 * midnight. For a KPI like "first-time contacts made today vs the daily
 * target", that is wrong at both ends of the day.
 *
 * This was already known and fixed in exactly one place — the "contacts
 * today" KPI in activity-discipline.service, whose comment records that the
 * old form "rolled over two hours early for the team". These helpers lift
 * that same arithmetic out so every window agrees, rather than one KPI being
 * right and the filters around it being wrong.
 *
 * Harare has no DST, so a fixed offset is exact. If the business ever
 * operates across zones this becomes a lookup, but a fixed offset is honest
 * about today's reality and cannot silently drift.
 */
export const BUSINESS_TZ = 'Africa/Harare';
export const BUSINESS_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;

/** `d` shifted so UTC getters read as local Harare wall-clock time. */
function toBusinessClock(d: Date): Date {
  return new Date(d.getTime() + BUSINESS_UTC_OFFSET_MS);
}

/** The UTC instant at which the Harare calendar day containing `d` begins. */
export function startOfBusinessDay(d: Date = new Date()): Date {
  const local = toBusinessClock(d);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
      BUSINESS_UTC_OFFSET_MS,
  );
}

/** The last millisecond of the Harare calendar day containing `d`, in UTC. */
export function endOfBusinessDay(d: Date = new Date()): Date {
  return new Date(startOfBusinessDay(d).getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** The UTC instant at which the Harare calendar month containing `d` begins. */
export function startOfBusinessMonth(d: Date = new Date()): Date {
  const local = toBusinessClock(d);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) -
      BUSINESS_UTC_OFFSET_MS,
  );
}

/** The UTC instant at which the Harare calendar quarter containing `d` begins. */
export function startOfBusinessQuarter(d: Date = new Date()): Date {
  const local = toBusinessClock(d);
  const qMonth = Math.floor(local.getUTCMonth() / 3) * 3;
  return new Date(
    Date.UTC(local.getUTCFullYear(), qMonth, 1) - BUSINESS_UTC_OFFSET_MS,
  );
}

/** The UTC instant at which the Harare calendar year containing `d` begins. */
export function startOfBusinessYear(d: Date = new Date()): Date {
  const local = toBusinessClock(d);
  return new Date(
    Date.UTC(local.getUTCFullYear(), 0, 1) - BUSINESS_UTC_OFFSET_MS,
  );
}

/** Days in the Harare calendar month containing `d`. Used to pro-rate targets. */
export function daysInBusinessMonth(d: Date = new Date()): number {
  const local = toBusinessClock(d);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

/** Whole days spanned by [start, end], minimum 1. */
export function businessDaysSpanned(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
