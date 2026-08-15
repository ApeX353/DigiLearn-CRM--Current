export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export interface InstallmentData {
  installment_id: string;
  installment_number: number;
  invoice_id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  due_date: string;
  grace_due_date?: string;
  effective_due_date?: string;
  amount: number;
  balance: number;
  paid_amount: number;
  status: string;
  days_overdue: number;
  aging_bucket: AgingBucket;
  late_fee: number;
}

export interface AgingBucketSummary {
  bucket: AgingBucket;
  count: number;
  total_balance: number;
}

export interface CustomerSummary {
  customer_id: string;
  customer_name: string;
  total_balance: number;
  installment_count: number;
}

export interface AgingReportResponse {
  installments: InstallmentData[];
  buckets: AgingBucketSummary[];
  customers: CustomerSummary[];
  total_outstanding: number;
}

export interface AgingReportParams {
  as_of_date?: string;
}
