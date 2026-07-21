import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth, handleApiError } from "~/api/axios";
import type {
  Lead,
  LeadSource,
  LeadStatus,
  AddLeadValues,
  LeadStakeholder,
  AddLeadStakeholderPayload,
  UpdateLeadPayload,
} from "./types";
import type {
  ApiResponse,
  Paginated,
  PaginationParams,
} from "../common-api-type";
import type { Province } from "../schools";

type LeadsListParams = PaginationParams & {
  status?: LeadStatus;
  province?: Province;
  assigned_to?: string;
  assignment_state?: "assigned" | "unassigned";
  sla_breached?: boolean;
  search?: string;
  source?: LeadSource;
  school_id?: string;
};

// Query keys
export const leadsKeys = {
  all: ["leads"] as const,
  allLeads: (params: LeadsListParams) =>
    [...leadsKeys.all, "list", params] as const,
  byId: (id: string) => [...leadsKeys.all, "detail", id] as const,
  stakeholdersById: (id: string) =>
    [...leadsKeys.all, "stakeholders", id] as const,
  byStatus: (status: LeadStatus) =>
    [...leadsKeys.all, "status", status] as const,
};

// API functions
const leadsApi = {
  // Get all leads
  getAllLeads: (params: LeadsListParams): Promise<Paginated<Lead[]>> =>
    apiClientAuth.get("/leads", { params }).then((res) => res.data),

  // Get lead by ID
  getById: (id: string): Promise<ApiResponse<Lead>> =>
    apiClientAuth.get(`/leads/${id}`).then((res) => res.data),

  // Get lead stakeholders by ID
  getLeadStakeholdersById: (id: string): Promise<ApiResponse<LeadStakeholder[]>> =>
    apiClientAuth.get(`/leads/${id}/stakeholders`).then((res) => res.data),

  // Get lead by status
  getByStatus: (status: LeadStatus): Promise<Lead> =>
    apiClientAuth.get(`/leads/status/${status}`).then((res) => res.data),

  // Create new lead
  create: (data: AddLeadValues): Promise<Lead> =>
    apiClientAuth.post("/leads", data).then((res) => res.data),

  // Create new lead
  import: (data: AddLeadValues[]): Promise<Lead> =>
    apiClientAuth.post("/leads/import", data).then((res) => res.data),

  // Update lead
  update: (id: string, data: UpdateLeadPayload): Promise<Lead> =>
    apiClientAuth.put(`/leads/${id}`, data).then((res) => res.data),

  // Assign lead
  assign: (id: string, assignedTo: string): Promise<Lead> =>
    apiClientAuth
      .patch(`/leads/${id}/assign`, { assigned_to: assignedTo })
      .then((res) => res.data),

  // Add lead stakeholder
  createStakeholder: (
    leadId: string,
    data: AddLeadStakeholderPayload,
  ): Promise<ApiResponse<LeadStakeholder>> =>
    apiClientAuth.post(`/leads/${leadId}/stakeholders`, data).then((res) => res.data),
};

//  Hooks
export function useLeads(params: LeadsListParams) {
  return useQuery({
    queryKey: leadsKeys.allLeads(params),
    queryFn: () => leadsApi.getAllLeads(params),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Get lead by ID
 */
export function useLead(id: string) {
  return useQuery({
    queryKey: leadsKeys.byId(id),
    queryFn: () => leadsApi.getById(id),
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  });
}

/**
 * Get lead by ID
 */
export function useLeadStakeholders(id: string) {
  return useQuery({
    queryKey: leadsKeys.stakeholdersById(id),
    queryFn: () => leadsApi.getLeadStakeholdersById(id),
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  });
}

/**
 * Create a new lead
 */
export function useCSVImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leadsApi.import,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.all });
    },
    onError: (error) => {
      console.error("Create lead error:", handleApiError(error));
    },
  });
}

/**
 * Create a new lead
 */
export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leadsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.all });
    },
    onError: (error) => {
      console.error("Create lead error:", handleApiError(error));
    },
  });
}

/**
 * Update an existing lead
 */
export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLeadPayload }) =>
      leadsApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.all });
      queryClient.invalidateQueries({ queryKey: leadsKeys.byId(variables.id) });
    },
    onError: (error) => {
      console.error("Update lead error:", handleApiError(error));
    },
  });
}

/**
 * Add stakeholder to a lead
 */
export function useCreateLeadStakeholder(leadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AddLeadStakeholderPayload) =>
      leadsApi.createStakeholder(leadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.all });
      queryClient.invalidateQueries({ queryKey: leadsKeys.byId(leadId) });
      queryClient.invalidateQueries({
        queryKey: leadsKeys.stakeholdersById(leadId),
      });
    },
    onError: (error) => {
      console.error("Create stakeholder error:", handleApiError(error));
    },
  });
}

/**
 * Assign an existing lead
 */
export function useAssignLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, assigned_to }: { id: string; assigned_to: string }) =>
      leadsApi.assign(id, assigned_to),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.all });
      queryClient.invalidateQueries({ queryKey: leadsKeys.byId(variables.id) });
    },
    onError: (error) => {
      console.error("Assign lead error:", handleApiError(error));
    },
  });
}
