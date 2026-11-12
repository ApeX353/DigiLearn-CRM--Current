export const INVOICE_STATUSES = [
  'Draft',
  'Sent',
  'Paid',
  'Partially-Paid',
  'Overdue',
  'Cancelled',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
