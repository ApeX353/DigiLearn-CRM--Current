import type { Activity } from "~/api/activities";

/**
 * Every activity except a note is supposed to carry a follow-up /
 * next-action date, so a rep can never log work that leaves the lead with
 * nothing scheduled. Each type keeps that date in the field natural to it
 * — this mirrors `ActivitiesService.resolveNextActionDate` on the server
 * so the UI and the API agree on what "has a next action" means.
 *
 * The create form still requires a date up front. This helper is for
 * EXISTING records: the document view saves field-by-field with no submit
 * button to block on, so instead of refusing the edit we surface the gap
 * — a banner on the activity and a badge in the log — and let a manager
 * see who is leaving activities open-ended.
 */
export function getNextActionDate(activity?: Activity | null): string | null {
  if (!activity) return null;

  switch (activity.type) {
    case "meeting":
      return activity.meeting?.start_time ?? activity.due_at ?? null;
    case "call":
      return activity.call?.follow_up_date ?? activity.due_at ?? null;
    case "whatsapp":
      return activity.whatsapp?.follow_up_date ?? activity.due_at ?? null;
    default:
      // Demo types keep their date in the `demo` sub-row, which the client
      // Activity type does not carry (the list query never joins it), but
      // the create form mirrors it onto due_at — so due_at is correct for
      // every remaining type.
      return activity.due_at ?? null;
  }
}

/** Notes are record-keeping only and are exempt by product rule. */
export function isNextActionExempt(activity?: Activity | null): boolean {
  return !activity || activity.type === "note";
}

/**
 * True when this activity should have a next-action date but doesn't.
 * Drives the amber "no follow-up scheduled" banner and the log badge.
 */
export function isMissingNextAction(activity?: Activity | null): boolean {
  if (!activity || isNextActionExempt(activity)) return false;
  return !getNextActionDate(activity);
}
