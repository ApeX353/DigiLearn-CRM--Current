import { useQuery } from "@tanstack/react-query";
import { apiClientAuth } from "../axios";
import type { Paginated, PaginationParams } from "../common-api-type";
import type { LogAction } from "./types";
import type { ActivityLog } from "../activity-logs";

export const activityLogsKeys = {
  all: ["activity-log"] as const,
  allLogs: (
    params: PaginationParams & {
      entity?: string;
      entity_id?: string;
      actioned_by?: string;
      action?: LogAction;
      search?: string;
      start_date?: string;
      end_date?: string;
    },
  ) => [...activityLogsKeys.all, "list", params] as const,
};

// Api methods
export const activityLogsApi = {
  // Get all leads
  getAllActivityLogs: (
    params: PaginationParams & {
      entity?: string;
      entity_id?: string;
      actioned_by?: string;
      action?: LogAction;
      search?: string;
      start_date?: string;
      end_date?: string;
    },
  ): Promise<Paginated<ActivityLog[]>> =>
    apiClientAuth.get("/activity-logs", { params }).then((res) => res.data),
};

export function useActivities(
  params: PaginationParams & {
    entity?: string;
    entity_id?: string;
    actioned_by?: string;
    action?: LogAction;
    search?: string;
    start_date?: string;
    end_date?: string;
  },
) {
  return useQuery({
    queryKey: activityLogsKeys.allLogs(params),
    queryFn: () => activityLogsApi.getAllActivityLogs(params),
    staleTime: 10 * 60 * 1000,
  });
}
