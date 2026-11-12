export const LEAD_SOURCES = [
  'Website',
  'Referral',
  'Social Media',
  'Email Campaign',
  'Cold Call',
  'Event',
  'Other',
] as const;

export type LeadSource = typeof LEAD_SOURCES[number];