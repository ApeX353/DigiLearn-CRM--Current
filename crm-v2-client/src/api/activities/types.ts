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
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

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
}

export interface CreateActivityDto {
  type: ActivityType;
  status?: ActivityStatus;
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
}

export type UpdateActivityDto = Partial<CreateActivityDto>;

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
