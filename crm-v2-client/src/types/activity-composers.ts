import type { LeadStakeholder } from "~/api/leads";


// Activity types for composers
export type ComposerActivityType = "call" | "whatsapp" | "email" | "meeting" | "note" | "task";

// Outcomes per activity type
export type CallOutcome = "connected" | "voicemail" | "no_answer";
export type WhatsAppOutcome = "sent" | "no_answer";
export type EmailOutcome = "sent";
export type MeetingOutcome = "booked" | "completed";
export type TaskOutcome = "completed";
export type NoteOutcome = never;

export type ComposerOutcome = CallOutcome | WhatsAppOutcome | EmailOutcome | MeetingOutcome | TaskOutcome;

// Type-specific payloads
export interface CallPayload {
  dial?: string;
  durationSec?: number;
}

export interface WhatsAppPayload {
  to: string;
  message: string;
  templateId?: string;
}

export interface EmailPayload {
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  attachments?: string[];
}

export interface MeetingPayload {
  startsAt: string;
  durationMin: number;
  location?: string;
  link?: string;
  attendees: string[];
  agenda?: string;
}

export interface NotePayload {
  body: string;
  visibility: "internal" | "client_safe";
}

export interface TaskPayload {
  title: string;
  dueAt: string;
  assigneeId?: string;
  priority?: "low" | "normal" | "high";
  description?: string;
}

// Main activity payload for submission
export interface ActivityPayload {
  leadId: string;
  type: ComposerActivityType;
  personId?: string;
  outcome?: ComposerOutcome;
  summary?: string;
  
  // Type-specific payloads
  call?: CallPayload;
  whatsapp?: WhatsAppPayload;
  email?: EmailPayload;
  meeting?: MeetingPayload;
  note?: NotePayload;
  task?: TaskPayload;
  
  // Follow-up fields (required unless type === "note")
  nextStep?: string;
  dueAt?: string;
}

// Props shared by all composer components
export interface ComposerProps {
  leadId: string;
  stakeholders: LeadStakeholder[];
  clientSafeFiles: Record<string, string>[];
  onSave: (payload: ActivityPayload) => Promise<void>;
  isSaving: boolean;
}

// Type switcher props
export interface TypeSwitcherProps {
  activeType: ComposerActivityType;
  onTypeChange: (type: ComposerActivityType) => void;
}

// Activity feed item (unified display format)
export interface ActivityFeedItem {
  id: string;
  type: ComposerActivityType;
  outcome?: string;
  personName?: string;
  summary?: string;
  nextStep?: string;
  dueAt?: string;
  createdAt: string;
  createdByName?: string;
  metadata?: Record<string, unknown>;
}
