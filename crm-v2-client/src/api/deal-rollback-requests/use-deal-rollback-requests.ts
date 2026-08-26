import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  CreateDealRollbackRequestDto,
  DealRollbackRequest,
  DealRollbackRequestListParams,
  ReviewDealRollbackRequestDto,
} from "./types";

const dealRollbackRequestsKeys = {
  all: ["deal-rollback-requests"] as const,
  byDealId: (dealId: string, status?: string) =>
    [...dealRollbackRequestsKeys.all, "deal", dealId, status ?? "all"] as const,
  list: (params?: DealRollbackRequestListParams) =>
    [
      ...dealRollbackRequestsKeys.all,
      "list",
      params?.status ?? "all",
      params?.pipeline_id ?? "all",
    ] as const,
  byId: (requestId: string) =>
    [...dealRollbackRequestsKeys.all, "detail", requestId] as const,
};

const unwrapData = (payload: unknown): unknown => {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const data = (payload as { data?: unknown }).data;
  if (data === undefined) {
    return payload;
  }

  return unwrapData(data);
};

const extractList = (payload: unknown): DealRollbackRequest[] => {
  const unwrapped = unwrapData(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped as DealRollbackRequest[];
  }

  if (unwrapped && typeof unwrapped === "object") {
    const items = (unwrapped as { items?: unknown }).items;
    if (Array.isArray(items)) {
      return items as DealRollbackRequest[];
    }
  }

  return [];
};

const extractRequest = (payload: unknown): DealRollbackRequest => {
  const unwrapped = unwrapData(payload);
  return unwrapped as DealRollbackRequest;
};

const api = {
  listByDeal: (
    dealId: string,
    params?: Pick<DealRollbackRequestListParams, "status">,
  ): Promise<DealRollbackRequest[]> =>
    apiClientAuth
      .get(`/deals/${dealId}/rollback-requests`, { params })
      .then((res) => extractList(res.data)),

  list: (params?: DealRollbackRequestListParams): Promise<DealRollbackRequest[]> =>
    apiClientAuth
      .get("/deal-rollback-requests", { params })
      .then((res) => extractList(res.data)),

  create: (
    dealId: string,
    data: CreateDealRollbackRequestDto,
  ): Promise<DealRollbackRequest> =>
    apiClientAuth
      .post(`/deals/${dealId}/rollback-requests`, data)
      .then((res) => extractRequest(res.data)),

  review: (
    requestId: string,
    data: ReviewDealRollbackRequestDto,
  ): Promise<DealRollbackRequest> =>
    apiClientAuth
      .post(`/deal-rollback-requests/${requestId}/review`, data)
      .then((res) => extractRequest(res.data)),
};

export function useDealRollbackRequestsByDeal(
  dealId: string,
  options?: Pick<DealRollbackRequestListParams, "status">,
) {
  return useQuery({
    queryKey: dealRollbackRequestsKeys.byDealId(dealId, options?.status),
    queryFn: () => api.listByDeal(dealId, options),
    enabled: !!dealId,
  });
}

export function useDealRollbackRequests(
  params?: DealRollbackRequestListParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: dealRollbackRequestsKeys.list(params),
    queryFn: () => api.list(params),
    enabled: options?.enabled ?? true,
  });
}

export function useCreateDealRollbackRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      data,
    }: {
      dealId: string;
      data: CreateDealRollbackRequestDto;
    }) => api.create(dealId, data),
    onSuccess: (request, variables) => {
      queryClient.invalidateQueries({ queryKey: dealRollbackRequestsKeys.all });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({
        queryKey: dealRollbackRequestsKeys.byDealId(
          request?.deal_id || variables.dealId,
          undefined,
        ),
      });
    },
  });
}

export function useReviewDealRollbackRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      data,
    }: {
      requestId: string;
      data: ReviewDealRollbackRequestDto;
    }) => api.review(requestId, data),
    onSuccess: (request) => {
      queryClient.invalidateQueries({ queryKey: dealRollbackRequestsKeys.all });
      queryClient.invalidateQueries({ queryKey: dealRollbackRequestsKeys.byId(request.id) });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      if (request?.deal_id) {
        queryClient.invalidateQueries({
          queryKey: dealRollbackRequestsKeys.byDealId(request.deal_id, undefined),
        });
      }
    },
  });
}

export { dealRollbackRequestsKeys };
