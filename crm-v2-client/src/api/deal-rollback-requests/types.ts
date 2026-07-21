export const DEAL_ROLLBACK_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export type DealRollbackRequestStatus =
  (typeof DEAL_ROLLBACK_REQUEST_STATUSES)[number];

export const DEAL_ROLLBACK_REVIEW_DECISIONS = ["approved", "rejected"] as const;

export type DealRollbackReviewDecision =
  (typeof DEAL_ROLLBACK_REVIEW_DECISIONS)[number];

export interface DealRollbackRequestActor {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

export interface DealRollbackRequestStage {
  id: string;
  name?: string;
  order?: number;
  color?: string;
}

export interface DealRollbackRequestDeal {
  id: string;
  title?: string;
  deal_name?: string;
  pipeline_id?: string;
}

export interface DealRollbackRequest {
  id: string;
  deal_id: string;
  deal?: DealRollbackRequestDeal;
  from_stage_id: string;
  to_stage_id: string;
  from_stage?: DealRollbackRequestStage | null;
  to_stage?: DealRollbackRequestStage | null;
  reason: string;
  status: DealRollbackRequestStatus;
  requested_by_id?: string | null;
  requested_by?: DealRollbackRequestActor | null;
  approved_by_id?: string | null;
  approved_by?: DealRollbackRequestActor | null;
  rejected_by_id?: string | null;
  rejected_by?: DealRollbackRequestActor | null;
  requested_at?: string;
  approved_at?: string | null;
  rejected_at?: string | null;
  review_note?: string | null;
  updated_at?: string;
}

export interface DealRollbackRequestListParams {
  status?: DealRollbackRequestStatus;
  pipeline_id?: string;
}

export interface CreateDealRollbackRequestDto {
  to_stage_id: string;
  reason: string;
}

export interface ReviewDealRollbackRequestDto {
  decision: DealRollbackReviewDecision;
  review_note?: string;
}
