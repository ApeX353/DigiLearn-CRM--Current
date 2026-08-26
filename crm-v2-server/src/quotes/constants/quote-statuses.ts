export const QUOTE_STATUSES = [
  'Draft',
  'Sent',
  'Accepted',
  'Rejected',
  'Expired',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
