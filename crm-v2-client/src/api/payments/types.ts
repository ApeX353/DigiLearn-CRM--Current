export interface PaymentCustomer {
  id: string;
  name: string;
}

export interface PaymentInvoiceSummary {
  id: string;
  invoice_number?: string;
  client_name?: string;
  client_email?: string;
  school_id?: string;
}

export interface Payment {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  currency: string;
  payment_method?: string;
  method?: string;
  reference_number?: string | null;
  reference?: string | null;
  allocated_amount: number;
  unallocated_amount: number;
  invoice_id?: string;
  invoice?: PaymentInvoiceSummary | null;
  customer?: PaymentCustomer | null;
}

export interface PaymentsListParams {
  page?: number;
  start_date?: string;
  end_date?: string;
  limit?: number;
  invoice_id?: string;
}

export interface PaymentsListResponse {
  payments: Payment[];
}

export interface PaymentStatisticsParams {
  start_date?: string;
  end_date?: string;
}

export interface PaymentStatistics {
  total_payments: number;
  total_amount: number;
  total_allocated: number;
  total_unallocated: number;
}
