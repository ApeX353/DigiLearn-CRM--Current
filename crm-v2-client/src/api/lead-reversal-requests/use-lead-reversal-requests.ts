import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type { Lead } from "~/api/leads";
import { leadsKeys } from "~/api/leads";
import type {
  ApproveLeadReversalRequestDto,
  CreateLeadReversalRequestDto,
  LeadReversalRequest,
  LeadReversalRequestStatus,
  RejectLeadReversalRequestDto,
} from "./types";

const leadReversalRequestsKeys = {
  all: ["lead-reversal-requests"] as const,
  byLeadId: (leadId: string, status?: LeadReversalRequestStatus) =>
    [...leadReversalRequestsKeys.all, "list", leadId, status ?? "all"] as const,
  byId: (requestId: string) =>
    [...leadReversalRequestsKeys.all, "detail", requestId] as const,
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

const extractList = (payload: unknown): LeadReversalRequest[] => {
  const unwrapped = unwrapData(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped as LeadReversalRequest[];
  }

  if (unwrapped && typeof unwrapped === "object") {
    const items = (unwrapped as { items?: unknown }).items;
    if (Array.isArray(items)) {
      return items as LeadReversalRequest[];
    }
  }

  return [];
};

const extractRequest = (payload: unknown): LeadReversalRequest => {
  const unwrapped = unwrapData(payload);

  if (unwrapped && typeof unwrapped === "object") {
    const request = (unwrapped as { request?: unknown }).request;
    if (request && typeof request === "object") {
      return request as LeadReversalRequest;
    }

    const reversalRequest = (unwrapped as { reversal_request?: unknown })
      .reversal_request;
    if (reversalRequest && typeof reversalRequest === "object") {
      return reversalRequest as LeadReversalRequest;
    }
  }

  return unwrapped as LeadReversalRequest;
};

interface LeadReversalDecisionResult {
  request: LeadReversalRequest;
  lead?: Lead | null;
}

const extractDecisionResult = (
  payload: unknown,
): LeadReversalDecisionResult => {
  const unwrapped = unwrapData(payload);

  if (unwrapped && typeof unwrapped === "object") {
    const request = extractRequest(unwrapped);
    const lead = (unwrapped as { lead?: Lead | null }).lead;
    return {
      request,
      lead: lead ?? null,
    };
  }

  return {
    request: unwrapped as LeadReversalRequest,
    lead: null,
  };
};

const api = {
  list: (
    leadId: string,
    params?: { status?: LeadReversalRequestStatus },
  ): Promise<LeadReversalRequest[]> =>
    apiClientAuth
      .get(`/leads/${leadId}/reversal-requests`, { params })
      .then((res) => extractList(res.data)),

  /**
   * Phase C.2 — manager queue feed across all leads.
   */
  listAll: (params?: {
    status?: LeadReversalRequestStatus;
    kind?: "status_reversal" | "reassignment" | "tactical_disqualify";
    limit?: number;
  }): Promise<LeadReversalRequest[]> =>
    apiClientAuth
      .get(`/lead-reversal-requests`, { params })
      .then((res) => extractList(res.data)),

  create: (
    leadId: string,
    data: CreateLeadReversalRequestDto,
  ): Promise<LeadReversalRequest> =>
    apiClientAuth
      .post(`/leads/${leadId}/reversal-requests`, data)
      .then((res) => extractRequest(res.data)),

  approve: (
    requestId: string,
    data: ApproveLeadReversalRequestDto,
  ): Promise<LeadReversalDecisionResult> =>
    apiClientAuth
      .post(`/lead-reversal-requests/${requestId}/approve`, data)
      .then((res) => extractDecisionResult(res.data)),

  reject: (
    requestId: string,
    data: RejectLeadReversalRequestDto,
  ): Promise<LeadReversalDecisionResult> =>
    // Server has a single decision endpoint that handles both
    // approved and rejected — it dispatches based on the
    // `decision` field in the body. Reject is just an approve call
    // with `decision: 'rejected'`.
    apiClientAuth
      .post(`/lead-reversal-requests/${requestId}/approve`, data)
      .then((res) => extractDecisionResult(res.data)),

  raiseEnquiry: (requestId: string, message: string) =>
    apiClientAuth
      .post(`/lead-reversal-requests/${requestId}/enquiry`, { message })
      .then((res) => res.data?.data),

  respondToEnquiry: (requestId: string, message: string) =>
    apiClientAuth
      .post(`/lead-reversal-requests/${requestId}/respond`, { message })
      .then((res) => res.data?.data),

  listMine: (): Promise<LeadReversalRequest[]> =>
    apiClientAuth
      .get(`/lead-reversal-requests/mine`)
      .then((res) => res.data?.data ?? []),
};

export function useLeadReversalRequests(
  leadId: string,
  options?: { status?: LeadReversalRequestStatus },
) {
  return useQuery({
    queryKey: leadReversalRequestsKeys.byLeadId(leadId, options?.status),
    queryFn: () => api.list(leadId, options),
    enabled: !!leadId,
  });
}

/** Enquiry (#12) — the caller's own requests, to answer manager questions. */
export function useMyReversalRequests() {
  return useQuery({
    queryKey: [...leadReversalRequestsKeys.all, "mine"],
    queryFn: () => api.listMine(),
  });
}

export function useRaiseEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { requestId: string; message: string }) =>
      api.raiseEnquiry(v.requestId, v.message),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: leadReversalRequestsKeys.all }),
  });
}

