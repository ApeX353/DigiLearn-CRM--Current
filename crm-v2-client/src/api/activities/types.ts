import type { User } from "~/stores/use-auth-store";
import type { Lead } from "../leads";
import type { Deal } from "../deals";

// Activity Logs (existing)
export const LOG_ACTIONS = [
  "create",
  "update",
  "delete",
  "view",
  "restore",
  "bulk_create",
  "bulk_update",
  "bulk_delete",
] as const;

export type LogAction = (typeof LOG_ACTIONS)[number];

// Activities (new)
export const ACTIVITY_TYPES = [
  "note",
  "task",
  "call",
  "email",
  "meeting",
  "whatsapp",
  // Demo lifecycle (Demo + Commercial-Intent feature). Keep in sync
  // with the backend ActivityType enum in
  // src/activities/entities/activity.entity.ts.
  "demo_booking",
  "demo_delivery",
  "demo_followup",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const DEMO_ACTIVITY_TYPES = [
  "demo_booking",
  "demo_delivery",
  "demo_followup",
] as const;
export type DemoActivityType = (typeof DEMO_ACTIVITY_TYPES)[number];

export function isDemoActivityType(
  type: string | null | undefined,
): type is DemoActivityType {
  return (DEMO_ACTIVITY_TYPES as readonly string[]).includes(type ?? "");
}

/**
 * Product rule: Notes are CONTEXT, not FOLLOW-UP DISCIPLINE.
 *
 * These are the only types that count as a real, committed next action:
 * they drive the Planned card, satisfy required-next-step on active
 * records, and populate pipeline card "next step" signals.
 *
 * Notes deliberately live outside this set. A rep can still log notes
 * anywhere and notes still appear in feeds + Activity log, but notes
 * never satisfy follow-up discipline, never clear "No next step", and
 * never reset SLA / freshness / momentum rules on leads or deals.
 *
 * Keep this list aligned with the backend `ACTIONABLE_ACTIVITY_TYPES`
 * in `server/src/activities/activities.service.ts`.
 */
export const ACTIONABLE_ACTIVITY_TYPES = [
  "task",
  "call",
  "email",
  "meeting",
  "whatsapp",
  // Demo lifecycle counts as actionable so it satisfies next-step
  // discipline and shows in Planned cards.
  "demo_booking",
  "demo_delivery",
  "demo_followup",
] as const;
export type ActionableActivityType = (typeof ACTIONABLE_ACTIVITY_TYPES)[number];

export function isActionableActivityType(
  type: string | null | undefined,
): type is ActionableActivityType {
  return (ACTIONABLE_ACTIVITY_TYPES as readonly string[]).includes(type ?? "");
}

export const ACTIVITY_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/**
 * Generic outcome enum captured at completion time. Required when
 * any activity transitions to `completed` — enforced by both the
 * ActivityCompletionDialog on the frontend and the
 * PATCH /activities/:id/status DTO on the backend. Ordered to match
 * the human reading order in the dropdown.
 */
// Outcomes split into two semantic groups.
//
//   Pipeline outcomes — the deal-driving dispositions an active lead
//   or deal interaction produces. Used for completion on
//   actionable activities (call, email, meeting, task, whatsapp) that
//   are tied to an active lead/deal.
//
//   Relationship-touchpoint outcomes — for school-level / account-
//   level interactions that are purely relationship-maintenance or
//   informational. These close without demanding a pipeline-style
//   next step; the rep is allowed to mark the interaction complete
//   and move on because the goal wasn't commercial progression.
//
// Product rule (Phase 2 of the management-control pass):
//   - Active leads/deals still require a pipeline outcome on
//     completion AND a mandatory next step.
//   - School-level non-opportunity interactions may close with a
//     relationship-touchpoint outcome and NO next step.
//   The EngagementWorkspace and FollowUpPromptStore read the source
//   activity's scope to decide which set to offer and whether the
//   required-next-step gate engages.
export const PIPELINE_ACTIVITY_OUTCOMES = [
  "successful",
  "unsuccessful",
  "no_response",
  "rescheduled",
  "interested",
  "not_interested",
  "waiting_for_approval",
  "proposal_sent",
  "follow_up_needed",
] as const;

export const RELATIONSHIP_ACTIVITY_OUTCOMES = [
  "information_shared",
  "relationship_touchpoint_complete",
  "awaiting_future_need",
  "no_immediate_commercial_action",
  "training_completed",
  "referred_internally",
  "informational_engagement_closed",
] as const;

export const ACTIVITY_OUTCOMES = [
  ...PIPELINE_ACTIVITY_OUTCOMES,
  ...RELATIONSHIP_ACTIVITY_OUTCOMES,
] as const;
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];

