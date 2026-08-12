import z from "zod";

export const QUOTE_STATUSES = [
  "Draft",
  "Sent",
  "Accepted",
  "Rejected",
  "Expired",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export interface QuoteItem {
  id: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
  total: number;
}

export interface Quote {
  id: string;
  quote_number: string;
  person_id?: string;
  deal_id?: string;
  school_id: string;
  school?: { id: string; name: string };
  client_name: string;
  client_email?: string;
  client_address?: string;
  status: QuoteStatus;
  valid_until?: string;
  notes?: string;
  payment_term_id: string | null;
  interest: number;
  tax: number;
  po_received: boolean;
  subtotal: number;
  tax_total: number;
  total: number;
  currency?: string | null;
  items: QuoteItem[];
  owner_id?: string;
  owner?: { id: string; first_name: string; last_name: string };
  created_at: string;
  updated_at: string;
}

export interface QuoteListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: QuoteStatus;
  school_id?: string;
  owner_id?: string;
  deal_id?: string;
}

export interface QuoteStatsPeriod {
  totalQuotes: number;
  totalValue: number;
  accepted: number;
  acceptedValue: number;
  rejected: number;
  conversionRate: number;
  acceptedRate: number;
}

export interface QuoteStats {
  monthly: QuoteStatsPeriod;
  quarterly: QuoteStatsPeriod;
  yearly: QuoteStatsPeriod;
}

export const quoteItemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  discount: z.number().optional(),
  unit_price: z.number().min(0, "Unit price must be a positive number"),
  tax: z.number().optional(),
  tax_rate: z.number().optional(),
});

export const createQuoteSchema = z.object({
  quote_number: z.string().optional(),
  person_id: z.string().optional(),
  deal_id: z.string().optional(),
  school_id: z.string().min(1),
  client_name: z.string().min(1),
  client_email: z.email().optional(),
  client_address: z.string().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Use a three-letter currency code")
    .optional(),
  valid_until: z.date().optional(),
  notes: z.string().optional(),
  items: z.array(quoteItemSchema).min(1),
  payment_term_id: z.string().optional(),
  interest: z.string().optional(),
  tax: z.string().optional(),
  total: z.string().optional(),
});

export const updateQuoteSchema = createQuoteSchema.partial().extend({
  status: z.enum(QUOTE_STATUSES).optional(),
  po_received: z.boolean().optional(),
});

export type CreateQuoteDto = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteDto = z.infer<typeof updateQuoteSchema>;

export type CreateQuoteItemDto = z.infer<typeof quoteItemSchema>;
export type UpdateQuoteItemDto = CreateQuoteItemDto & { id: string };
