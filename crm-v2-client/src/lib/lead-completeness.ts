import type { Lead } from "~/api/leads";
import type { LeadQualificationCriteria } from "~/api/lead-qualification";

/**
 * A single data-quality signal on a lead — e.g. "main contact missing",
 * "no next activity", "qualification incomplete". Each signal has a
 * weight that contributes to the overall 0–100 health score.
 */
export type CompletenessFieldKey =
  | "school_name"
  | "school_location"
  | "primary_contact"
  | "contact_role"
  | "contact_phone"
  | "contact_email"
  | "lead_source"
  | "estimated_value"
  | "assignee"
  | "last_contacted"
  | "qualification_budget"
  | "qualification_authority"
  | "qualification_needs"
  | "qualification_timeline";

export interface CompletenessField {
  key: CompletenessFieldKey;
  label: string;
  isComplete: boolean;
  isCritical: boolean;
  weight: number;
  hint?: string;
}

export type CompletenessStatus = "complete" | "partial" | "critical";

export interface LeadCompleteness {
  score: number; // 0–100
  status: CompletenessStatus;
  fields: CompletenessField[];
  missingCritical: CompletenessField[];
  missingOptional: CompletenessField[];
  totalWeight: number;
  earnedWeight: number;
}

const hasText = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

const hasNumber = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Computes a 0–100 health score for a lead based on how well its
 * sales-intelligence fields are filled out. Scores below 60 are
 * treated as "critical" (missing foundational data), 60–84 are
 * "partial", and 85+ are "complete".
 *
 * Weights reflect sales impact: a missing main contact hurts more
 * than a missing email. Qualification fields are only counted when
 * the lead has progressed past the "New" stage.
 */
export function calculateLeadCompleteness(
  lead: Lead,
  qualification?: LeadQualificationCriteria | null,
): LeadCompleteness {
  const isPastNew = lead.status !== "New";

  const phonePresent =
    hasText(lead.primary_contact?.phone) ||
    hasText(lead.primary_contact?.whatsapp_number);

  const fields: CompletenessField[] = [
    {
      key: "school_name",
      label: "School name",
      isComplete: hasText(lead.school?.name),
      isCritical: true,
      weight: 10,
      hint: "Identify the school this lead represents.",
    },
    {
      key: "school_location",
      label: "School location",
      isComplete:
        hasText(lead.school?.city) || hasText(lead.school?.province),
      isCritical: false,
      weight: 5,
      hint: "Add city and province so the rep can plan territory visits.",
    },
    {
      key: "primary_contact",
      label: "Main contact",
      isComplete: !!lead.primary_contact?.id,
      isCritical: true,
      weight: 12,
      hint: "Every lead needs at least one real person to talk to.",
    },
    {
      key: "contact_role",
      label: "Contact role",
      isComplete: hasText(lead.primary_contact?.role),
      isCritical: false,
      weight: 6,
      hint: "Knowing the role (Head, Bursar, ICT…) helps route the pitch.",
    },
    {
      key: "contact_phone",
      label: "Phone or WhatsApp",
      isComplete: phonePresent,
      isCritical: true,
      weight: 10,
      hint: "A reachable phone number is required to make contact.",
    },
    {
      key: "contact_email",
      label: "Contact email",
      isComplete: hasText(lead.primary_contact?.email),
      isCritical: false,
      weight: 5,
      hint: "Needed for quotations, invoices, and follow-ups.",
    },
    {
      key: "lead_source",
      label: "Lead source",
      isComplete: hasText(lead.source),
      isCritical: false,
      weight: 4,
      hint: "Track where your leads come from to improve marketing ROI.",
    },
    {
      key: "estimated_value",
      label: "Estimated value",
      isComplete: hasNumber(lead.estimated_value),
      isCritical: false,
      weight: 6,
      hint: "An order-of-magnitude deal size helps prioritise the pipeline.",
    },
    {
      key: "assignee",
      label: "Owner",
      isComplete: !!lead.assignee?.id,
      isCritical: true,
      weight: 8,
      hint: "Unassigned leads get ignored. Assign an owner.",
    },
    {
      key: "last_contacted",
      label: "Recent activity",
      isComplete: !!lead.last_action_at || !!lead.last_contacted_at,
      isCritical: false,
      weight: 4,
      hint: "Log a call, email, or meeting so stakeholders can see momentum.",
    },
  ];

  // `undefined` = the caller never loaded the qualification record
  // (list rows, kanban cards — fetching it per row would be N+1).
  // Skip those fields rather than scoring them as missing: before this
  // distinction, every past-New lead in a list was branded "critical"
  // because qualification_authority could never be satisfied.
  // `null` = loaded and genuinely absent — counts as incomplete.
  if (isPastNew && qualification !== undefined) {
    fields.push(
      {
        key: "qualification_authority",
        label: "Decision maker identified",
        isComplete: !!qualification?.has_influential_contact,
        isCritical: true,
        weight: 8,
        hint: "Who can actually sign off on this purchase?",
      },
      {
        key: "qualification_budget",
        label: "Budget confirmed",
        isComplete: !!qualification?.has_budget,
        isCritical: false,
        weight: 6,
        hint: "Capture budget indicator or amount to qualify the deal.",
      },
      {
        key: "qualification_needs",
        label: "Needs identified",
        isComplete:
          !!qualification?.has_needs ||
          Boolean(qualification?.qualification_needs?.length),
        isCritical: false,
        weight: 8,
        hint: "What products or outcomes is the school looking for?",
      },
      {
        key: "qualification_timeline",
        label: "Timeline set",
        isComplete: !!qualification?.has_timeline,
        isCritical: false,
        weight: 4,
        hint: "When does the school expect to buy?",
      },
    );
  }

  const totalWeight = fields.reduce((sum, f) => sum + f.weight, 0);
  const earnedWeight = fields
    .filter((f) => f.isComplete)
    .reduce((sum, f) => sum + f.weight, 0);

  const score = totalWeight > 0
    ? Math.round((earnedWeight / totalWeight) * 100)
    : 0;

  const missingCritical = fields.filter((f) => !f.isComplete && f.isCritical);
  const missingOptional = fields.filter((f) => !f.isComplete && !f.isCritical);

  let status: CompletenessStatus;
  if (missingCritical.length > 0 || score < 60) {
    status = "critical";
  } else if (score < 85) {
    status = "partial";
  } else {
    status = "complete";
  }

  return {
    score,
    status,
    fields,
    missingCritical,
    missingOptional,
    totalWeight,
    earnedWeight,
  };
}

/**
 * Tailwind tokens for rendering the status pill consistently across
 * lead detail pages, list rows, and kanban cards.
 */
export function getCompletenessTone(status: CompletenessStatus): {
  label: string;
  dot: string;
  chip: string;
  bar: string;
} {
  switch (status) {
    case "complete":
      return {
        label: "Complete",
        dot: "bg-emerald-500",
        chip:
          "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900",
        bar: "bg-emerald-500",
      };
    case "partial":
      return {
        label: "Partial",
        dot: "bg-amber-500",
        chip:
          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
        bar: "bg-amber-500",
      };
    case "critical":
    default:
      return {
        label: "Needs info",
        dot: "bg-red-500",
        chip:
          "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900",
        bar: "bg-red-500",
      };
  }
}
