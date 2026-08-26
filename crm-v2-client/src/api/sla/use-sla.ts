import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  DealBreachSummary,
  LeadBreachSummary,
  SlaApiResponse,
  SlaCheckDealBreachesData,
  SlaCheckLeadBreachesData,
} from "./types";

const ONE_HOUR_MS = 60 * 60 * 1000;

export const slaKeys = {
  all: ["sla"] as const,
  leadBreaches: () => [...slaKeys.all, "lead-breaches"] as const,
  dealBreaches: () => [...slaKeys.all, "deal-breaches"] as const,
  checkLeadBreaches: () => [...slaKeys.all, "check-lead-breaches"] as const,
  checkDealBreaches: () => [...slaKeys.all, "check-deal-breaches"] as const,
};

const slaApi = {
  getLeadBreaches: (): Promise<SlaApiResponse<LeadBreachSummary>> =>
    apiClientAuth.get("/sla/lead-breaches").then((res) => res.data),

  getDealBreaches: (): Promise<SlaApiResponse<DealBreachSummary>> =>
    apiClientAuth.get("/sla/deal-breaches").then((res) => res.data),

  checkLeadBreaches: (): Promise<SlaApiResponse<SlaCheckLeadBreachesData>> =>
    apiClientAuth.post("/sla/check-lead-breaches").then((res) => res.data),

  checkDealBreaches: (): Promise<SlaApiResponse<SlaCheckDealBreachesData>> =>
    apiClientAuth.post("/sla/check-deal-breaches").then((res) => res.data),
};

export function useLeadSlaBreaches() {
  return useQuery({
    queryKey: slaKeys.leadBreaches(),
    queryFn: slaApi.getLeadBreaches,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDealSlaBreaches() {
  return useQuery({
    queryKey: slaKeys.dealBreaches(),
    queryFn: slaApi.getDealBreaches,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCheckLeadSlaBreaches(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: slaKeys.checkLeadBreaches(),
    queryFn: async () => {
      const response = await slaApi.checkLeadBreaches();
      await queryClient.invalidateQueries({ queryKey: slaKeys.leadBreaches() });
      return response;
    },
    staleTime: ONE_HOUR_MS,
    gcTime: ONE_HOUR_MS,
    retry: false,
    enabled: options?.enabled ?? true,
  });
}

export function useCheckDealSlaBreaches(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: slaKeys.checkDealBreaches(),
    queryFn: async () => {
      const response = await slaApi.checkDealBreaches();
      await queryClient.invalidateQueries({ queryKey: slaKeys.dealBreaches() });
      return response;
    },
    staleTime: ONE_HOUR_MS,
    gcTime: ONE_HOUR_MS,
    retry: false,
    enabled: options?.enabled ?? true,
  });
}
