// Nurture Reasons - when a lead needs more time/follow-up
export const NURTURE_REASONS = [
  "Budget not available this term",
  "Decision maker not ready",
  "Waiting for school committee approval",
  "Exploring other vendors",
  "Infrastructure not ready",
  "Academic calendar timing",
  "Other",
] as const;

export type NurtureReason = (typeof NURTURE_REASONS)[number];

// Disqualification Reasons - when a lead won't convert
export const DISQUALIFY_REASONS = [
  "No budget",
  "Not interested",
  "Already has solution",
  "Wrong contact/school",
  "Duplicate entry",
  "School closed",
  "Cannot reach contact",
  "Other",
] as const;

export type DisqualifyReason = (typeof DISQUALIFY_REASONS)[number];

/**
 * Phase A.1 — Disqualify reason category. Drives the server-side gate
 * in `leads.service.ts#update`. Two buckets:
 *
 *   - `admin` — structural reasons that are objectively true (the
 *     lead is a duplicate, the school no longer exists, the contact
 *     belongs to a different school, the prospect already runs a
 *     competing system). Reps may apply these directly because
 *     there's no judgement call to dispute.
 *
 *   - `tactical` — soft / sales-judgement reasons reps can use to
 *     dump leads they don't feel like working ("no budget", "not
 *     interested", "can't reach"). These require an approved
 *     LeadReversalRequest{kind:'tactical_disqualify'} unless the
 *     compliance switch is off, OR the caller is admin/sales_manager.
 *
 * "Other" defaults to `tactical` — it's a freeform reason and the
 * conservative default is to require approval rather than let the
 * field become a tactical-disqualify backdoor.
 */
export const DISQUALIFY_REASON_KIND: Record<DisqualifyReason, 'admin' | 'tactical'> = {
  'No budget': 'tactical',
  'Not interested': 'tactical',
  'Already has solution': 'admin',
  'Wrong contact/school': 'admin',
  'Duplicate entry': 'admin',
  'School closed': 'admin',
  'Cannot reach contact': 'tactical',
  'Other': 'tactical',
};

export function isTacticalDisqualifyReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  const kind = (DISQUALIFY_REASON_KIND as Record<string, 'admin' | 'tactical' | undefined>)[reason];
  return kind === 'tactical';
}