export function useRespondToEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { requestId: string; message: string }) =>
      api.respondToEnquiry(v.requestId, v.message),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: leadReversalRequestsKeys.all }),
  });
}

/** Phase C.2 — cross-lead queue for managers. */
export function useAllLeadReversalRequests(opts?: {
  status?: LeadReversalRequestStatus;
  kind?: "status_reversal" | "reassignment" | "tactical_disqualify";
  limit?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      ...leadReversalRequestsKeys.all,
      "list-all",
      opts?.status ?? "all",
      opts?.kind ?? "all",
      opts?.limit ?? 100,
    ] as const,
    queryFn: () =>
      api.listAll({
        status: opts?.status,
        kind: opts?.kind,
        limit: opts?.limit,
      }),
    enabled: opts?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

export function useCreateLeadReversalRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      leadId,
      data,
    }: {
      leadId: string;
      data: CreateLeadReversalRequestDto;
    }) => api.create(leadId, data),
    onSuccess: (request, variables) => {
      const leadId = request?.lead_id || variables.leadId;
      queryClient.invalidateQueries({ queryKey: leadReversalRequestsKeys.all });
      queryClient.invalidateQueries({ queryKey: leadsKeys.all });
      if (leadId) {
        queryClient.invalidateQueries({ queryKey: leadsKeys.byId(leadId) });
      }
    },
  });
}

export function useApproveLeadReversalRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      data,
    }: {
      requestId: string;
      data: ApproveLeadReversalRequestDto;
    }) => api.approve(requestId, data),
    onSuccess: ({ request, lead }) => {
      const leadId = request?.lead_id || lead?.id;
      queryClient.invalidateQueries({ queryKey: leadReversalRequestsKeys.all });
      queryClient.invalidateQueries({ queryKey: leadReversalRequestsKeys.byId(request.id) });
      queryClient.invalidateQueries({ queryKey: leadsKeys.all });
      if (leadId) {
        queryClient.invalidateQueries({ queryKey: leadsKeys.byId(leadId) });
      }
    },
  });
}

export function useRejectLeadReversalRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      data,
    }: {
      requestId: string;
      data: RejectLeadReversalRequestDto;
    }) => api.reject(requestId, data),
    onSuccess: ({ request, lead }) => {
      const leadId = request?.lead_id || lead?.id;
      queryClient.invalidateQueries({ queryKey: leadReversalRequestsKeys.all });
      queryClient.invalidateQueries({ queryKey: leadReversalRequestsKeys.byId(request.id) });
      queryClient.invalidateQueries({ queryKey: leadsKeys.all });
      if (leadId) {
        queryClient.invalidateQueries({ queryKey: leadsKeys.byId(leadId) });
      }
    },
  });
}

export { leadReversalRequestsKeys };
