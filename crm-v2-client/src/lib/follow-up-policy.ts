import {
  isActionableActivityType,
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
 *     - the activity is not an ACTIONABLE type (notes are log
 *       entries, not work)
 *     - the record ALREADY carries an open actionable next step —
 *       the commitment exists, so demanding a second one just to
 *       clear the modal is busywork (see `hasOpenNextStep`)
 *     - the actor is an admin / sales_manager (they bypass the gate)
 *     - the parent Lead is terminal (Disqualified / Converted)
 *     - the parent Deal is terminal (won / lost)
 *     - the activity has no parent record (standalone; no record to
 *       keep alive)
 *
 * These exceptions MIRROR the server gate in
 * `activities.service.ts#assertNextStepCompliance`. The client used
 * to be strictly harsher than the server — it ignored the existing
 * -future-activity escape hatch and the manager bypass — which meant
 * a rep with a meeting booked two weeks out still got a modal they
 * could not dismiss, and could not log the interim call they had
 * just made (LCK1 / C9). Keep the two in step.
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

/**
 * Context the caller knows at decision time. Both flags default to
 * `false` so existing call sites keep their current behaviour; the
 * prompt dialog fills them in once it has resolved the record's open
 * activities and the current user's roles.
 */
export type FollowUpPolicyContext = {
  /** Admin / sales_manager — bypasses the gate, same as the server. */
  isManagerOrAdmin?: boolean;
  /**
   * The parent lead/deal already has another OPEN actionable
   * activity. The server accepts this as satisfying the gate, so the
   * modal must not hold the user hostage for a duplicate.
   */
  hasOpenNextStep?: boolean;
};

export function shouldRequireFollowUp(
  activity: Activity,
  context: FollowUpPolicyContext = {},
): boolean {
  // Notes — and any other non-actionable type — never gate.
  if (!isActionableActivityType(activity.type)) return false;
  if (context.isManagerOrAdmin) return false;
  if (context.hasOpenNextStep) return false;
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
