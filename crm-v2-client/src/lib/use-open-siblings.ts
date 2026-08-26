import { useMemo } from "react";
import { type Activity, useActivityList } from "~/api/activities";
import { activityColor } from "~/lib/activity-state";

/**
 * Open, actionable activities on the same record — "what else is planned
 * (or still hanging) on this lead / deal".
 *
 * One line of communication: when a rep logs a call or closes an activity,
 * the question is never just "what happened here" but "what does this
 * settle, and is the next step already planned?" Both the inline composer
 * and the close-the-loop dialog read this one list so they answer those
 * questions the same way:
 *
 *   - `dated`   — open items with a due/scheduled date, soonest first. The
 *                 earliest one IS the record's current next step; any of
 *                 them can be nominated as "already planned".
 *   - `undated` — legacy open rows with no date (history stored as work, or
 *                 plans nobody dated). They can be closed as covered but
 *                 cannot stand as a next step until someone dates them.
 *
 * Notes are never siblings: they are records, not work.
 */
const ACTIONABLE = new Set(["task", "call", "email", "meeting", "whatsapp"]);

export interface OpenSiblingsArgs {
  leadId?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  /** The activity being logged / completed — never its own sibling. */
  excludeId?: string | null;
  enabled?: boolean;
}

export function isOverdueOrDueToday(a: Activity): boolean {
  const colour = activityColor({
    dueAt: a.due_at ?? undefined,
    scheduledAt: a.scheduled_at ?? undefined,
    completedAt: a.completed_at ?? undefined,
    status: a.status ?? undefined,
  });
  return colour === "red" || colour === "green";
}

export function siblingWhen(a: Activity): string | null {
  return a.due_at ?? a.scheduled_at ?? null;
}

export function useOpenSiblings({
  leadId,
  dealId,
  contactId,
  excludeId,
  enabled = true,
}: OpenSiblingsArgs) {
  const hasParent = Boolean(leadId || dealId || contactId);
  const { data, isLoading } = useActivityList({
    lead_id: leadId ?? undefined,
    deal_id: dealId ?? undefined,
    // Contact-only activities (school pages) share the contact instead.
    contact_id: leadId || dealId ? undefined : (contactId ?? undefined),
    open_only: true,
    limit: 50,
    page: 1,
    include_details: true,
    enabled: enabled && hasParent,
  });

  return useMemo(() => {
    // A contact-only source (school page) may only see other contact-only
    // rows: a lead's or deal's open work belongs to that record's own
    // next-step gate, and the server rejects closing it from here.
    const contactOnly = !leadId && !dealId;
    const all = (data?.data ?? []).filter(
      (a) =>
        a.id !== excludeId &&
        ACTIONABLE.has(a.type) &&
        a.status !== "completed" &&
        a.status !== "cancelled" &&
        (!contactOnly || (!a.lead_id && !a.deal_id)),
    );
    const byWhen = (a: Activity, b: Activity) =>
      new Date(siblingWhen(a) as string).getTime() -
      new Date(siblingWhen(b) as string).getTime();
    const dated = all.filter((a) => siblingWhen(a)).sort(byWhen);
    const undated = all.filter((a) => !siblingWhen(a));
    // Dated first (overdue / soonest at the top — the likely candidates),
    // then the undated stragglers.
    return { siblings: [...dated, ...undated], dated, undated, isLoading };
  }, [data, excludeId, isLoading, leadId, dealId]);
}
