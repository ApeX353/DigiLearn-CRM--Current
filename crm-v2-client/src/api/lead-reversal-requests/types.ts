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

/**
 * Phase A.1 / A.2 — request kinds. The server defaults `kind` to
 * `status_reversal` when omitted, which preserves the legacy semantics
 * for older clients. New flows pass `kind` explicitly.
 */
export const LEAD_REVERSAL_REQUEST_KINDS = [
  "status_reversal",
  "reassignment",
  "tactical_disqualify",
] as const;
export type LeadReversalRequestKind =
  (typeof LEAD_REVERSAL_REQUEST_KINDS)[number];

export interface ReversalRequestActor {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

export interface LeadReversalRequest {
  id: string;
  lead_id: string;
  /** The status the requester wants the lead moved TO. This is the
   *  server's actual column name — the client previously invented
   *  `from_status`/`target_status`/`requested_at`, which the API never
   *  sends, so the review dialog rendered blanks (C6). The lead's
   *  current status comes from `lead_summary.status` or the page's own
   *  lead record; "requested at" is `created_at`. */
  requested_status: LeadReversalTargetStatus;
  status: LeadReversalRequestStatus;
  kind: LeadReversalRequestKind;
  proposed_assignee_id?: string | null;
  reason: string;
  notes?: string | null;
  requested_by_id: string;
  requested_by?: ReversalRequestActor;
  approved_by_id?: string | null;
  approved_by?: ReversalRequestActor | null;
  approved_at?: string | null;
  approval_note?: string | null;
  rejected_by_id?: string | null;
  rejected_by?: ReversalRequestActor | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  /** Phase C.2 — manager-queue audit fields populated by the
   *  /lead-reversal-requests endpoint, NOT by per-lead listings. */
  reviewed_by_id?: string | null;
  reviewed_by?: ReversalRequestActor | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  /** Phase C.2 manager queue: server-resolved lead and proposed-assignee
   *  summaries so the row can render without N+1. */
  lead_summary?: {
    id: string;
    lead_name: string | null;
    status: string | null;
    assigned_to: string | null;
  } | null;
  proposed_assignee_summary?: {
    id: string;
    name: string;
    email: string | null;
  };
  created_at: string;
  updated_at: string;
}

export interface CreateLeadReversalRequestDto {
  /** Defaults to `status_reversal` server-side if omitted. */
  kind?: LeadReversalRequestKind;
  /** Required for `status_reversal`; ignored otherwise. */
  status?: LeadReversalTargetStatus;
  /** Required for `reassignment`; ignored otherwise. */
  proposed_assignee_id?: string;
  reason: string;
  notes?: string;
}

export interface ApproveLeadReversalRequestDto {
  decision: LeadReversalReviewDecision;
  review_note?: string;
}

export interface RejectLeadReversalRequestDto {
  decision: LeadReversalReviewDecision;
  review_note?: string;
}
