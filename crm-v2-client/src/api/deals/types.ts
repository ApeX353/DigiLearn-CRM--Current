import * as z from "zod";
import type { Stage, Pipeline } from "../pipelines";
import type { User } from "~/stores/use-auth-store";
import type { Quote } from "../quotes";
import type { Invoice } from "../invoices";
import { quoteItemSchema } from "../quotes";
import type { Paginated } from "../common-api-type";
import type { Lead } from "../leads";

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
  lead?: Lead;
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
  open_deals: number;
  pipeline_value: number;
  pending_collections: number;
  overdue_deals: number;
  deals_with_overdue_invoices: number;
  avg_deal_health: number;
  health_scored_deals: number;
  won_deals: number;
  won_invoice_total: number;
  lost_deals: number;
  lost_deal_value: number;
}

export interface DealsSummaryParams {
  date_from?: string;
  date_to?: string;
}

export const addDealSchema = z.object({
  // Recording rule 2: the title is generated ("<qty> × <product name>"),
  // never typed. product_id + quantity are form-only fields — the API
  // whitelist rejects them, so the container strips them before POSTing
  // and submits the composed title.
  title: z.string().min(1, "Pick a product to generate the deal title"),
  product_id: z.string().min(1, "Pick the product this deal is for"),
  quantity: z
    .number({ message: "Quantity is required" })
    .int()
    .min(1, "Quantity must be at least 1"),
  description: z.string().optional(),
  value: z.number().min(0, "Value must be a positive number"),
  currency: z.string(),
  lead_id: z.string().min(1, "Please select a lead"),
  school_id: z
    .string()
    .min(1, "The selected lead has no linked school — link one on the lead first"),
  stage_id: z.string().min(1, "Please select a stage"),
  pipeline_id: z.string().min(1, "Please select a Pipeline"),
  probability: z.number().min(0).max(100),
  expected_close_date: z.date(),
  assigned_to: z.string(),
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
  // Rule 6 (one order, one deal): set only after the rep has seen the
  // school's existing open deal and confirmed this is a second order.
  duplicate_override: z.boolean().optional(),
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
// product_id/quantity exist only to compose the title — the API's
// forbidNonWhitelisted pipe rejects them, so they never leave the form.
export type CreateDealDto = Omit<AddDealValues, "product_id" | "quantity">;
export type UpdateDealDto = Partial<CreateDealDto>;
export type CloseDealValues = z.infer<typeof closeDealSchema>;
