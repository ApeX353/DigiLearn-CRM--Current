import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  CashRequisition,
  CreateCashRequisitionDto,
  CostToCloseReport,
  DealCostSummaryRow,
  RequisitionListParams,
} from "./types";

const keys = {
  all: ["cash-requisitions"] as const,
  list: (params: RequisitionListParams) => [...keys.all, "list", params] as const,
  one: (id: string) => [...keys.all, "one", id] as const,
  dealSummary: (dealId: string) => [...keys.all, "deal-summary", dealId] as const,
};

interface ListResponse {
  success: boolean;
  data: CashRequisition[];
  meta?: { totalItems?: number; totalPages?: number; currentPage?: number };
}

const api = {
  list: (params: RequisitionListParams): Promise<ListResponse> =>
    apiClientAuth
      .get("/cash-requisitions", { params })
      .then((res) => res.data),

  one: (id: string): Promise<CashRequisition> =>
    apiClientAuth
      .get(`/cash-requisitions/${id}`)
      .then((res) => res.data.data),

  dealSummary: (dealId: string): Promise<DealCostSummaryRow[]> =>
    apiClientAuth
      .get(`/cash-requisitions/deals/${dealId}/summary`)
      .then((res) => res.data.data),

  leadSummary: (leadId: string): Promise<DealCostSummaryRow[]> =>
    apiClientAuth
      .get(`/cash-requisitions/leads/${leadId}/summary`)
      .then((res) => res.data.data),

  campaignSummary: (campaignId: string): Promise<DealCostSummaryRow[]> =>
    apiClientAuth
      .get(`/campaigns/${campaignId}/spend`)
      .then((res) => res.data.data),

  create: (dto: CreateCashRequisitionDto): Promise<CashRequisition> =>
    apiClientAuth.post("/cash-requisitions", dto).then((res) => res.data.data),

  submit: (id: string): Promise<CashRequisition> =>
    apiClientAuth
      .post(`/cash-requisitions/${id}/submit`)
      .then((res) => res.data.data),

  action: (
    id: string,
    action:
      | "manager-approve"
      | "manager-reject"
      | "finance-approve"
      | "finance-reject"
      | "mark-paid",
    reason?: string,
  ): Promise<CashRequisition> =>
    apiClientAuth
      .post(`/cash-requisitions/${id}/${action}`, reason ? { reason } : undefined)
      .then((res) => res.data.data),

  costToClose: (): Promise<CostToCloseReport> =>
    apiClientAuth
      .get("/cash-requisitions/reports/cost-to-close")
      .then((res) => res.data.data),
};

export function useCashRequisitions(params: RequisitionListParams = {}) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api.list(params),
    staleTime: 15 * 1000,
  });
}

export function useCashRequisition(id: string) {
  return useQuery({
    queryKey: keys.one(id),
    queryFn: () => api.one(id),
    enabled: !!id,
  });
}

/**
 * Cost rollup for any linkage. Exactly one of dealId/leadId/campaignId
 * should be set; the query stays disabled until one is.
 */
export function useEntityCostSummary({
  dealId,
  leadId,
  campaignId,
}: {
  dealId?: string;
  leadId?: string;
  campaignId?: string;
}) {
  return useQuery({
    queryKey: [
      ...keys.all,
      "summary",
      dealId ?? null,
      leadId ?? null,
      campaignId ?? null,
    ] as const,
    queryFn: () =>
      dealId
        ? api.dealSummary(dealId)
        : leadId
          ? api.leadSummary(leadId)
          : api.campaignSummary(campaignId!),
    enabled: !!(dealId || leadId || campaignId),
    staleTime: 15 * 1000,
  });
}

export function useDealCostSummary(dealId: string) {
  return useQuery({
    queryKey: keys.dealSummary(dealId),
    queryFn: () => api.dealSummary(dealId),
    enabled: !!dealId,
    staleTime: 15 * 1000,
  });
}

export function useCreateCashRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useSubmitCashRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.submit,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useRequisitionAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action:
        | "manager-approve"
        | "manager-reject"
        | "finance-approve"
        | "finance-reject"
        | "mark-paid";
      reason?: string;
    }) => api.action(id, action, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useCostToCloseReport() {
  return useQuery({
    queryKey: [...keys.all, "cost-to-close"] as const,
    queryFn: () => api.costToClose(),
    staleTime: 30 * 1000,
  });
}
