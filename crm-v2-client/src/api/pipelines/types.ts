import z from "zod";

export interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  order: number;
  sla_days: number;
  probability: number;
  color: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export const createPipelineSchema = z.object({
  name: z.string().min(1, "Pipeline name is required").max(100, "Pipeline name must be less than 100 characters"),
  is_default: z.boolean(),
});

export const updatePipelineSchema = createPipelineSchema.partial();

export type CreatePipelineValues = z.infer<typeof createPipelineSchema>;
export type UpdatePipelineValues = z.infer<typeof updatePipelineSchema>;


export interface CreateStageDto {
  name: string;
  order: number;
  sla_days?: number;
  probability?: number;
  color?: string;
  description?: string;
}

export interface UpdateStageDto {
  name?: string;
  sla_days?: number;
  probability?: number;
  color?: string;
  description?: string;
}

export interface ReorderStagesDto {
  stages: Array<{
    id: string;
    order: number;
  }>;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  include_inactive?: boolean;
}

export const stageFormSchema = z.object({
  name: z
    .string()
    .min(1, "Stage name is required")
    .max(100, "Stage name must be less than 100 characters"),
  sla_days: z.number().min(0, "SLA days must be 0 or greater"),
  probability: z
    .number()
    .min(0, "Probability must be between 0 and 100")
    .max(100, "Probability must be between 0 and 100"),
  color: z.string(), //.regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format"),
  description: z.string().optional(),
  order: z.number(),
});

export type StageFormValues = z.infer<typeof stageFormSchema>;
