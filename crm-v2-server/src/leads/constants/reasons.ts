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