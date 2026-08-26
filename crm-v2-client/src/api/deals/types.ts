import * as z from "zod";
import type { Stage, Pipeline } from "../pipelines";
import type { User } from "~/stores/use-auth-store";
import type { Quote } from "../quotes";
import type { Invoice } from "../invoices";
import { quoteItemSchema } from "../quotes";
import type { Paginated } from "../common-api-type";

export type DealStatus = "ongoing" | "won" | "lost";
export type DealCloseStatus = "won" | "lost";

export interface DealStageHistory {
  id: string;
  dealId?: string;
  movedBy?: string;
  moved_by?: {
    id: string;
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  fromStatus?: string | null;
  toStatus?: string | null;
  notes?: string | null;
  movedAt?: string;
  slaCompliant?: boolean;
  timeInStage?: number | null;
  slaDeadlineWas?: string | null;
}

export interface Deal {
  id: string;
  title: string;
  deal_name?: string;
  value: number;
  position: number;
  current_stage_id: string;
  current_stage?: Stage;
  pipeline_id: string;
  pipeline?: Pipeline;
  school_id?: string;
  school?: { id: string; name: string } & Record<string, unknown>;
  lead_id?: string;
  lead?: Record<string, unknown>;
  owner_id?: string;
  owner?: User;
  assigned_to?: string;
  assigned_user?: {
    id: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  currentStatus?: string;
  healthScore?: number;
  healthScoreLastCalculated?: Date;
  budgetScore?: number;
  timingScore?: number;
  competitionScore?: number;
  stakeholderEngagementScore?: number;
  expected_close_date?: string;
  expectedCloseDate?: string;
  closed_at?: string;
  actualCloseDate?: string | null;
  lostReason?: string | null;
  current_stage_since?: string;
  currentStageSince?: string;
  last_contacted_at?: string;
  rollback_count?: number;
  stage_data?: { backward_moves?: number };
  notes?: string;
  created_at: string;
  createdAt?: string;
  updated_at: string;
  updatedAt?: string;
  probability?: number;
  currency?: string;
  closeStatus?: DealStatus;
  stageHistory?: DealStageHistory[];
  quotes?: Quote[];
  invoices?: Invoice[];
}

export interface BulkUpdateDealsDto {
  deals: Array<{ id: string; status: string; position: number }>;
}

export interface DealListParams {
  page?: number;
  limit?: number;
  search?: string;
  pipeline_id?: string;
  stage_id?: string;
  school_id?: string;
  status?: DealStatus;
  close_status?: DealStatus;
  owner_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface ArchivedDealsParams {
  page: number;
  limit: number;
  close_status?: DealCloseStatus;
  search?: string;
  pipeline_id?: string;
  date_from?: string;
  date_to?: string;
}

export type ArchivedDealsResponse = Paginated<Deal[]> & {
  success?: boolean;
};

export interface DealsSummary {
  total_deals: number;
  pipeline_value: number;
  deals_with_overdue_invoices: number;
  avg_deal_health: number;
}

export const addDealSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  value: z.number().min(0, "Value must be a positive number"),
  currency: z.string(),
  lead_id: z.string().min(1, "Please select a lead"),
  school_id: z.string().min(1, "Please select a school"),
  stage_id: z.string().min(1, "Please select a stage"),
  pipeline_id: z.string().min(1, "Please select a Pipeline"),
  probability: z.number().min(0).max(100),
  expected_close_date: z.date(),
  assigned_to: z.string(),
  // Why this lead is commercially live. Only required when the
  // enforce_commercial_intent_for_deal switch is on and the lead has not
  // already earned intent from a recorded signal; the server decides, and
  // says so in its 400.
  commercial_intent_reason: z.string().optional(),
  // Competitor fields
  competitors: z
    .array(
      z.object({
        competitorName: z.string().min(1, "Competitor name is required"),
        competitorStrength: z.number().min(0).max(100),
        status: z.enum(["active", "eliminated", "unknown"]),
        ourAdvantage: z.string().optional(),
        theirAdvantage: z.string().optional(),
      }),
    )
    .optional(),
  // Deal items
  items: z.array(quoteItemSchema).optional(),
});

export const updateStageSchema = z.object({
  id: z.string(),
  status: z.string(),
});

export const updateStageBulkSchema = z.object({
  id: z.string(),
  status: z.string(),
  position: z.number().int().positive().min(1000).max(1_000_000),
});

export const dealsBulkUpdate = z.object({
  deals: z.array(updateStageBulkSchema),
});

export const closeDealSchema = z
  .object({
    close_status: z.enum(["won", "lost"]),
    lost_reason: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.close_status === "lost") {
      if (!data.lost_reason || data.lost_reason.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lost_reason"],
          message: "Lost reason is required when marking a deal as lost",
        });
      }
    }

    if (data.close_status === "won" && data.lost_reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lostReason"],
        message: "Lost reason is only allowed when marking a deal as lost",
      });
    }
  });

export type AddDealValues = z.infer<typeof addDealSchema>;
/**
 * Recording rule 6: `duplicate_override` is not a form field — it is the
 * rep's explicit "yes, this is a genuine second order", set only after the
 * server has returned 409 and the existing deal has been shown to them.
 */
export type CreateDealDto = AddDealValues & { duplicate_override?: boolean };
export type UpdateDealDto = Partial<AddDealValues>;
export type CloseDealValues = z.infer<typeof closeDealSchema>;
