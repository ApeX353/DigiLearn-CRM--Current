export const PAYMENT_TERM_TYPES = [
  'cash',
  '3-term',
  '4-term',
  '6-term',
  '9-term',
  'custom-date',
  'net-30',
  'net-60',
  'net-90',
  'custom',
] as const;
export type PaymentTermType = (typeof PAYMENT_TERM_TYPES)[number];

export const INTEREST_CALCULATION_METHODS = [
  'simple',
  'compound',
  'flat',
  'none',
] as const;
export type InterestCalculationMethod =
  (typeof INTEREST_CALCULATION_METHODS)[number];

export const INVOICE_STRATEGIES = [
  'single_with_installments',
  'multiple_invoices',
] as const;
export type InvoiceStrategy = (typeof INVOICE_STRATEGIES)[number];

export const PERIOD_TYPES = ['active', 'break'] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export const INSTALLMENT_STATUSES = [
  'pending',
  'partially_paid',
  'paid',
  'overdue',
] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export const APPLIED_DOCUMENT_TYPES = ['invoice', 'quote'] as const;
export type AppliedDocumentType = (typeof APPLIED_DOCUMENT_TYPES)[number];
