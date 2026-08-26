export const ESCALATION_REASONS = [
  "no_response",
  "no_decision_maker_access",
  "budget_resistance",
  "procurement_block",
  "political_sensitivity",
  "competitor_issue",
  "relationship_mismatch",
  "technical_objection",
  "internal_school_dynamics",
  "government_stakeholder_sensitivity",
  "other",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const ESCALATION_REASON_LABELS: Record<EscalationReason, string> = {
  no_response: "No response after multiple attempts",
  no_decision_maker_access: "Unable to reach decision maker",
  budget_resistance: "Budget resistance / pricing pushback",
  procurement_block: "Procurement process blocked",
  political_sensitivity: "Political sensitivity",
  competitor_issue: "Competitor issue",
  relationship_mismatch: "Rep-stakeholder mismatch",
  technical_objection: "Technical objection we can't answer",
  internal_school_dynamics: "Internal school politics",
  government_stakeholder_sensitivity:
    "Government stakeholder sensitivity",
  other: "Other",
};

export const ESCALATION_RESOLUTIONS = [
  "coach",
  "join_meeting",
  "reassign",
  "senior_support",
  "change_tactic",
  "pause",
  "approved_disqualification",
] as const;
export type EscalationResolution = (typeof ESCALATION_RESOLUTIONS)[number];

export const ESCALATION_RESOLUTION_LABELS: Record<EscalationResolution, string> = {
  coach: "Coach the rep",
  join_meeting: "Join next meeting",
  reassign: "Reassign lead",
  senior_support: "Senior support",
  change_tactic: "Change tactic",
  pause: "Pause outreach",
  approved_disqualification: "Approved disqualification",
};

export interface LeadEscalation {
  id: string;
  lead_id: string;
  reason: EscalationReason;
  notes: string | null;
  blockers: string | null;
  escalated_by_id: string | null;
  escalated_by?: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
  resolution: EscalationResolution | null;
  resolution_notes: string | null;
  resolved_by_id: string | null;
  resolved_by?: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  lead?: {
    id: string;
    lead_name: string;
    status: string;
    assignee?: {
      id: string;
      first_name?: string;
      last_name?: string;
      email?: string;
    } | null;
    school?: { id: string; name: string } | null;
  } | null;
}

export interface CreateLeadEscalationDto {
  reason: EscalationReason;
  notes?: string;
  blockers?: string;
}

export interface ResolveLeadEscalationDto {
  resolution: EscalationResolution;
  resolution_notes?: string;
}
