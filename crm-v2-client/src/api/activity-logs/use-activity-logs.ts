import { useQuery } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type { Paginated } from "../common-api-type";
import type {
  ActivityLog,
  ActivityLogParams,
  AuditActor,
  AuditCategoryCounts,
} from "./types";

interface EntityActivityLogResponse {
  success: boolean;
  data: ActivityLog[];
  count: number;
}

export const activityLogKeys = {
  all: ["activity-logs"] as const,
  list: (params?: ActivityLogParams) =>
    [...activityLogKeys.all, "list", params] as const,
  entity: (entity: string, entityId: string) =>
    [...activityLogKeys.all, "entity", entity, entityId] as const,
};

const activityLogApi = {
  getAll: (
    params?: ActivityLogParams,
  ): Promise<Paginated<ActivityLog[]> & { environment?: string }> =>
    apiClientAuth.get("/activity-logs", { params }).then((res) => res.data),

  getCategoryCounts: (
    params?: ActivityLogParams,
  ): Promise<{ data: AuditCategoryCounts }> =>
    apiClientAuth
      .get("/activity-logs/category-counts", { params })
      .then((res) => res.data),

  getActors: (): Promise<{ data: AuditActor[] }> =>
    apiClientAuth.get("/activity-logs/actors").then((res) => res.data),

  getByEntity: (
    entity: string,
    entityId: string
  ): Promise<EntityActivityLogResponse> =>
    apiClientAuth
      .get(`/activity-logs/entity/${entity}/${entityId}`)
      .then((res) => res.data),
};

export function useActivityLogs(params?: ActivityLogParams) {
  return useQuery({
    queryKey: activityLogKeys.list(params),
    queryFn: () => activityLogApi.getAll(params),
    staleTime: 60 * 1000,
  });
}

/** Totals for the tabs: the same filters, across every category. */
export function useAuditCategoryCounts(params?: ActivityLogParams) {
  return useQuery({
    queryKey: [...activityLogKeys.all, "category-counts", params] as const,
    queryFn: async () => (await activityLogApi.getCategoryCounts(params)).data,
    staleTime: 60 * 1000,
  });
}

export function useAuditActors() {
  return useQuery({
    queryKey: [...activityLogKeys.all, "actors"] as const,
    queryFn: async () => (await activityLogApi.getActors()).data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useEntityActivityLogs(entity: string, entityId: string) {
  return useQuery({
    queryKey: activityLogKeys.entity(entity, entityId),
    queryFn: () => activityLogApi.getByEntity(entity, entityId),
    staleTime: 60 * 1000,
    enabled: !!entity && !!entityId,
  });
}
