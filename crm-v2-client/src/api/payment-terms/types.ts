import z from "zod";

export const PAYMENT_TERM_TYPES = [
  "cash",
  "3-term",
  "4-term",
  "6-term",
  "9-term",
  "custom-date",
  "net-30",
  "net-60",
  "net-90",
  "custom",
] as const;

export type PaymentTermType = (typeof PAYMENT_TERM_TYPES)[number];

export const INTEREST_CALCULATION_METHODS = [
  "simple",
  "compound",
  "flat",
  "none",
] as const;

export type InterestCalculationMethod =
  (typeof INTEREST_CALCULATION_METHODS)[number];

export const INVOICE_STRATEGIES = [
  "single_with_installments",
  "multiple_invoices",
] as const;

export type InvoiceStrategy = (typeof INVOICE_STRATEGIES)[number];

export interface PaymentTermPeriod {
  id: string;
  period_number: number;
  period_type: "active" | "break";
  duration_days: number;
  due_date_offset_days: number;
}

export interface PaymentTerm {
  id: string;
  name: string;
  type: PaymentTermType;
  interest_rate: number;
  interest_calculation_method: InterestCalculationMethod;
  invoice_strategy: InvoiceStrategy;
  number_of_terms: number;
  term_length_days: number;
  days_until_due: number;
  grace_period_days: number;
  late_fee_percentage: number;
  late_fee_amount: number;
  terms_and_conditions: string | null;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  display_order: number;
  periods: PaymentTermPeriod[];
  created_at: string;
  updated_at: string;
}

export const createPaymentTermSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(PAYMENT_TERM_TYPES),
  number_of_terms: z.number().min(1),
  term_length_days: z.number().min(1),
  days_until_due: z.number().min(0),
  interest_rate: z.number().min(0),
  interest_calculation_method: z.enum(INTEREST_CALCULATION_METHODS),
  invoice_strategy: z.enum(INVOICE_STRATEGIES),
  grace_period_days: z.number().min(0),
  late_fee_percentage: z.number().min(0),
  late_fee_amount: z.number().min(0),
  description: z.string().optional(),
  terms_and_conditions: z.string().optional(),
  is_active: z.boolean(),
  is_default: z.boolean(),
});

export const updatePaymentTermSchema = createPaymentTermSchema.partial();

export type CreatePaymentTermValues = z.infer<typeof createPaymentTermSchema>;
export type UpdatePaymentTermValues = z.infer<typeof updatePaymentTermSchema>;

export interface AllocatePaymentResponse {
  allocated: number;
  remaining: number;
  allocations_created: number;
}
