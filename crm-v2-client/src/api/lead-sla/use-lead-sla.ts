import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth, handleApiError } from "~/api/axios";
import type {
  LeadSLA,
  CreateLeadSLADto,
  UpdateLeadSLADto,
} from "./types";
import type { ApiResponse } from "../common-api-type";
import type { LeadStatus } from "../leads";

// Query keys
export const leadSLAKeys = {
  all: ["lead-sla"] as const,
  allSLAs: (params?: { status?: LeadStatus; include_inactive?: boolean }) =>
    [...leadSLAKeys.all, "list", params] as const,
  byId: (id: string) => [...leadSLAKeys.all, "detail", id] as const,
  byStatus: (status: LeadStatus) =>
    [...leadSLAKeys.all, "status", status] as const,
};

// API functions
const leadSLAApi = {
  // Get all SLA configurations
  getAll: (params?: {
    status?: LeadStatus;
    include_inactive?: boolean;
  }): Promise<ApiResponse<LeadSLA[]>> =>
    apiClientAuth.get("/lead-sla", { params }).then((res) => res.data),

  // Get SLA configuration by ID
  getById: (id: string): Promise<LeadSLA> =>
    apiClientAuth.get(`/lead-sla/${id}`).then((res) => res.data),

  // Get SLA configuration by status
  getByStatus: (status: LeadStatus): Promise<LeadSLA> =>
    apiClientAuth.get(`/lead-sla/status/${status}`).then((res) => res.data),

  // Create SLA configuration
  create: (data: CreateLeadSLADto): Promise<LeadSLA> =>
    apiClientAuth.post("/lead-sla", data).then((res) => res.data),

  // Update SLA configuration
  update: (id: string, data: UpdateLeadSLADto): Promise<LeadSLA> =>
    apiClientAuth.put(`/lead-sla/${id}`, data).then((res) => res.data),

  // Deactivate SLA configuration (soft delete)
  remove: (id: string): Promise<void> =>
    apiClientAuth.delete(`/lead-sla/${id}`).then((res) => res.data),

  // Restore deactivated SLA configuration
  restore: (id: string): Promise<LeadSLA> =>
    apiClientAuth.post(`/lead-sla/${id}/restore`).then((res) => res.data),
};

// Hooks

/**
 * Get all SLA configurations
 */
export function useLeadSLAs(params?: {
  status?: LeadStatus;
  include_inactive?: boolean;
}) {
  return useQuery({
    queryKey: leadSLAKeys.allSLAs(params),
    queryFn: () => leadSLAApi.getAll(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get SLA configuration by ID
 */
export function useLeadSLA(id: string) {
  return useQuery({
    queryKey: leadSLAKeys.byId(id),
    queryFn: () => leadSLAApi.getById(id),
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  });
}

/**
 * Get SLA configuration by status
 */
export function useLeadSLAByStatus(status: LeadStatus) {
  return useQuery({
    queryKey: leadSLAKeys.byStatus(status),
    queryFn: () => leadSLAApi.getByStatus(status),
    staleTime: 5 * 60 * 1000,
    enabled: !!status,
  });
}

/**
 * Create SLA configuration
 */
export function useCreateLeadSLA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leadSLAApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadSLAKeys.all });
    },
    onError: (error) => {
      console.error("Create lead SLA error:", handleApiError(error));
    },
  });
}

/**
 * Update SLA configuration
 */
export function useUpdateLeadSLA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLeadSLADto }) =>
      leadSLAApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadSLAKeys.all });
    },
    onError: (error) => {
      console.error("Update lead SLA error:", handleApiError(error));
    },
  });
}

/**
 * Deactivate SLA configuration
 */
export function useRemoveLeadSLA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leadSLAApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadSLAKeys.all });
    },
    onError: (error) => {
      console.error("Remove lead SLA error:", handleApiError(error));
    },
  });
}

/**
 * Restore deactivated SLA configuration
 */
export function useRestoreLeadSLA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leadSLAApi.restore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadSLAKeys.all });
    },
    onError: (error) => {
      console.error("Restore lead SLA error:", handleApiError(error));
    },
  });
}
