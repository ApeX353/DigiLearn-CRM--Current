export const TIMELINE_TYPES = [
  'this-term',
  'next-term',
  'within-6-months',
  'within-1-year',
  'specific-date',
] as const;
export type TimelineType = (typeof TIMELINE_TYPES)[number];

export const BUDGET_INDICATORS = [
  'high',
  'medium',
  'low',
  'not-disclosed',
] as const;
export type BudgetIndicator = (typeof BUDGET_INDICATORS)[number];
