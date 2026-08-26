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
import { isRichTextEmpty } from "~/lib/rich-text";

/**
 * "Required" for a rich-text field means it has words, not that the string is
 * non-empty. A contenteditable that has been typed into and cleared still holds
 * `<br>` or an empty paragraph, which sails past `min(1)` while showing the rep
 * a blank box — so the check runs on the rendered text instead.
 */
const requiredRichText = (message: string) =>
  z.string().refine((value) => !isRichTextEmpty(value), { message });

// --- Note Tab ---
export const noteTabSchema = z.object({
  content: requiredRichText("Note content is required"),
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
// follow_up_date is REQUIRED: a logged call must schedule the next touch,
// otherwise the lead is left with no next step. (It also spawns an open
// follow-up task server-side.) Previously optional — and silently dropped
// by the form — which was the loophole.
export const callTabSchema = z.object({
  phone_number: z.string().min(1, "Phone number is required"),
  outcome: z.enum(CALL_OUTCOMES, "Outcome is required"),
  summary: requiredRichText("Summary is required"),
  next_steps: z.string().optional(),
  follow_up_date: z.date("Follow-up date is required"),
  // DURATION1: how long the call ran (minutes). Optional — the input maps an
  // empty box to undefined so it stays blank rather than coercing to 0.
  duration: z.number().int().positive().max(1440).optional(),
});
export type CallTabValues = z.infer<typeof callTabSchema>;

// --- Email Tab ---
export const emailTabSchema = z.object({
  to_recipients: z.string().min(1, "Recipient is required"),
  cc_recipients: z.string().optional(),
  subject: z.string().min(1, "Subject is required"),
  body: requiredRichText("Body is required"),
  // ACT2 — every open activity needs a "when"; required at the form.
  follow_up_date: z.date("Follow-up date is required"),
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
  // the single largest source of undated activities. Now required.
  follow_up_date: z.date("Follow-up date is required"),
});
export type WhatsAppTabValues = z.infer<typeof whatsappTabSchema>;
