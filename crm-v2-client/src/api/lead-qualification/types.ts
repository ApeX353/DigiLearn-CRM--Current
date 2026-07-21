import z from "zod";

export const PLAN_TYPES = ["cash", "3-term", "6-term", "9-term"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const TIMELINE_TYPES = [
  "this-term",
  "next-term",
  "within-6-months",
  "within-1-year",
  "specific-date",
] as const;
export type TimelineType = (typeof TIMELINE_TYPES)[number];

export const BUDGET_INDICATORS = [
  "high",
  "medium",
  "low",
  "not-disclosed",
] as const;
export type BudgetIndicator = (typeof BUDGET_INDICATORS)[number];

export interface QualificationNeeds {
  id: string;
  name: string;
  price: number;
  tax: number;
  discount: number;
}

export interface LeadQualificationCriteria {
  id: string;
  lead_id: string;
  // need assessment - might need to store Record<string, string>[]
  needs: string | null;
  qualification_needs: QualificationNeeds[] | null;
  has_needs: boolean;
  // plan type.
  plan_type: PlanType | null;
  has_plan_type: boolean;
  // timeline
  timeline_type: TimelineType | null;
  specific_date: string | null;
  has_timeline: boolean;
  // budget indicators
  budget_indicator: BudgetIndicator | null;
  budget_amount: string | null;
  has_budget: boolean;
  // this is decision maker
  decision_maker_name: string;
  decision_maker_title: string;
  has_verified_contact: boolean;
  has_influential_contact: boolean;
  checklist: {
    phone_verified: boolean;
    email_verified: boolean;
    province_verified: boolean;
  };
  qualification_score: number;
  is_qualified: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateLeadQualificationDto {
  needs?: string;
  // Product snapshots backing the needs string. The backend's
  // qualify-lead MVD gate requires this array to be non-empty
  // ("boards/products required") — the human-readable `needs`
  // string alone does not satisfy it.
  qualification_needs?: QualificationNeeds[];
  plan_type?: string;
  timeline_type?: TimelineType;
  specific_date?: string;
  budget_indicator?: BudgetIndicator;
  budget_amount?: string;
  decision_maker_name?: string;
  decision_maker_title?: string;
  phone_verified?: boolean;
  email_verified?: boolean;
  province_verified?: boolean;
}

export const leadQualificationSchema = z
  .object({
    // Decision maker (Authority) - stakeholder_id is used to select, then we extract name/title
    stakeholder_id: z.string().min(1, "Decision maker is required"),
    decision_maker_name: z.string().optional(),
    decision_maker_title: z.string().optional(),
    // Needs - product_ids are selected, then converted to CSV of names
    product_ids: z.array(z.string()).min(1, "At least one product is required"),
    needs: z.string().optional(),
    // Plan type - payment_term_id is selected, then we use the name
    payment_term_id: z.string().min(1, "Payment plan is required"),
    plan_type: z.string().optional(),
    // Timeline
    timeline_type: z.enum(TIMELINE_TYPES),
    specific_date: z.string().optional(),
    // Budget
    budget_indicator: z.enum(BUDGET_INDICATORS),
    budget_amount: z.string().optional(),
    checklist: z
      .object({
        phone_verified: z.boolean().optional(),
        email_verified: z.boolean().optional(),
        province_verified: z.boolean().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      // If timeline is specific-date, require specific_date
      if (data.timeline_type === "specific-date") {
        return !!data.specific_date;
      }
      return true;
    },
    {
      message: "Please select a specific date",
      path: ["specific_date"],
    },
  )
  .refine(
    (data) => {
      // If budget is not "not-disclosed", require budget_amount
      if (data.budget_indicator !== "not-disclosed") {
        return !!data.budget_amount;
      }
      return true;
    },
    {
      message: "Please enter a budget amount",
      path: ["budget_amount"],
    },
  );

export type LeadQualificationValues = z.infer<typeof leadQualificationSchema>;
