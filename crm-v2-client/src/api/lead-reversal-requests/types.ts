import type { LeadStatus } from "~/api/leads";

export const LEAD_REVERSAL_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export type LeadReversalRequestStatus =
  (typeof LEAD_REVERSAL_REQUEST_STATUSES)[number];

export const LEAD_REVERSAL_TARGET_STATUSES = ["Nurture", "Qualified"] as const;

export type LeadReversalTargetStatus =
  (typeof LEAD_REVERSAL_TARGET_STATUSES)[number];

export const LEAD_REVERSAL_REVIEW_DECISIONS = ["approved", "rejected"] as const;

export type LeadReversalReviewDecision =
  (typeof LEAD_REVERSAL_REVIEW_DECISIONS)[number];

export interface ReversalRequestActor {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

export interface LeadReversalRequest {
  id: string;
  lead_id: string;
  from_status: LeadStatus;
  target_status: LeadReversalTargetStatus;
  status: LeadReversalRequestStatus;
  reason: string;
  requested_by_id: string;
  requested_by?: ReversalRequestActor;
  requested_at: string;
  approved_by_id?: string | null;
  approved_by?: ReversalRequestActor | null;
  approved_at?: string | null;
  approval_note?: string | null;
  rejected_by_id?: string | null;
  rejected_by?: ReversalRequestActor | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateLeadReversalRequestDto {
  status: LeadReversalTargetStatus;
  reason: string;
}

export interface ApproveLeadReversalRequestDto {
  decision: LeadReversalReviewDecision;
  review_note?: string;
}

export interface RejectLeadReversalRequestDto {
  decision: LeadReversalReviewDecision;
  review_note?: string;
}
