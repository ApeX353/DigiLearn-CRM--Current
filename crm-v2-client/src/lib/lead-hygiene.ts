import type { Lead } from "~/api/leads";
import type { Activity } from "~/api/activities";
import type { LeadQualificationCriteria } from "~/api/lead-qualification";
import {
  calculateLeadCompleteness,
  type LeadCompleteness,
} from "./lead-completeness";
import { isActionableActivityType } from "~/api/activities";
import { isTerminalStatus } from "~/api/leads";

/**
 * Hygiene score (Phase 9 of the management-control pass).
 *
 * The pre-existing `lead-completeness` helper only graded data-field
 * presence. The hygiene score fuses four weighted categories:
 *
 *   - Data completeness       25 points  (delegates to lead-completeness)
 *   - Activity discipline     30 points  (next-step / overdue / outcome)
 *   - Process discipline      20 points  (status sanity, no stale silence)
 *   - Qualification quality   25 points  (BANT)
 *
 * Notes must NEVER inflate discipline — the scoring only rewards
 * OPEN ACTIONABLE activities. Passive logging doesn't move the score.
 *
 * Bands:
 *   90–100  Excellent
 *   75–89   Good
 *   60–74   At Risk
 *   <60     Poor
 */

export type HygieneBand = "Excellent" | "Good" | "At Risk" | "Poor";

export interface HygieneBreakdown {
  data_completeness: number;
  activity_discipline: number;
  process_discipline: number;
  qualification_quality: number;
}

export interface HygieneScore {
  overall: number;
  band: HygieneBand;
  breakdown: HygieneBreakdown;
  penalties: string[];
  completeness: LeadCompleteness;
}

function hasOpenActionableNextStep(activities: Activity[] | undefined): boolean {
  if (!activities) return false;
  const now = Date.now();
  return activities.some(
    (a) =>
      isActionableActivityType(a.type) &&
      a.status !== "completed" &&
      a.status !== "cancelled" &&
      !a.completed_at &&
      !!a.due_at &&
      new Date(a.due_at).getTime() >= now,
  );
}

function hasOverdueOpenActivity(
  activities: Activity[] | undefined,
): boolean {
  if (!activities) return false;
  const now = Date.now();
  return activities.some(
    (a) =>
      a.status !== "completed" &&
      a.status !== "cancelled" &&
      !a.completed_at &&
      a.due_at &&
      new Date(a.due_at).getTime() < now,
  );
}

function lastTouchOk(lead: Lead, slaHours = 72): boolean {
  const t = lead.last_contacted_at ?? lead.last_action_at;
  if (!t) return false;
  const age = Date.now() - new Date(t).getTime();
  return age <= slaHours * 60 * 60 * 1000;
}

function recentOutcomeCompliance(
  activities: Activity[] | undefined,
): number {
  // % of the last 5 completed activities that recorded an outcome.
  if (!activities) return 0;
  const completed = activities
    .filter(
      (a) =>
        a.status === "completed" &&
        // Only actionable completions count toward outcome compliance.
        // Notes don't transition through 'completed' in the new model,
        // but this filter keeps the helper safe against legacy rows.
        isActionableActivityType(a.type),
    )
    .sort((a, b) => {
      const at = new Date(a.completed_at ?? a.created_at).getTime();
      const bt = new Date(b.completed_at ?? b.created_at).getTime();
      return bt - at;
    })
    .slice(0, 5);
  if (completed.length === 0) return 0;
  const withOutcome = completed.filter((a) => a.completion_outcome).length;
  return withOutcome / completed.length;
}

function recentNoteCompliance(activities: Activity[] | undefined): boolean {
  if (!activities) return true;
  const completedActionable = activities.filter(
    (a) =>
      a.status === "completed" &&
      isActionableActivityType(a.type),
  );
  if (completedActionable.length === 0) return true;

  const notes = activities.filter((a) => a.type === "note");
  return completedActionable.every((activity) => {
    if (activity.description || activity.completion_note) return true;
    const completedAt = new Date(
      activity.completed_at ?? activity.created_at,
    ).getTime();
    return notes.some(
      (note) => new Date(note.created_at).getTime() >= completedAt,
    );
  });
}