export const ACTIVITY_OUTCOME_LABELS: Record<ActivityOutcome, string> = {
  // Pipeline
  successful: "Successful",
  unsuccessful: "Unsuccessful",
  no_response: "No response",
  rescheduled: "Rescheduled",
  interested: "Interested",
  not_interested: "Not interested",
  waiting_for_approval: "Waiting for approval",
  proposal_sent: "Proposal sent",
  follow_up_needed: "Follow-up needed",
  // Relationship / account-level
  information_shared: "Information shared",
  relationship_touchpoint_complete: "Relationship touchpoint complete",
  awaiting_future_need: "Awaiting future need",
  no_immediate_commercial_action: "No immediate commercial action",
  training_completed: "Training completed",
  referred_internally: "Referred internally",
  informational_engagement_closed: "Informational engagement closed",
};

/**
 * Does this outcome close a relationship-maintenance interaction that
 * legitimately has no commercial next step? Used by the follow-up
 * prompt store: when a rep marks a SCHOOL-level activity done with a
 * relationship outcome, the required-next-step gate is satisfied
 * without forcing them to commit to a future action.
 */
export function isRelationshipTerminalOutcome(
  outcome: ActivityOutcome | null | undefined,
): boolean {
  if (!outcome) return false;
  return (RELATIONSHIP_ACTIVITY_OUTCOMES as readonly string[]).includes(
    outcome,
  );
}

export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "done",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const CALL_OUTCOMES = [
  "answered",
  "no_answer",
  "busy",
  "voicemail",
  "wrong_number",
  "callback_requested",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const MEETING_PLATFORMS = [
  "zoom",
  "teams",
  "google_meet",
  "in_person",
  "phone",
  "other",
] as const;
export type MeetingPlatform = (typeof MEETING_PLATFORMS)[number];

export const WHATSAPP_DIRECTIONS = ["inbound", "outbound"] as const;
export type WhatsappDirection = (typeof WHATSAPP_DIRECTIONS)[number];

export const WHATSAPP_MESSAGE_TYPES = [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "location",
] as const;
export type WhatsappMessageType = (typeof WHATSAPP_MESSAGE_TYPES)[number];

export const WHATSAPP_STATUSES = [
  "sent",
  "delivered",
  "read",
  "failed",
] as const;
export type WhatsappStatus = (typeof WHATSAPP_STATUSES)[number];

// Sub-types for activity details
export interface TaskDetails {
  status: TaskStatus;
  priority: TaskPriority;
  estimated_hours?: number;
  tags?: string;
  checklist_items?: string;
}

export const NOTE_VISIBILITIES = ["internal", "client_safe"] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];

export interface NoteDetails {
  content: string;
  tags?: string;
  visibility?: NoteVisibility;
}

export interface CallDetails {
  phone_number: string;
  outcome?: CallOutcome;
  outcome_id?: string;
  duration?: number;
  notes?: string;
  recording_url?: string;
  transcription?: string;
  follow_up_required?: boolean;
  follow_up_date?: string;
  summary?: string;
  next_steps?: string;
}

export interface EmailDetails {
  subject: string;
  body: string;
  to_recipients: string;
  cc_recipients?: string;
  bcc_recipients?: string;
  from_email?: string;
  message_id?: string;
  in_reply_to?: string;
  thread_id?: string;
}

export interface MeetingDetails {
  title: string;
  platform: MeetingPlatform;
  start_time: string;
  end_time?: string;
  location?: string;
  meeting_link?: string;
  dial_in_number?: string;
  attendees?: string;
  agenda?: string;
  minutes_notes?: string;
  recording_url?: string;
}

export interface WhatsappDetails {
  phone_number: string;
  message: string;
  direction: WhatsappDirection;
  message_type: WhatsappMessageType;
  media_url?: string;
  thumbnail_url?: string;
  status: WhatsappStatus;
  thread_id?: string;
  /** Set when the message schedules a follow-up; spawns a follow-up task. */
  follow_up_required?: boolean;
  follow_up_date?: string;
}

export interface ActivityComment {
  id: string;
  activity_id: string;
  comment: string;
  commented_by_id: string;
  parent_comment_id?: string | null;
  commented_by?: User;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  subject: string;
  description?: string;
  lead_id?: string;
  deal_id?: string;
  lead?: Lead;
  deal?: Deal;
  contact_id?: string;
  assigned_to_id?: string | null;
  assigned_to?: User;
  created_by?: User;
  scheduled_at?: string;
  due_at?: string;
  completed_at?: string;
  /** Populated on completed activities via the outcome-capture dialog. */
  completion_outcome?: ActivityOutcome | null;
  completion_note?: string | null;
  duration?: number;
  is_pinned: boolean;
  task?: TaskDetails;
  note?: NoteDetails;
  call?: CallDetails;
  email?: EmailDetails;
  meeting?: MeetingDetails;
  whatsapp?: WhatsappDetails;
  comments?: ActivityComment[];
  created_at: string;
  updated_at: string;
}

// DTOs
export interface CreateTaskDto {
  status?: TaskStatus;
  priority?: TaskPriority;
  estimated_hours?: number;
  tags?: string;
  checklist_items?: string;
}

