export const LEAD_STATUSES = [
  'New',
  'Contacted',
  "Nurture",
  'Qualified',
  'Disqualified',
  'Converted',
] as const;

export type LeadStatus = typeof LEAD_STATUSES[number];