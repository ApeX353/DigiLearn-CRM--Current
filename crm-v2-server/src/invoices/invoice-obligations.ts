import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  BUSINESS_UTC_OFFSET_MS,
  startOfBusinessDay,
} from '../common/utils/business-day';

/** The Africa/Harare calendar date (YYYY-MM-DD) that an instant falls on. */
export function businessDateKey(d: Date): string {
  return new Date(d.getTime() + BUSINESS_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * When an obligation is overdue: once the Harare calendar day of its due date
 * has ended. In SQL that is `due_date < <start of today, Harare>`; in code it
 * is `businessDateKey(due) < businessDateKey(now)`. The two forms are the
 * same test, so the KPI (SQL) and Collections Due (in memory) agree at every
 * minute of the day. A due date stored as UTC midnight (a YYYY-MM-DD input)
 * and one stored as Harare midnight (22:00 UTC the evening before) both read
 * as the same Harare day.
 */
export function overdueBefore(now: Date = new Date()): Date {
  return startOfBusinessDay(now);
}

export function isOverdueOn(dueDate: Date, now: Date = new Date()): boolean {
  return businessDateKey(dueDate) < businessDateKey(now);
}

/**
 * Whole Harare calendar days by which `deadline` precedes `asOf`; 0 when
 * the deadline's day is the as-of day or later (due throughout its day).
 */
export function businessDaysOverdue(deadline: Date, asOf: Date): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const days = Math.round(
    (Date.parse(businessDateKey(asOf)) - Date.parse(businessDateKey(deadline))) /
      DAY_MS,
  );
  return Math.max(0, days);
}

/** An invoice the school has been asked to pay. Draft is not issued; Paid owes nothing more. */
export const ISSUED_INVOICE_STATUSES = [
  'Sent',
  'Partially-Paid',
  'Overdue',
] as const;
const ISSUED_SQL = ISSUED_INVOICE_STATUSES.map((status) => `'${status}'`).join(', ');

/**
 * One financial obligation = one non-summary invoice.
 *
 * A payment plan with one invoice per instalment turns the original into a
 * SUMMARY parent (`is_summary_invoice`) whose total and amount paid are the
 * sums of its CHILD instalment invoices. The children are the obligations: each
 * has its own due date and takes the money. The parent is a picture of them.
 * Any figure that sums invoices must therefore take standalone invoices and
 * children, and never the parent as well — the dashboard's overdue and
 * collections figures and the Sales Performance "outstanding" did, and showed
 * the same money twice once a child was issued (010A, 28 Oct 2026).
 *
 * A child counts when it has been issued itself OR its parent has (the
 * parent's status is derived from the money, so a family that has started
 * paying is issued), and never when it or its parent is cancelled. Every
 * receivable figure passes `issuedOnly: true` (RELEASE-EBI-AUDIT-003): a Draft
 * has not been issued, so it is not money owed. `issuedOnly: false` means
 * everything not cancelled, and only applyUnissuedDraftScope uses it.
 *
 * Adds a LEFT JOIN to the parent as `<alias>_parent`; callers must not join
 * the same relation again.
 */
export function applyObligationScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  opts: { issuedOnly: boolean },
): SelectQueryBuilder<T> {
  const parent = `${alias}_parent`;
  qb.leftJoin(`${alias}.parent_invoice`, parent)
    .andWhere(`${alias}.is_summary_invoice = false`)
    .andWhere(`${alias}.status <> 'Cancelled'`)
    .andWhere(`(${parent}.id IS NULL OR ${parent}.status <> 'Cancelled')`);
  if (opts.issuedOnly) {
    qb.andWhere(
      `(${alias}.status IN (:...obligationIssued) OR ${parent}.status IN (:...obligationIssued))`,
      { obligationIssued: [...ISSUED_INVOICE_STATUSES] },
    );
  }
  return qb;
}

/**
 * The Draft obligations no receivable counts, for showing beside them: a
 * standalone Draft, or an instalment of a family still entirely Draft at the
 * top. A Draft instalment under an issued parent is part of what is owed, and one
 * under a Paid parent is not a pending sale, so neither belongs here. Still one
 * row per obligation, so a Draft family's value is never the parent as well.
 */
export function applyUnissuedDraftScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
): SelectQueryBuilder<T> {
  return applyObligationScope(qb, alias, { issuedOnly: false })
    .andWhere(`${alias}.status = 'Draft'`)
    .andWhere(
      `(${alias}_parent.id IS NULL OR ${alias}_parent.status = 'Draft')`,
    );
}

/**
 * Live instalments under a cancelled parent. History holds a few and no figure can
 * say what they mean, so they are counted nowhere and reported for review: nothing
 * is invented as owed, and nothing disappears without a word.
 */
export function applyFamilyReviewScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
): SelectQueryBuilder<T> {
  return qb
    .innerJoin(`${alias}.parent_invoice`, `${alias}_parent`)
    .andWhere(`${alias}.status <> 'Cancelled'`)
    .andWhere(`${alias}_parent.status = 'Cancelled'`);
}

/**
 * The same family rule for figures that read documents rather than obligations
 * (the invoice list's overdue filter, invoice stats, the deal summary): a row
 * counts when it, its parent or one of its instalments has been issued. So a
 * Draft parent stays visible once an instalment under it has been sent.
 */
export const issuedDocumentClause = (alias: string) =>
  `(${alias}.status IN (${ISSUED_SQL}) OR EXISTS (SELECT 1 FROM invoices issued_row
    WHERE issued_row.status IN (${ISSUED_SQL})
      AND (issued_row.parent_invoice_id = ${alias}.id OR issued_row.id = ${alias}.parent_invoice_id)))`;
