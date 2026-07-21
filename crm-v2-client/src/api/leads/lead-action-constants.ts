/**
 * Lead Action Constants
 * Reasons for nurturing and disqualifying leads
 */

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

// Disqualification reasons split into two gating groups.
//
//   Administrative / invalid → direct disqualification is OK. The
//   record should never have been a lead in the first place, or the
//   reason is purely hygiene / duplicate cleanup.
//
//   Commercial / tactical / relationship → requires escalation or
//   manager review first. A rep must not be able to quietly dump a
//   hard lead by clicking Disqualified with "Not interested". These
//   reasons route through the reassignment / escalation flow so the
//   manager sees the attempt and can intervene (coach, reassign,
//   co-own, or approve the disqualification).
//
// Kept as two explicit arrays (not a flag on each row) because the UI
// needs to render the groups separately with different gating copy,
// and backend audit logs can read the category directly from the
// constant without re-inferring it.
export const ADMIN_DISQUALIFY_REASONS = [
  "Duplicate entry",
  "Wrong contact/school",
  "School closed",
  "Outside target market",
  "Spam / not a real opportunity",
  "Fake lead",
] as const;
export type AdminDisqualifyReason =
  (typeof ADMIN_DISQUALIFY_REASONS)[number];

export const TACTICAL_DISQUALIFY_REASONS = [
  "No budget",
  "Not interested",
  "Already has solution",
  "Cannot reach contact",
  "No response after multiple follow-ups",
  "Timing issue",
  "Relationship issue",
  "Political sensitivity",
  "Rep not progressing",
] as const;
export type TacticalDisqualifyReason =
  (typeof TACTICAL_DISQUALIFY_REASONS)[number];

export const DISQUALIFY_REASONS = [
  ...ADMIN_DISQUALIFY_REASONS,
  ...TACTICAL_DISQUALIFY_REASONS,
  "Other",
] as const;

export type DisqualifyReason = (typeof DISQUALIFY_REASONS)[number];

/**
 * Returns the gating category for a disqualification reason.
 *
 *   - `admin`    → direct disqualification allowed.
 *   - `tactical` → requires manager review via the reversal/escalation
 *                  path before the lead can be marked Disqualified.
 *   - `other`    → treated as tactical (conservative default: force
 *                  manager review unless the reason is explicitly on
 *                  the admin allow-list).
 */
export function disqualifyCategory(
  reason: DisqualifyReason | undefined | null,
): "admin" | "tactical" | "other" {
  if (!reason) return "other";
  if ((ADMIN_DISQUALIFY_REASONS as readonly string[]).includes(reason)) {
    return "admin";
  }
  if ((TACTICAL_DISQUALIFY_REASONS as readonly string[]).includes(reason)) {
    return "tactical";
  }
  return "other";
}

// Lead status helpers
export const TERMINAL_STATUSES = ["Converted", "Disqualified"] as const;
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export const isTerminalStatus = (status: string): boolean =>
  TERMINAL_STATUSES.includes(status as TerminalStatus);
