import { useQuery } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type { Paginated } from "../common-api-type";
import type { ActivityLog, ActivityLogParams } from "./types";

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
  getAll: (params?: ActivityLogParams): Promise<Paginated<ActivityLog[]>> =>
    apiClientAuth.get("/activity-logs", { params }).then((res) => res.data),

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

export function useEntityActivityLogs(entity: string, entityId: string) {
  return useQuery({
    queryKey: activityLogKeys.entity(entity, entityId),
    queryFn: () => activityLogApi.getByEntity(entity, entityId),
    staleTime: 60 * 1000,
    enabled: !!entity && !!entityId,
  });
}
