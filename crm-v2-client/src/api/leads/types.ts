import type { User } from "~/stores/use-auth-store";
import type { Stage } from "../pipelines";
import {
  CHURCH_DENOMINATIONS,
  OWNERSHIP_TYPES,
  PROVINCES,
  REGIONS,
  SCHOOL_TYPES,
  type School,
} from "../schools";
import {
  createContactSchema,
  type Contact,
  type ContactRole,
  type PreferredContactMethod,
} from "../contacts";
import z from "zod";

export const LEAD_STATUSES = [
  "New",
  "Contacted",
  "Nurture",
  "Qualified",
  "Disqualified",
  "Converted",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_SOURCES = [
  "Website",
  "Referral",
  "Social Media",
  "Email Campaign",
  "Cold Call",
  "Event",
  "Other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const DECISION_ROLES = [
  "decision_maker",
  "influencer",
  "gatekeeper",
  "champion",
  "blocker",
] as const;
export type DecisionRole = (typeof DECISION_ROLES)[number];

export const INFLUENCE_LEVELS = ["high", "medium", "low"] as const;
export type InfluenceLevel = (typeof INFLUENCE_LEVELS)[number];

export interface Lead {
  id: string;
  status: LeadStatus;
  lead_name: string;
  source: LeadSource;
  estimated_value: number;
  school?: School;
  primary_contact?: Contact;
  assignee: User;
  /** Deals this lead became. Loaded on the lead DETAIL endpoint only —
   * a Converted lead's page links here instead of offering to convert. */
  deals?: Array<{
    id: string;
    title?: string;
    closeStatus?: string;
    close_status?: string;
    created_at?: string;
  }>;
  assigned_to?: string | null;
  stage: Stage;
  notes: string;
  last_contacted_at: Date | null;
  converted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
  current_sla_due_date: Date | null;
  sla_breached: boolean;
  sla_breach_count: number;
  last_action_at: Date | null;
  // Temperature scoring
  temperature: "hot" | "warm" | "cold" | null;
  temperature_score: number | null;
  temperature_last_calculated: Date | null;
  // BANT Qualification fields
  decision_maker_confirmed?: boolean;
  budget_fit?: boolean;
  solution_fit_confirmed?: boolean;
  implementation_timeline?: string;
  // Demo + Commercial-Intent feature
  demo_status?: 'demo_scheduled' | 'demo_completed' | null;
  demo_status_changed_at?: string | null;
  commercial_intent?: boolean;
  commercial_intent_at?: string | null;
  commercial_intent_reason?: string | null;
  /**
   * The open approval request on this lead, if there is one. Carried on the
   * lead so a manager sees it where the work is, instead of discovering it
   * in a queue somewhere else.
   */
  pending_approval?: {
    id: string;
    kind: "status_reversal" | "reassignment" | "tactical_disqualify";
    requested_status?: string | null;
    reason?: string | null;
    requested_by_id?: string | null;
    requested_at?: string | null;
    awaiting_rep_response: boolean;
    enquiry_count: number;
    waiting_on: "rep" | "manager";
  } | null;
  /** Why the lead was Nurtured/Disqualified — written by those dialogs. */
  reason?: string | null;
  demo_followup_sla_breached?: boolean;
}

export interface UpdateLeadPayload {
  status?: LeadStatus;
  notes?: string;
  assigned_to?: string;
  stage_id?: string;
  estimated_value?: number;
  source?: LeadSource;
  lead_name?: string;
  school_id?: string;
  primary_contact_id?: string;
  last_contacted_at?: string | Date | null;
  converted_at?: string | Date | null;
  nurture_reason?: string;
  follow_up_date?: string;
  disqualify_reason?: string;
  [key: string]: unknown;
}

export interface LeadStakeholder {
  id: string;
  lead?: Lead;
  lead_id: string;
  contact?: Contact;
  contact_id: string;
  role: ContactRole;
  decision_role: DecisionRole;
  influence_level: InfluenceLevel;
  is_primary: boolean;
  notes: string;
}

export interface AddLeadStakeholderPayload {
  contact_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  secondary_phone?: string;
  whatsapp_number?: string;
  role?: ContactRole;
  preferred_contact_method?: PreferredContactMethod;
  decision_role?: DecisionRole;
  influence_level?: InfluenceLevel;
  is_primary?: boolean;
  notes?: string;
}

export const leadInfoSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  source: z.enum(LEAD_SOURCES),
  school_id: z.string().max(36).optional(),
  school_name: z.string().min(1).max(255),
  province: z.enum(PROVINCES).optional(),
  ownership_type: z.enum(OWNERSHIP_TYPES).optional(),
  school_type: z.enum(SCHOOL_TYPES).optional(),
  church_denomination: z.enum(CHURCH_DENOMINATIONS).optional(),
  district: z.string().optional(),
  region: z.enum(REGIONS).optional(),
  city: z.string().optional(),
  estimated_value: z.number().optional(),
  // LNAME2: what the client is interested in / wants. Captured on the lead
  // and carried into the deal description on conversion.
  notes: z.string().max(2000).optional(),
  assigned_to: z.string().max(36).optional(), // For managers/admins to assign to sales agents
  // Campaign/event the lead was captured at (e.g. NASH congress).
  // Survives lead→deal conversion for campaign ROI attribution.
  source_campaign_id: z.string().uuid().optional(),
});

export const contactsSchema = z
  .array(createContactSchema)
  .min(1, "At least one contact is required");

export const createLeadSchema = z.object({
  lead: leadInfoSchema,
  contacts: contactsSchema,
});

export type AddLeadValues = z.infer<typeof createLeadSchema>;
