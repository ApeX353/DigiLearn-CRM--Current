export const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