export interface CreateNoteDto {
  content: string;
  tags?: string;
  visibility?: NoteVisibility;
}

export interface CreateCallDto {
  phone_number: string;
  outcome?: CallOutcome;
  outcome_id?: string;
  duration?: number;
  notes?: string;
  recording_url?: string;
  transcription?: string;
  follow_up_required?: boolean;
  follow_up_date?: string;
  summary?: string;
  next_steps?: string;
}

export interface CreateEmailDto {
  subject: string;
  body: string;
  to_recipients: string;
  cc_recipients?: string;
  bcc_recipients?: string;
  from_email?: string;
  message_id?: string;
  in_reply_to?: string;
  thread_id?: string;
}

export interface CreateMeetingDto {
  title: string;
  platform: MeetingPlatform;
  start_time: string;
  end_time?: string;
  location?: string;
  meeting_link?: string;
  dial_in_number?: string;
  attendees?: string;
  agenda?: string;
  minutes_notes?: string;
  recording_url?: string;
}

export interface CreateWhatsappDto {
  phone_number: string;
  message: string;
  direction: WhatsappDirection;
  message_type: WhatsappMessageType;
  media_url?: string;
  thumbnail_url?: string;
  status?: WhatsappStatus;
  thread_id?: string;
  /**
   * Follow-up date for the message. The server already accepts these
   * (CreateWhatsAppDetailsDto) and spawns an open follow-up task from
   * follow_up_date — they were just missing from the client type.
   */
  follow_up_required?: boolean;
  follow_up_date?: string;
}

/**
 * Demo lifecycle details. One DTO covers all three demo activity
 * subtypes (DEMO_BOOKING / DEMO_DELIVERY / DEMO_FOLLOWUP). Each
 * subtype uses the relevant subset of fields; the server enforces
 * required-field rules per type.
 */
export interface CreateDemoDto {
  // Booking
  planned_at?: string;
  mode?: "on_site" | "virtual";
  expected_attendees?: string[];
  agenda?: string;
  // Delivery
  actual_at?: string;
  attendees_present?: string[];
  products_demonstrated?: string[];
  key_questions?: string;
  pain_points?: string;
  decision_makers_present?: boolean;
  quantity_discussed?: string;
  payment_plan_discussed?: boolean;
  sdc_discussion?: boolean;
  notes?: string;
  attendee_notes?: string;
  // Follow-up
  followup_channel?: "call" | "whatsapp" | "email" | "meeting";
  next_activity_date?: string;
}

export interface CreateActivityDto {
  type: ActivityType;
  status?: ActivityStatus;
  /**
   * For "log a past interaction" creates (status=completed): the outcome
   * and the account of what happened. The server strips both from
   * scheduled creates.
   */
  completion_outcome?: ActivityOutcome;
  completion_note?: string;
  /**
   * "This also covered…" — ids of OPEN activities on the same record that
   * this logged interaction settled (the scheduled meeting that actually
   * took place, the follow-up task the same call answered). Honoured only
   * on status=completed creates; closed in the same transaction.
   */
  closes?: string[];
  subject: string;
  description?: string;
  lead_id?: string;
  deal_id?: string;
  contact_id?: string;
  person_id?: string;
  assigned_to_id?: string | null;
  scheduled_at?: string;
  due_at?: string;
  duration?: number;
  is_pinned?: boolean;
  task?: CreateTaskDto;
  note?: CreateNoteDto;
  call?: CreateCallDto;
  email?: CreateEmailDto;
  meeting?: CreateMeetingDto;
  whatsapp?: CreateWhatsappDto;
  demo?: CreateDemoDto;
}

/**
 * `Partial<CreateActivityDto>` only loosens the TOP-LEVEL fields — the
 * nested sub-objects kept their required members, so a single-field patch
 * like `{ call: { summary } }` would not typecheck (and, until the server
 * DTO was fixed to match, returned a 400). The document view saves one
 * field at a time, so the sub-objects are partial here too.
 */
export type UpdateActivityDto = Partial<
  Omit<
    CreateActivityDto,
    "task" | "note" | "call" | "email" | "meeting" | "whatsapp" | "demo"
  >
> & {
  task?: Partial<CreateTaskDto>;
  note?: Partial<CreateNoteDto>;
  call?: Partial<CreateCallDto>;
  email?: Partial<CreateEmailDto>;
  meeting?: Partial<CreateMeetingDto>;
  whatsapp?: Partial<CreateWhatsappDto>;
  demo?: Partial<CreateDemoDto>;
};

export interface CreateActivityCommentDto {
  comment: string;
}

export interface LeadActivityStats {
  totalActivities: number;
  byType: Record<ActivityType, number>;
  touchesLast7Days: number;
  timeToFirstTouch: number | null; // hours
  meetingsBookedCount: number;
  incompleteLogsCount: number;
  isStale: boolean;
}