export function computeLeadHygieneScore(input: {
  lead: Lead;
  qualification?: LeadQualificationCriteria | null;
  activities?: Activity[];
}): HygieneScore {
  const { lead, qualification, activities } = input;
  const penalties: string[] = [];

  // ======== Data completeness (25 pts) ========
  const completeness = calculateLeadCompleteness(
    lead,
    qualification ?? null,
  );
  // completeness.score is already 0–100; map to the 25-point budget.
  const dataScore = Math.round((completeness.score / 100) * 25);
  if (completeness.missingCritical.length > 0) {
    penalties.push(
      `Missing critical: ${completeness.missingCritical
        .map((f) => f.label)
        .join(", ")}`,
    );
  }

  // ======== Activity discipline (30 pts) ========
  let activityPts = 0;
  if (hasOpenActionableNextStep(activities)) {
    activityPts += 12;
  } else {
    penalties.push("No actionable next step scheduled");
  }
  if (!hasOverdueOpenActivity(activities)) {
    activityPts += 6;
  } else {
    penalties.push("Has overdue open activity");
  }
  if (lastTouchOk(lead)) {
    activityPts += 6;
  } else {
    penalties.push("No recent touch within SLA window");
  }
  const outcomeRate = recentOutcomeCompliance(activities);
  activityPts += Math.round(6 * outcomeRate);
  if (outcomeRate < 1 && (activities?.length ?? 0) > 0) {
    penalties.push(
      `Recent completions missing outcomes (${Math.round(
        outcomeRate * 100,
      )}% compliant)`,
    );
  }
  if (!recentNoteCompliance(activities)) {
    activityPts = Math.max(0, activityPts - 3);
    penalties.push("Completed activity missing notes/context");
  }
  activityPts = Math.min(30, activityPts);

  // ======== Process discipline (20 pts) ========
  let processPts = 0;
  if (lead.status && !isTerminalStatus(lead.status)) processPts += 5;
  // Required fields for current stage (proxy: both contact + school).
  if (lead.school?.id && lead.primary_contact?.id) processPts += 5;
  // SLA not breached (Phase 2 rule from the earlier pass — SLA timer
  // is independent of follow-up due date, so this is a real signal).
  if (!lead.sla_breached) {
    processPts += 5;
  } else {
    penalties.push("SLA breached");
  }
  // Rep assigned (orphan leads hurt process).
  if (lead.assignee?.id) {
    processPts += 5;
  } else {
    penalties.push("Unassigned lead");
  }

  // ======== Qualification quality (25 pts) ========
  let qualPts = 0;
  if (qualification) {
    const flags = [
      // Authority (decision-maker / influential contact present)
      qualification.has_influential_contact,
      qualification.has_budget,
      qualification.has_needs ||
        Boolean(qualification.qualification_needs?.length),
      qualification.has_timeline,
      Boolean(qualification.qualification_needs?.length),
    ];
    const filled = flags.filter(Boolean).length;
    qualPts = Math.round((filled / flags.length) * 25);
    if (filled < flags.length) {
      penalties.push(`Qualification incomplete (${filled}/5 MVD captured)`);
    }
  } else {
    penalties.push("No qualification record");
  }

  const overall = Math.max(
    0,
    Math.min(100, dataScore + activityPts + processPts + qualPts),
  );
  const band: HygieneBand =
    overall >= 90
      ? "Excellent"
      : overall >= 75
        ? "Good"
        : overall >= 60
          ? "At Risk"
          : "Poor";

  return {
    overall,
    band,
    breakdown: {
      data_completeness: dataScore,
      activity_discipline: activityPts,
      process_discipline: processPts,
      qualification_quality: qualPts,
    },
    penalties,
    completeness,
  };
}

export function hygieneBandColor(band: HygieneBand): string {
  switch (band) {
    case "Excellent":
      return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900";
    case "Good":
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900";
    case "At Risk":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900";
    case "Poor":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900";
  }
}
