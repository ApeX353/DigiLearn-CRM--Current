/**
 * Shared record-identity normalization.
 *
 * The lead/school/contact write path, the duplicate detector, and the
 * import flagger each historically rolled their own normalization, and they
 * disagreed — so a pair flagged as "duplicate" by one could still be
 * created as two records by another. These helpers are the single source of
 * truth for "are these the same record?" so all callers agree.
 */

/**
 * Canonical name for matching: lower-case and strip everything that isn't a
 * letter or digit, so punctuation/spacing variants collapse together.
 * "St. Mary's High School" and "St Marys  High School" both become
 * "stmaryshighschool". (Abbreviation expansion e.g. HS→High School is
 * deliberately NOT done — it risks merging genuinely distinct schools.)
 */
export function canonName(value?: string | null): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Canonical city: lower-case, trimmed, internal whitespace collapsed. */
export function canonCity(value?: string | null): string {
  return (value ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Canonical Zimbabwe phone number — the national significant number, so
 * "+263 77x xxx xxx", "0077x…", and "077x…" all compare equal. Strips
 * non-digits, drops a leading 263 country code and/or leading zeros, and
 * returns the trailing 9 significant digits when the number is long enough.
 * Numbers too short to be a full mobile/national number fall back to the
 * bare digit string so short/landline entries aren't over-collapsed.
 */
export function canonPhone(value?: string | null): string {
  let d = (value ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('263')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.replace(/^0+/, '');
  return d.length >= 9 ? d.slice(-9) : d;
}
