import { useQuery } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  SalesPerformancePeriod,
  SalesPerformanceStats,
  PipelineStageStats,
  FinanceReportStats,
} from "./types";

const reportsKeys = {
  all: ["reports"] as const,
  salesPerformance: (period: SalesPerformancePeriod) =>
    [...reportsKeys.all, "sales-performance", period] as const,
  pipelineAnalysis: () =>
    [...reportsKeys.all, "pipeline-analysis"] as const,
  financeReport: () => [...reportsKeys.all, "finance"] as const,
};

const reportsApi = {
  getSalesPerformance: (
    period: SalesPerformancePeriod
  ): Promise<SalesPerformanceStats> =>
    apiClientAuth
      .get("/reports/sales-performance", { params: { period } })
      .then((res) => res.data),

  getPipelineAnalysis: (): Promise<PipelineStageStats[]> =>
    apiClientAuth.get("/reports/pipeline-analysis").then((res) => res.data),

  getFinanceReport: (): Promise<FinanceReportStats> =>
    apiClientAuth.get("/reports/finance").then((res) => res.data),
};

export function useSalesPerformanceStats(
  period: SalesPerformancePeriod = "quarter"
) {
  return useQuery({
    queryKey: reportsKeys.salesPerformance(period),
    queryFn: () => reportsApi.getSalesPerformance(period),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePipelineAnalysisStats() {
  return useQuery({
    queryKey: reportsKeys.pipelineAnalysis(),
    queryFn: () => reportsApi.getPipelineAnalysis(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFinanceReportStats() {
  return useQuery({
    queryKey: reportsKeys.financeReport(),
    queryFn: () => reportsApi.getFinanceReport(),
    staleTime: 5 * 60 * 1000,
  });
}
