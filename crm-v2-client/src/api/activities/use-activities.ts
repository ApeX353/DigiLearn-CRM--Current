import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { apiClientAuth } from "../axios";
import type { Paginated, PaginationParams } from "../common-api-type";
import type {
  Activity,
  ActivityComment,
  ActivityType,
  ActivityStatus,
  CreateActivityCommentDto,
  CreateActivityDto,
  UpdateActivityDto,
  LeadActivityStats,
} from "./types";
import { leadsKeys } from "../leads";

export const activitiesKeys = {
  all: ["activities"] as const,
  lists: () => [...activitiesKeys.all, "list"] as const,
  list: (
    params: PaginationParams & {
      type?: ActivityType;
      status?: ActivityStatus;
      lead_id?: string;
      deal_id?: string;
      contact_id?: string;
      assigned_to_id?: string;
      is_pinned?: boolean;
      search?: string;
    },
  ) => [...activitiesKeys.lists(), params] as const,
  byId: (id: string) => [...activitiesKeys.all, "detail", id] as const,
  leadStatsRoot: () => [...activitiesKeys.all, "lead-stats"] as const,
  leadStats: (leadId: string) =>
    [...activitiesKeys.leadStatsRoot(), leadId] as const,
};

function unwrapData<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data?: unknown }).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

const api = {
  getAll: (
    params: PaginationParams & {
      type?: ActivityType;
      status?: ActivityStatus;
      lead_id?: string;
      deal_id?: string;
      contact_id?: string;
      assigned_to_id?: string;
      is_pinned?: boolean;
      search?: string;
      include_details?: boolean;
    },
  ): Promise<Paginated<Activity[]>> =>
    apiClientAuth.get("/activities", { params }).then((r) => r.data),

  getById: (id: string): Promise<Activity> =>
    apiClientAuth
      .get(`/activities/${id}`)
      .then((r) => unwrapData<Activity>(r.data)),

  create: (data: CreateActivityDto): Promise<Activity> =>
    apiClientAuth
      .post("/activities", data)
      .then((r) => unwrapData<Activity>(r.data)),

  update: async (id: string, data: UpdateActivityDto): Promise<Activity> => {
    try {
      const response = await apiClientAuth.put(`/activities/${id}`, data);
      return unwrapData<Activity>(response.data);
    } catch (error) {
      if (
        isAxiosError(error) &&
        (error.response?.status === 404 || error.response?.status === 405)
      ) {
        const fallbackResponse = await apiClientAuth.patch(
          `/activities/${id}`,
          data,
        );
        return unwrapData<Activity>(fallbackResponse.data);
      }
      throw error;
    }
  },

  remove: (id: string): Promise<void> =>
    apiClientAuth.delete(`/activities/${id}`).then((r) => r.data),

  addComment: (
    id: string,
    data: CreateActivityCommentDto,
  ): Promise<ActivityComment> =>
    apiClientAuth
      .post(`/activities/${id}/comments`, data)
      .then((r) => unwrapData<ActivityComment>(r.data)),

  getLeadStats: (leadId: string): Promise<LeadActivityStats> =>
    apiClientAuth
      .get(`/activities/leads/${leadId}/stats`)
      .then((r) => unwrapData<LeadActivityStats>(r.data)),
};

export function useActivityList(
  params: PaginationParams & {
    type?: ActivityType;
    status?: ActivityStatus;
    lead_id?: string;
    deal_id?: string;
    contact_id?: string;
    assigned_to_id?: string;
    is_pinned?: boolean;
    search?: string;
    enabled?: boolean;
    include_details?: boolean;
  },
) {
  const { enabled, ...queryParams } = params;
  return useQuery({
    queryKey: activitiesKeys.list(queryParams),
    queryFn: () => api.getAll(queryParams),
    staleTime: 5 * 60 * 1000,
    enabled: enabled !== undefined ? enabled : true,
  });
}

export function useActivity(id: string) {
  return useQuery({
    queryKey: activitiesKeys.byId(id),
    queryFn: () => api.getById(id),
    enabled: !!id,
  });
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateActivityDto) => api.create(data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: activitiesKeys.all });
      qc.invalidateQueries({ queryKey: leadsKeys.all });
      qc.invalidateQueries({
        queryKey: leadsKeys.byId(variables.lead_id ?? variables.deal_id ?? ""),
      });
    },
  });
}

export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateActivityDto }) =>
      api.update(id, data),
    onSuccess: (updatedActivity, variables) => {
      qc.setQueryData(activitiesKeys.byId(variables.id), updatedActivity);
      qc.invalidateQueries({
        queryKey: activitiesKeys.byId(variables.id),
        exact: true,
      });
      qc.invalidateQueries({ queryKey: activitiesKeys.lists() });
      qc.invalidateQueries({ queryKey: activitiesKeys.leadStatsRoot() });
    },
  });
}

export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: activitiesKeys.all }),
  });
}

export function useAddActivityComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: CreateActivityCommentDto;
    }) => api.addComment(id, data),
    onSuccess: (createdComment, variables) => {
      qc.setQueryData<Activity | undefined>(
        activitiesKeys.byId(variables.id),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            comments: [...(current.comments ?? []), createdComment],
          };
        },
      );

      qc.invalidateQueries({
        queryKey: activitiesKeys.byId(variables.id),
        exact: true,
      });
    },
  });
}

export function useLeadActivityStats(leadId: string) {
  return useQuery({
    queryKey: activitiesKeys.leadStats(leadId),
    queryFn: () => api.getLeadStats(leadId),
    staleTime: 5 * 60 * 1000,
    enabled: !!leadId,
  });
}
