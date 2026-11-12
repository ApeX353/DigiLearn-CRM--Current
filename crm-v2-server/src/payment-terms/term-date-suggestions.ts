/**
 * Suggested due dates for a plan paid by term (EBI-FOCUS-001). These are CRM
 * defaults management asked for, not official school dates: they only prefill a
 * form, and a person confirms or changes every one before anything is created.
 * The `payment_term_date_defaults` setting replaces them, as JSON such as
 * [{"month":1,"day":31},{"month":5,"day":31},{"month":9,"day":30}].
 */
export interface TermDateDefault {
  month: number;
  day: number;
}

export const TERM_DATE_DEFAULTS_SETTING = 'payment_term_date_defaults';

export const DEFAULT_TERM_DATES: TermDateDefault[] = [
  { month: 1, day: 31 },
  { month: 5, day: 31 },
  { month: 9, day: 30 },
];

/** Anything but a usable list falls back to the defaults, so a bad setting cannot block sales. */
export function parseTermDateDefaults(value: unknown): TermDateDefault[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return DEFAULT_TERM_DATES;
    }
  }
  const valid =
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every(
      (d) =>
        Number.isInteger(d?.month) &&
        Number.isInteger(d?.day) &&
        d.month >= 1 &&
        d.month <= 12 &&
        d.day >= 1 &&
        d.day <= 31,
    );
  return valid ? (parsed as TermDateDefault[]) : DEFAULT_TERM_DATES;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A day that does not exist in the month becomes its last day: never 31 September. */
function termDate(year: number, { month, day }: TermDateDefault): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(day, lastDay))}`;
}

/**
 * The next `count` term dates on or after `fromDay` (YYYY-MM-DD, the Harare
 * calendar day), rolling into the following year as needed.
 */
export function suggestTermDates(
  count: number,
  fromDay: string,
  defaults: TermDateDefault[] = DEFAULT_TERM_DATES,
): string[] {
  const ordered = [...defaults].sort(
    (a, b) => a.month - b.month || a.day - b.day,
  );
  const dates: string[] = [];
  for (let year = Number(fromDay.slice(0, 4)); dates.length < count; year += 1) {
    for (const term of ordered) {
      const date = termDate(year, term);
      if (date >= fromDay && dates.length < count) dates.push(date);
    }
  }
  return dates;
}
