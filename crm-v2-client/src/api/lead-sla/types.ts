import z from "zod";
import { LEAD_STATUSES, type LeadStatus } from "../leads";

export interface LeadSLA {
  id: string;
  status: LeadStatus;
  sla_hours: number;
  escalation_after_hours: number;
  idle_alert_hours: number;
  description?: string;
  message?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface CreateLeadSLADto {
  status: LeadStatus;
  sla_hours: number;
  escalation_after_hours: number;
  idle_alert_hours: number;
  description?: string;
  message?: string;
}

export interface UpdateLeadSLADto {
  status?: LeadStatus;
  sla_hours?: number;
  escalation_after_hours?: number;
  idle_alert_hours?: number;
  description?: string;
  message?: string;
}

export const addLeadSLASchema = z.object({
  status: z.enum(LEAD_STATUSES),
  sla_hours: z.number().min(1, "Must be at least 1 hour"),
  escalation_after_hours: z.number().min(1, "Must be at least 1 hour"),
  idle_alert_hours: z.number().min(1, "Must be at least 1 hour"),
  description: z.string().optional(),
  message: z.string().optional(),
});

export type AddLeadSlaValues = z.infer<typeof addLeadSLASchema>;
