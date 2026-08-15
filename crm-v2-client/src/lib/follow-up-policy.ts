import { isActionableActivityType, type Activity } from "~/api/activities";

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
 *     - the parent Lead is terminal (Disqualified / Converted)
 *     - the parent Deal is terminal (won / lost)
 *     - the activity has no parent record (standalone; no record to
 *       keep alive)
 *
 * Existing open work is deliberately NOT an exception. Each completed
 * interaction must record what follows from that interaction, even when
 * another task already exists. Roles are not an exception either: managers
 * and admins use the same close-the-loop flow when doing sales work.
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
export type FollowUpPolicyContext = Record<string, never>;

export function shouldRequireFollowUp(
  activity: Activity,
  _context: FollowUpPolicyContext = {},
): boolean {
  // Notes — and any other non-actionable type — never gate.
  if (!isActionableActivityType(activity.type)) return false;
  const hasParent = Boolean(
    activity.lead_id || activity.deal_id || activity.contact_id,
  );
  if (!hasParent) return false;
  return !isRecordTerminal(activity);
}
