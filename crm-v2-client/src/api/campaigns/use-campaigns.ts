import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  Campaign,
  CampaignLead,
  CampaignRoi,
  CampaignSpendRow,
  CreateCampaignDto,
} from "./types";

const keys = {
  all: ["campaigns"] as const,
  one: (id: string) => [...keys.all, id] as const,
  leads: (id: string) => [...keys.all, id, "leads"] as const,
  spend: (id: string) => [...keys.all, id, "spend"] as const,
  roi: (id: string) => [...keys.all, id, "roi"] as const,
};

const api = {
  list: (): Promise<Campaign[]> =>
    apiClientAuth.get("/campaigns").then((res) => res.data.data),
  one: (id: string): Promise<Campaign> =>
    apiClientAuth.get(`/campaigns/${id}`).then((res) => res.data.data),
  leads: (id: string): Promise<CampaignLead[]> =>
    apiClientAuth.get(`/campaigns/${id}/leads`).then((res) => res.data.data),
  spend: (id: string): Promise<CampaignSpendRow[]> =>
    apiClientAuth.get(`/campaigns/${id}/spend`).then((res) => res.data.data),
  roi: (id: string): Promise<CampaignRoi> =>
    apiClientAuth.get(`/campaigns/${id}/roi`).then((res) => res.data.data),
  create: (dto: CreateCampaignDto): Promise<Campaign> =>
    apiClientAuth.post("/campaigns", dto).then((res) => res.data.data),
};

export function useCampaigns() {
  return useQuery({ queryKey: keys.all, queryFn: api.list, staleTime: 30_000 });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: keys.one(id),
    queryFn: () => api.one(id),
    enabled: !!id,
  });
}

export function useCampaignLeads(id: string) {
  return useQuery({
    queryKey: keys.leads(id),
    queryFn: () => api.leads(id),
    enabled: !!id,
  });
}

export function useCampaignSpend(id: string) {
  return useQuery({
    queryKey: keys.spend(id),
    queryFn: () => api.spend(id),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useCampaignRoi(id: string) {
  return useQuery({
    queryKey: keys.roi(id),
    queryFn: () => api.roi(id),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
