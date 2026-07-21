import {
  isRelationshipTerminalOutcome,
  type Activity,
} from "~/api/activities";

/**
 * Centralised policy for "when a done activity triggers a REQUIRED
 * next-step". Used by the activity-status mutation hooks and the
 * follow-up prompt dialog so every completion site — list row,
 * detail pane, bulk bar, task sheet — applies the same rule.
 *
 *   Rule: marking an activity done on a non-terminal record opens a
 *   mandatory next-step modal. The user cannot leave the record or
 *   dismiss the modal until a follow-up is logged.
 *
 *   Exceptions (required = false):
 *     - the activity is a NOTE (notes are log entries, not work)
 *     - the parent Lead is terminal (Disqualified / Converted)
 *     - the parent Deal is terminal (won / lost)
 *     - the activity has no parent record (standalone; no record to
 *       keep alive)
 */
export function isRecordTerminal(activity: Activity): boolean {
  const leadStatus = activity.lead?.status;
  if (leadStatus === "Disqualified" || leadStatus === "Converted") {
    return true;
  }
  const dealCloseStatus = activity.deal?.closeStatus;
  if (dealCloseStatus === "won" || dealCloseStatus === "lost") {
    return true;
  }
  return false;
}

export function shouldRequireFollowUp(activity: Activity): boolean {
  if (activity.type === "note") return false;
  // Relationship-touchpoint outcomes (information_shared,
  // relationship_touchpoint_complete, awaiting_future_need, training
  // _completed, etc.) legitimately close a school-level interaction
  // without committing to a future action. Respect them — active
  // lead/deal work still requires the next step because those
  // completions will be using pipeline outcomes instead.
  if (isRelationshipTerminalOutcome(activity.completion_outcome)) {
    return false;
  }
  const hasParent = Boolean(
    activity.lead_id || activity.deal_id || activity.contact_id,
  );
  if (!hasParent) return false;
  return !isRecordTerminal(activity);
}
