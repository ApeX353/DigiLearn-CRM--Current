import { z } from "zod";
import {
  NOTE_VISIBILITIES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  CALL_OUTCOMES,
  MEETING_PLATFORMS,
  WHATSAPP_DIRECTIONS,
  WHATSAPP_MESSAGE_TYPES,
} from "~/api/activities/types";

// --- Note Tab ---
export const noteTabSchema = z.object({
  content: z.string().min(1, "Note content is required"),
  visibility: z.enum(NOTE_VISIBILITIES),
});
export type NoteTabValues = z.infer<typeof noteTabSchema>;

// --- Task Tab ---
export const taskTabSchema = z.object({
  description: z.string().min(1, "Task description is required"),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  due_at: z.date("Due date is required"),
  assigned_to_id: z.string().optional(),
});
export type TaskTabValues = z.infer<typeof taskTabSchema>;

// --- Call Tab ---
export const callTabSchema = z.object({
  phone_number: z.string().min(1, "Phone number is required"),
  outcome: z.enum(CALL_OUTCOMES, "Outcome is required"),
  summary: z.string().min(1, "Summary is required"),
  next_steps: z.string().optional(),
  follow_up_date: z.date().optional(),
});
export type CallTabValues = z.infer<typeof callTabSchema>;

// --- Email Tab ---
export const emailTabSchema = z.object({
  to_recipients: z.string().min(1, "Recipient is required"),
  cc_recipients: z.string().optional(),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  // ACT2 — every open activity needs a "when".
  follow_up_date: z.date().optional(),
});
export type EmailTabValues = z.infer<typeof emailTabSchema>;

// --- Meeting Tab ---
export const meetingTabSchema = z.object({
  title: z.string().min(1, "Title is required"),
  platform: z.enum(MEETING_PLATFORMS),
  start_time: z.date("Start time is required"),
  end_time: z.date("End time is required"),
  location: z.string().optional(),
  meeting_link: z.string().optional(),
  attendees: z.string().optional(),
  agenda: z.string().optional(),
});
export type MeetingTabValues = z.infer<typeof meetingTabSchema>;

// --- WhatsApp Tab ---
export const whatsappTabSchema = z.object({
  phone_number: z.string().min(1, "Phone number is required"),
  message: z.string().min(1, "Message is required"),
  direction: z.enum(WHATSAPP_DIRECTIONS),
  message_type: z.enum(WHATSAPP_MESSAGE_TYPES),
  // ACT2 — WhatsApp had no date field at all, which is why it was
  // the single largest source of undated activities.
  follow_up_date: z.date().optional(),
});
export type WhatsAppTabValues = z.infer<typeof whatsappTabSchema>;
