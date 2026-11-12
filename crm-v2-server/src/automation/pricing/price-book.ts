/**
 * Canonical DigiLearn price book — the single source of truth for
 * quoting, transcribed verbatim from the founder-approved pricing
 * files in `DigiLearn AI Office/knowledge/pricing-rules/`
 * (APPROVED INPUT USED, confirmed by founder 29 March 2026).
 *
 * DECISION (register Gate-0e, made 2026-05-29): the approved
 * knowledge/pricing-rules files are canonical; `ClearHue
 * Ops/Reference/product-info.md` is deprecated; and per
 * pricing-principles.md ("prices are in USD unless stated otherwise")
 * the quoting currency is USD. These approved figures also supersede
 * the stale CRM Products table (e.g. 85" board $4,200 not $3,900; LMS
 * $3/user/mo not the $9.99 row) — see scripts/reconcile_products_pricing.sql.
 *
 * This is NOT price invention — every number here is an approved,
 * founder-confirmed figure copied from the approved source. Inclusions
 * and billing details that the approved files mark "to confirm" are
 * carried as caveats, not guessed.
 */

export const PRICE_BOOK_CURRENCY = 'USD' as const;
export const PRICE_BOOK_VALIDITY_DAYS = 30;
export const PRICE_BOOK_APPROVED_ON = '2026-03-29';

export interface PriceBookItem {
  sku: string;
  name: string;
  unit: string;
  unitPriceUsd: number;
  keywords: string[]; // for fuzzy-matching a free-text deal title
}

export const PRICE_BOOK: PriceBookItem[] = [
  // Interactive boards (interactive-board-pricing.md)
  { sku: 'BOARD-100', name: '100"/98" Interactive Board', unit: 'each', unitPriceUsd: 6000, keywords: ['100', '98', 'board', 'interactive'] },
  { sku: 'BOARD-85', name: '85" Interactive Board (most popular)', unit: 'each', unitPriceUsd: 4200, keywords: ['85', 'board', 'interactive'] },
  { sku: 'BOARD-75', name: '75" Interactive Board', unit: 'each', unitPriceUsd: 3500, keywords: ['75', 'board', 'interactive'] },
  { sku: 'BOARD-65', name: '65" Interactive Board', unit: 'each', unitPriceUsd: 2900, keywords: ['65', 'board', 'interactive'] },
  // Devices (tablet-pricing.md, laptop-pricing.md)
  { sku: 'TABLET', name: 'Learner Tablet', unit: 'per unit', unitPriceUsd: 285, keywords: ['tablet', 'learner'] },
  { sku: 'LAPTOP', name: 'Teacher Laptop', unit: 'per unit', unitPriceUsd: 600, keywords: ['laptop', 'teacher'] },
  // Software (lms-pricing.md, sms-pricing.md)
  { sku: 'LMS', name: 'DigiLearn LMS', unit: 'per user / month', unitPriceUsd: 3, keywords: ['lms', 'learning management'] },
  { sku: 'SMS', name: 'DigiLearn SMS (School Management System)', unit: 'per school / year', unitPriceUsd: 2000, keywords: ['sms', 'school management', 'management system'] },
  // Training (training-pricing.md)
  { sku: 'TRAIN-INIT', name: 'Initial installation training', unit: 'included', unitPriceUsd: 0, keywords: ['training', 'install'] },
  { sku: 'TRAIN-FOLLOWUP', name: 'Follow-up / additional training', unit: 'per session', unitPriceUsd: 50, keywords: ['training', 'refresher', 'follow-up'] },
];

/** Confirmed caveats from the approved files (carried, not guessed). */
export const PRICE_BOOK_CAVEATS: string[] = [
  'All prices USD, valid 30 days from quote date.',
  'Lead with the 85" board (DigiLearn default/most popular).',
  'LMS is an ongoing per-user/month subscription — show the annual figure.',
  'Inclusions (mounting, stylus, warranty, delivery, MDM, case) are "to confirm" per the approved files.',
  'Discounts require finance approval — never apply one automatically.',
  'Installment plan applies to multi-board rollouts (4+ boards) — see payment-plans.md.',
];

/** Suggest catalogue items whose keywords appear in a free-text deal title. */
export function matchItemsToTitle(title: string): PriceBookItem[] {
  const t = (title || '').toLowerCase();
  const hits = PRICE_BOOK.filter((item) =>
    item.keywords.some((k) => t.includes(k)),
  );
  return hits.length > 0 ? hits : [];
}
