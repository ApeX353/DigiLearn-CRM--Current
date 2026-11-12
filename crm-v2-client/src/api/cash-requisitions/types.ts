export const REQUISITION_TYPES = ["PRE_APPROVAL", "REIMBURSEMENT"] as const;
export type RequisitionType = (typeof REQUISITION_TYPES)[number];

export const REQUISITION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "MANAGER_APPROVED",
  "FINANCE_APPROVED",
  "PAID",
  "REJECTED",
] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export const REQUISITION_CURRENCIES = ["USD", "ZWG"] as const;
export type RequisitionCurrency = (typeof REQUISITION_CURRENCIES)[number];

export const REQUISITION_CATEGORIES = [
  "FUEL",
  "TOLLGATE",
  "CAR_HIRE",
  "TRAVEL_SUBSISTENCE",
  "OTHER",
] as const;
export type RequisitionCategory = (typeof REQUISITION_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<RequisitionCategory, string> = {
  FUEL: "Fuel",
  TOLLGATE: "Tollgate",
  CAR_HIRE: "Car hire",
  TRAVEL_SUBSISTENCE: "Travel & subsistence",
  OTHER: "Other",
};

export const STATUS_LABELS: Record<RequisitionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting manager",
  MANAGER_APPROVED: "Awaiting finance",
  FINANCE_APPROVED: "Approved — awaiting payment",
  PAID: "Paid",
  REJECTED: "Rejected",
};

export interface RequisitionLineItem {
  id: string;
  requisition_id: string;
  category: RequisitionCategory;
  description: string;
  amount: string;
  created_at: string;
}

export interface CashRequisition {
  id: string;
  type: RequisitionType;
  status: RequisitionStatus;
  requested_by_id: string;
  requested_by?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  deal_id: string | null;
  deal?: { id: string; title: string } | null;
  lead_id: string | null;
  lead?: { id: string; lead_name: string } | null;
  campaign_id: string | null;
  campaign?: { id: string; name: string } | null;
  currency: RequisitionCurrency;
  total_amount: string;
  reason: string;
  submitted_at: string | null;
  manager_actioned_by?: { first_name: string; last_name: string } | null;
  manager_actioned_at: string | null;
  finance_actioned_by?: { first_name: string; last_name: string } | null;
  finance_actioned_at: string | null;
  rejection_reason: string | null;
  rejected_stage: "manager" | "finance" | null;
  paid_at: string | null;
  line_items: RequisitionLineItem[];
  created_at: string;
  updated_at: string;
}

export interface CreateLineItemDto {
  category: RequisitionCategory;
  description: string;
  amount: number;
}

export interface CreateCashRequisitionDto {
  type: RequisitionType;
  deal_id?: string;
  lead_id?: string;
  campaign_id?: string;
  currency: RequisitionCurrency;
  reason: string;
  line_items: CreateLineItemDto[];
}

export interface DealCostSummaryRow {
  currency: string;
  in_approval: string;
  paid: string;
  total: string;
}

export interface CostToCloseDealRow {
  deal_id: string;
  title: string;
  deal_value: string;
  deal_currency: string;
  currency: string;
  paid: string;
  committed: string;
}

export interface CostToCloseReport {
  won: CostToCloseDealRow[];
  lost: CostToCloseDealRow[];
  totals: {
    won: Array<{ currency: string; paid: string; committed: string }>;
    lost: Array<{ currency: string; paid: string; committed: string }>;
  };
}

export interface RequisitionListParams {
  campaign_id?: string;
  page?: number;
  limit?: number;
  status?: RequisitionStatus;
  deal_id?: string;
  lead_id?: string;
  mine?: "true";
  awaiting?: "true";
}
