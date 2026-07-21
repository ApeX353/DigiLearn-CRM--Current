import { useQuery } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  DashboardFilters,
  ExecutiveKPIs,
  LeadsContactedStats,
  CollectionsDue,
  SalesMetrics,
  DemoStats,
  HighValueDeal,
  FunnelHealth,
  TopPerformingProductsData,
  SchoolsBoughtData,
  LeadsByStageData,
  SLAComplianceData,
  LeadConversionData,
  NurtureFollowUpsData,
  QualificationOverviewData,
  ActivityDisciplineData,
} from "./types";
import type { ApiResponse } from "../common-api-type";

// Query keys
export const dashboardKeys = {
  all: ["dashboard"] as const,
  kpis: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "kpis", filters] as const,
  leadsContacted: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "leads-contacted", filters] as const,
  collections: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "collections", filters] as const,
  salesMetrics: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "sales-metrics", filters] as const,
  demoStats: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "demo-stats", filters] as const,
  highValueDeals: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "high-value-deals", filters] as const,
  funnelHealth: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "funnel-health", filters] as const,
  topPerformingProducts: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "top-performing-products", filters] as const,
  schoolsBought: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "schools-bought", filters] as const,
  leadsByStage: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "leads-by-stage", filters] as const,
  slaCompliance: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "sla-compliance", filters] as const,
  leadConversion: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "lead-conversion", filters] as const,
  nurtureFollowUps: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "nurture-follow-ups", filters] as const,
  qualificationOverview: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "qualification-overview", filters] as const,
  activityDiscipline: (filters: DashboardFilters) =>
    [...dashboardKeys.all, "activity-discipline", filters] as const,
};

// API functions
const dashboardApi = {
  getExecutiveKPIs: (filters: DashboardFilters): Promise<ApiResponse<ExecutiveKPIs>> =>
    apiClientAuth
      .get("/dashboard/kpis", { params: filters })
      .then((res) => res.data),

  getLeadsContactedStats: (
    filters: DashboardFilters
  ): Promise<ApiResponse<LeadsContactedStats>> =>
    apiClientAuth
      .get("/dashboard/leads-contacted", { params: filters })
      .then((res) => res.data),

  getCollectionsDue: (filters: DashboardFilters): Promise<ApiResponse<CollectionsDue>> =>
    apiClientAuth
      .get("/dashboard/collections-due", { params: filters })
      .then((res) => res.data),

  getSalesMetrics: (filters: DashboardFilters): Promise<ApiResponse<SalesMetrics>> =>
    apiClientAuth
      .get("/dashboard/sales-metrics", { params: filters })
      .then((res) => res.data),

  getDemoStats: (filters: DashboardFilters): Promise<ApiResponse<DemoStats>> =>
    apiClientAuth
      .get("/dashboard/demo-stats", { params: filters })
      .then((res) => res.data),

  getHighValueDeals: (filters: DashboardFilters): Promise<ApiResponse<HighValueDeal[]>> =>
    apiClientAuth
      .get("/dashboard/high-value-deals", { params: filters })
      .then((res) => res.data),

  getFunnelHealth: (filters: DashboardFilters): Promise<ApiResponse<FunnelHealth>> =>
    apiClientAuth
      .get("/dashboard/funnel-health", { params: filters })
      .then((res) => res.data),

  getTopPerformingProducts: (filters: DashboardFilters): Promise<ApiResponse<TopPerformingProductsData>> =>
    apiClientAuth
      .get("/dashboard/top-performing-products", { params: filters })
      .then((res) => res.data),

  getSchoolsBought: (filters: DashboardFilters): Promise<ApiResponse<SchoolsBoughtData>> =>
    apiClientAuth
      .get("/dashboard/schools-bought", { params: filters })
      .then((res) => res.data),

  getLeadsByStage: (filters: DashboardFilters): Promise<ApiResponse<LeadsByStageData[]>> =>
    apiClientAuth
      .get("/dashboard/leads-by-stage", { params: filters })
      .then((res) => res.data),

  getSLACompliance: (filters: DashboardFilters): Promise<ApiResponse<SLAComplianceData>> =>
    apiClientAuth
      .get("/dashboard/sla-compliance", { params: filters })
      .then((res) => res.data),

  getLeadConversion: (filters: DashboardFilters): Promise<ApiResponse<LeadConversionData>> =>
    apiClientAuth
      .get("/dashboard/lead-conversion", { params: filters })
      .then((res) => res.data),

  getNurtureFollowUps: (
    filters: DashboardFilters
  ): Promise<ApiResponse<NurtureFollowUpsData>> =>
    apiClientAuth
      .get("/dashboard/nurture-follow-ups", { params: filters })
      .then((res) => res.data),

  getQualificationOverview: (
    filters: DashboardFilters
  ): Promise<ApiResponse<QualificationOverviewData>> =>
    apiClientAuth
      .get("/dashboard/qualification-overview", { params: filters })
      .then((res) => res.data),

  getActivityDiscipline: (
    filters: DashboardFilters
  ): Promise<ApiResponse<ActivityDisciplineData>> =>
    apiClientAuth
      .get("/dashboard/activity-discipline", { params: filters })
      .then((res) => res.data),
};

// Hooks
export function useExecutiveKPIs(
  filters: DashboardFilters,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: dashboardKeys.kpis(filters),
    queryFn: () => dashboardApi.getExecutiveKPIs(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: options?.enabled ?? true,
  });
}

export function useLeadsContactedStats(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.leadsContacted(filters),
    queryFn: () => dashboardApi.getLeadsContactedStats(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCollectionsDue(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.collections(filters),
    queryFn: () => dashboardApi.getCollectionsDue(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalesMetrics(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.salesMetrics(filters),
    queryFn: () => dashboardApi.getSalesMetrics(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDemoStats(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.demoStats(filters),
    queryFn: () => dashboardApi.getDemoStats(filters),
    staleTime: 5 * 60 * 1000,
  });
}
export function useBoardsSold(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.demoStats(filters),
    queryFn: () => dashboardApi.getDemoStats(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useHighValueDeals(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.highValueDeals(filters),
    queryFn: () => dashboardApi.getHighValueDeals(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFunnelHealth(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.funnelHealth(filters),
    queryFn: () => dashboardApi.getFunnelHealth(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTopPerformingProducts(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.topPerformingProducts(filters),
    queryFn: () => dashboardApi.getTopPerformingProducts(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSchoolsBought(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.schoolsBought(filters),
    queryFn: () => dashboardApi.getSchoolsBought(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLeadsByStage(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.leadsByStage(filters),
    queryFn: () => dashboardApi.getLeadsByStage(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSLACompliance(
  filters: DashboardFilters,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: dashboardKeys.slaCompliance(filters),
    queryFn: () => dashboardApi.getSLACompliance(filters),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

export function useLeadConversion(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.leadConversion(filters),
    queryFn: () => dashboardApi.getLeadConversion(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useNurtureFollowUps(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.nurtureFollowUps(filters),
    queryFn: () => dashboardApi.getNurtureFollowUps(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useQualificationOverview(filters: DashboardFilters) {
  return useQuery({
    queryKey: dashboardKeys.qualificationOverview(filters),
    queryFn: () => dashboardApi.getQualificationOverview(filters),
    staleTime: 5 * 60 * 1000,
  });
}

export function useActivityDiscipline(
  filters: DashboardFilters,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: dashboardKeys.activityDiscipline(filters),
    queryFn: () => dashboardApi.getActivityDiscipline(filters),
    staleTime: 2 * 60 * 1000, // refresh more aggressively — discipline data is the point
    enabled: options?.enabled ?? true,
  });
}
