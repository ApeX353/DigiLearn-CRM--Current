import type { Lead } from "~/api/leads";
import type { Activity } from "~/api/activities";
import type { LeadQualificationCriteria } from "~/api/lead-qualification";
import { isActionableActivityType } from "~/api/activities";

/**
 * Per-lead compliance checklist (Phase 10 of the management-control
 * pass).
 *
 * Each item is a derived boolean. The UI renders a tight list with
 * a check icon per item and an optional "fix it" deep-link. The
 * same helper feeds the rep-level compliance digest (future phase)
 * via aggregation.
 *
 * Keep this list small enough that every item is ACTIONABLE — if an
 * item can't point the rep at a one-click fix, it doesn't belong.
 */
export interface ComplianceItem {
  key: string;
  label: string;
  passed: boolean;
  hint?: string;
  fixHref?: string; // relative anchor or tab value on the lead detail page
}

export interface LeadComplianceReport {
  items: ComplianceItem[];
  passedCount: number;
  totalCount: number;
}

export function computeLeadCompliance(input: {
  lead: Lead;
  qualification?: LeadQualificationCriteria | null;
  activities?: Activity[];
  hasOpenEscalation?: boolean;
  duplicateSuspected?: boolean;
}): LeadComplianceReport {
  const { lead, qualification, activities } = input;
  const items: ComplianceItem[] = [];

  // Owner
  items.push({
    key: "owner",
    label: "Owner assigned",
    passed: Boolean(lead.assignee?.id),
    hint: lead.assignee?.id
      ? undefined
      : "Unassigned leads can't be managed or reported on.",
  });

  // Contact captured
  items.push({
    key: "contact",
    label: "Primary contact captured",
    passed: Boolean(lead.primary_contact?.id),
    fixHref: "people",
  });

  // Source captured
  items.push({
    key: "source",
    label: "Lead source captured",
    passed: Boolean(lead.source),
  });

  // First contact logged (any completed actionable activity or
  // last_contacted_at populated).
  const firstContactLogged =
    Boolean(lead.last_contacted_at) ||
    (activities ?? []).some(
      (a) =>
        isActionableActivityType(a.type) && a.status === "completed",
    );
  items.push({
    key: "first_contact",
    label: "First contact logged",
    passed: firstContactLogged,
    fixHref: "activity",
  });

  // Outcome recorded on last completed activity
  const completedActionable = (activities ?? [])
    .filter(
      (a) =>
        a.status === "completed" &&
        isActionableActivityType(a.type),
    )
    .sort((a, b) => {
      const at = new Date(a.completed_at ?? a.created_at).getTime();
      const bt = new Date(b.completed_at ?? b.created_at).getTime();
      return bt - at;
    });
  const lastCompletedHasOutcome = completedActionable[0]
    ? Boolean(completedActionable[0].completion_outcome)
    : true; // vacuously ok if nothing completed yet
  items.push({
    key: "last_outcome",
    label: "Last completed activity has outcome",
    passed: lastCompletedHasOutcome,
  });

  // Actionable next step (NOT a note — product rule)
  const hasNextStep = (activities ?? []).some(
    (a) =>
      isActionableActivityType(a.type) &&
      a.status !== "completed" &&
      a.status !== "cancelled" &&
      !a.completed_at,
  );
  items.push({
    key: "next_step",
    label: "Actionable next step scheduled",
    passed: hasNextStep,
    hint: hasNextStep
      ? undefined
      : "Notes don't count — schedule a call, meeting, task, email, or WhatsApp.",
    fixHref: "activity",
  });

  // Qualification captured. Our BANT schema uses
  // `has_influential_contact` as the Authority flag (an influential /
  // decision-making contact is on the lead); the other three map 1:1.
  const bantFilled = qualification
    ? [
        qualification.has_influential_contact,
        qualification.has_budget,
        qualification.has_needs,
        qualification.has_timeline,
      ].filter(Boolean).length
    : 0;
  items.push({
    key: "qualification",
    label: `Qualification captured (${bantFilled}/4 BANT)`,
    passed: bantFilled === 4,
    fixHref: "timeline",
  });

  // Duplicate risk reviewed (passed iff NOT currently suspected, OR
  // manager has reviewed it — we approximate: `duplicateSuspected`
  // flag is true while the suspicion row is still `pending`).
  items.push({
    key: "duplicate",
    label: "Duplicate risk reviewed",
    passed: !input.duplicateSuspected,
    hint: input.duplicateSuspected
      ? "Open duplicate suspicion — manager should review + merge or mark false positive."
      : undefined,
  });

  // Escalation resolved (vacuously ok if none open).
  items.push({
    key: "escalation",
    label: "No unresolved escalation",
    passed: !input.hasOpenEscalation,
  });

  return {
    items,
    passedCount: items.filter((i) => i.passed).length,
    totalCount: items.length,
  };
}
