import type { Lead } from "~/api/leads";

export interface QualificationProgress {
  completed: number;
  total: number;
  percentage: number;
  isComplete: boolean;
  fields: {
    key: string;
    label: string;
    isComplete: boolean;
    isRequired: boolean;
  }[];
}

// Define the required qualification fields
const REQUIRED_QUALIFICATION_FIELDS = [
  { key: 'decision_maker_confirmed', label: 'Decision Maker Confirmed' },
  { key: 'timeline', label: 'Timeline Established' },
  { key: 'budget_fit', label: 'Budget Fit Assessed' },
  { key: 'solution_fit_confirmed', label: 'Solution Fit Confirmed' },
] as const;

// Optional fields that contribute to completion but aren't required
const OPTIONAL_QUALIFICATION_FIELDS = [
  { key: 'school_type', label: 'School Type' },
  { key: 'estimated_enrollment', label: 'Estimated Enrollment' },
  { key: 'estimated_classrooms', label: 'Estimated Classrooms' },
  { key: 'interest_areas', label: 'Interest Areas' },
  { key: 'decision_maker_identified', label: 'Decision Maker Identified' },
] as const;

/**
 * Calculate qualification progress based on lead fields
 */
export function calculateQualificationProgressFromLead(lead: Lead): QualificationProgress {
  const fields: QualificationProgress['fields'] = [];

  // Check required fields
  for (const field of REQUIRED_QUALIFICATION_FIELDS) {
    const value = lead[field.key as keyof Lead];
    const isComplete = isFieldComplete(value);
    fields.push({
      key: field.key,
      label: field.label,
      isComplete,
      isRequired: true,
    });
  }

  // Check optional fields
  for (const field of OPTIONAL_QUALIFICATION_FIELDS) {
    const value = lead[field.key as keyof Lead];
    const isComplete = isFieldComplete(value);
    fields.push({
      key: field.key,
      label: field.label,
      isComplete,
      isRequired: false,
    });
  }

  const requiredFields = fields.filter(f => f.isRequired);
  const completedRequired = requiredFields.filter(f => f.isComplete).length;
  const totalRequired = requiredFields.length;

  return {
    completed: completedRequired,
    total: totalRequired,
    percentage: totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0,
    isComplete: completedRequired === totalRequired && totalRequired > 0,
    fields,
  };
}

/**
 * Check if a field value is considered "complete"
 */
function isFieldComplete(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value === true;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return value > 0;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

/**
 * Check if a lead can be moved to qualified status based on its fields
 */
export function canQualifyLead(lead: Lead): boolean {
  return calculateQualificationProgressFromLead(lead).isComplete;
}
