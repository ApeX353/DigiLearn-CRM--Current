import { useQuery } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type { AgingReportResponse, AgingReportParams } from "./types";

const keys = {
  all: ["collections"] as const,
  agingReport: (params: AgingReportParams) =>
    [...keys.all, "aging-report", params] as const,
};

const api = {
  getAgingReport: (params: AgingReportParams): Promise<AgingReportResponse> =>
    apiClientAuth
      .get("/collections/aging-report", { params })
      .then((r) => r.data),
};

export function useAgingReport(params: AgingReportParams = {}) {
  return useQuery({
    queryKey: keys.agingReport(params),
    queryFn: () => api.getAgingReport(params),
  });
}
