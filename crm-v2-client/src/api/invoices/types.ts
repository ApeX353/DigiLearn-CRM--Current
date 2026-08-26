import { z } from "zod";

export const INVOICE_STATUSES = [
  "Draft",
  "Sent",
  "Paid",
  "Partially-Paid",
  "Overdue",
  "Cancelled",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = ["Unpaid", "Partial", "Paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface InvoiceItem {
  id: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  person_id?: string;
  deal_id?: string;
  quote_id?: string;
  school_id: string;
  school?: { id: string; name: string };
  client_name: string;
  client_email?: string;
  client_address?: string;
  status: InvoiceStatus;
  payment_status?: PaymentStatus;
  due_date?: string;
  notes?: string;
  subtotal: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  parent_invoice_id?: string | null;
  is_summary_invoice?: boolean;
  child_invoices?: Invoice[];
  items: InvoiceItem[];
  owner_id?: string;
  owner?: { id: string; first_name: string; last_name: string };
  created_at: string;
  updated_at: string;
}

export interface InvoicePaymentScheduleInvoice {
  id: string;
  invoice_number: string;
  total: number;
  amount_paid: number;
  status: InvoiceStatus | string;
  payment_status?: PaymentStatus | string;
  due_date?: string | null;
  grace_due_date?: string | null;
  parent_invoice_id?: string | null;
  is_summary_invoice?: boolean;
}

export interface InvoicePaymentScheduleAppliedTerm {
  id: string;
  term_name: string;
  term_type: string;
  interest_rate: number;
  interest_calculation_method: string;
  interest_amount: number;
  subtotal: number;
  total_amount: number;
  number_of_installments: number;
  start_date: string;
  final_due_date?: string | null;
  grace_period_days: number;
}

export interface InvoicePaymentRecord {
  id: string;
  invoice_id: string;
  payment_number?: string;
  amount: number;
  payment_date: string;
  currency?: string;
  payment_method?: string;
  method?: string;
  reference_number?: string | null;
  reference?: string | null;
  notes?: string | null;
  allocated_amount?: number;
  unallocated_amount?: number;
}

export interface InvoicePaymentAllocation {
  id: string;
  payment_id: string;
  installment_id: string;
  allocated_amount: number;
  allocation_order: number;
  allocation_date: string;
  created_at?: string;
  payment?: InvoicePaymentRecord;
}

export interface InvoicePaymentScheduleInstallment {
  id: string;
  applied_payment_term_id: string;
  parent_invoice_id?: string | null;
  invoice_id?: string | null;
  installment_number: number;
  amount: number;
  paid_amount: number;
  balance: number;
  due_date: string;
  grace_due_date: string;
  status: "pending" | "partially_paid" | "paid" | "overdue" | string;
  created_at?: string;
  updated_at?: string;
  allocations?: InvoicePaymentAllocation[];
}

export interface InvoicePaymentSchedule {
  invoice: InvoicePaymentScheduleInvoice;
  appliedTerm: InvoicePaymentScheduleAppliedTerm | null;
  installments: InvoicePaymentScheduleInstallment[];
}

export interface InvoicePaymentRecordResponse {
  data?: InvoicePaymentRecord;
  success?: boolean;
  message?: string;
}

export interface InvoiceListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: InvoiceStatus;
  payment_status?: PaymentStatus;
  school_id?: string;
  owner_id?: string;
  deal_id?: string;
  overdue?: boolean;
}

export interface InvoiceStatsPeriod {
  /** Every top-level invoice raised in the period, drafts included. */
  totalInvoices: number;
  /** Sales value of issued invoices. Excludes Draft and Cancelled. */
  totalValue: number;
  issued: number;
  issuedValue: number;
  draft: number;
  draftValue: number;
  cancelled: number;
  cancelledValue: number;
  paid: number;
  paidValue: number;
  /** Cash actually received against issued invoices. */
  collectedValue: number;
  outstanding: number;
  outstandingValue: number;
  overdue: number;
  overdueValue: number;
  /** Share of issued value banked (money ratio, not a count ratio). */
  collectionRate: number;
  paidRate: number;
}

export interface InvoiceStats {
  monthly: InvoiceStatsPeriod;
  quarterly: InvoiceStatsPeriod;
  yearly: InvoiceStatsPeriod;
}

export interface CreateInvoiceDto {
  school_id: string;
  person_id?: string;
  deal_id?: string;
  quote_id?: string;
  client_name: string;
  client_email?: string;
  client_address?: string;
  status?: InvoiceStatus;
  due_date?: string;
  notes?: string;
  payment_term_id?: string;
  interest?: number;
  items: CreateInvoiceItemDto[];
}

export interface UpdateInvoiceDto {
  school_id?: string;
  person_id?: string;
  deal_id?: string;
  quote_id?: string;
  client_name?: string;
  client_email?: string;
  client_address?: string;
  status?: InvoiceStatus;
  due_date?: string;
  notes?: string;
}

export interface CreateInvoiceItemDto {
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount?: number;
  tax_rate?: number;
}

export interface UpdateInvoiceItemDto {
  product_id?: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
  discount?: number;
  tax_rate?: number;
}

export const invoiceItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  quantity: z.number().min(0),
  unit_price: z.number().min(0),
  discount: z.number().min(0),
  tax_rate: z.number().min(0),
});

export const createInvoiceFormSchema = z.object({
  school_id: z.string().min(1, "School is required"),
  person_id: z.string().optional(),
  deal_id: z.string().optional(),
  quote_id: z.string().optional(),
  client_name: z.string().min(1, "Client name is required"),
  client_email: z.string().optional(),
  client_address: z.string().optional(),
  due_date: z.date().optional(),
  notes: z.string().optional(),
  payment_term_id: z.string().optional(),
  interest: z.string().optional(),
  tax: z.string().optional(),
  total: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
});

export type CreateInvoiceFormValues = z.infer<typeof createInvoiceFormSchema>;

// Payment types
export const PAYMENT_METHODS = [
  "Cash",
  "Bank Transfer",
  "EcoCash",
  "Cheque",
  "Other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface AddPaymentDto {
  invoice_id: string;
  amount: number;
  payment_method: PaymentMethod;
  method?: string;
  payment_date: string;
  // NOTE: the API whitelists `reference` (not `reference_number`) —
  // any extra property is rejected by forbidNonWhitelisted.
  reference?: string;
  notes?: string;
}

export const addPaymentFormSchema = z.object({
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  payment_method: z.enum(PAYMENT_METHODS),
  payment_date: z.date(),
  // Recording rule 4: a receipt without the real bank reference can't be
  // matched to the statement, so the CRM refuses to take one.
  reference_number: z
    .string()
    .trim()
    .min(1, "Enter the bank reference, transfer ID or receipt number"),
  notes: z.string().optional(),
});

export type AddPaymentFormValues = z.infer<typeof addPaymentFormSchema>;

