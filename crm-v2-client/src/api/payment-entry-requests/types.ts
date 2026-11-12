export type PaymentEntryRequestStatus = "pending" | "approved" | "rejected";

export interface PaymentEntryRequestActor {
  id: string;
  first_name: string;
  last_name: string;
}

export interface PaymentEntryRequest {
  id: string;
  invoice_id: string;
  invoice?: {
    id: string;
    invoice_number: string;
    total: number;
    amount_paid: number;
    school?: { id: string; name: string };
  };
  amount: number;
  payment_date: string;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  invoice_total_snapshot: number;
  outstanding_snapshot: number;
  status: PaymentEntryRequestStatus;
  requested_by?: PaymentEntryRequestActor;
  requested_at: string;
  reviewed_by?: PaymentEntryRequestActor | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  resulting_payment_id?: string | null;
}

export interface ReviewPaymentEntryRequestDto {
  decision: "approved" | "rejected";
  review_note?: string;
}
