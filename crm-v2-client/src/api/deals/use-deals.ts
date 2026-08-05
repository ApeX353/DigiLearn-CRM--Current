/* eslint-disable @typescript-eslint/no-explicit-any */
// This file uses 'any' for normalizing dynamic API responses with varying shapes
// The API can return different response structures (wrapped or unwrapped, camelCase or snake_case)
// Using 'any' here is intentional for flexible property access during normalization

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  Deal,
  DealListParams,
  DealsSummary,
  CreateDealDto,
  UpdateDealDto,
  BulkUpdateDealsDto,
  CloseDealValues,
  ArchivedDealsParams,
  ArchivedDealsResponse,
} from "./types";
import { closeDealSchema } from "./types";
import type { ApiResponse, Paginated } from "../common-api-type";

const keys = {
  all: ["deals"] as const,
  list: (params: DealListParams) => [...keys.all, "list", params] as const,
  listPipelineDeals: (pipelineId: string) =>
    [...keys.all, "list-pipeline-deals", pipelineId] as const,
  archived: (params: ArchivedDealsParams) =>
    [
      ...keys.all,
      "archived",
      params.pipeline_id ?? "",
      params.close_status ?? "",
      params.search ?? "",
      params.date_from ?? "",
      params.date_to ?? "",
      params.page,
      params.limit,
    ] as const,
  summary: (pipelineId?: string) =>
    [...keys.all, "summary", pipelineId] as const,
  byId: (id: string) => [...keys.all, "detail", id] as const,
};

const api = {
  getAll: (params: DealListParams): Promise<Paginated<Deal[]>> =>
    apiClientAuth.get("/deals", { params }).then((r) => r.data),

  getPipelineDeals: (id: string): Promise<ApiResponse<Deal[]>> =>
    apiClientAuth.get(`/deals/pipeline/${id}`).then((r) => r.data),

  getArchivedDeals: (params: ArchivedDealsParams): Promise<ArchivedDealsResponse> =>
    apiClientAuth.get("/deals/archived", { params }).then((r) => r.data),

  getSummary: (pipelineId?: string): Promise<ApiResponse<DealsSummary>> =>
    apiClientAuth
      .get("/deals/summary", {
        params: pipelineId ? { pipeline_id: pipelineId } : undefined,
      })
      .then((r) => r.data),

  getById: (id: string): Promise<ApiResponse<Deal> | Deal> =>
    apiClientAuth.get(`/deals/${id}`).then((r) => r.data),

  create: (data: CreateDealDto): Promise<Deal> =>
    apiClientAuth.post("/deals", data).then((r) => r.data),

  update: (id: string, data: UpdateDealDto): Promise<Deal> =>
    apiClientAuth.put(`/deals/${id}`, data).then((r) => r.data),

  close: (id: string, data: CloseDealValues): Promise<Deal> =>
    apiClientAuth.patch(`/deals/${id}/close`, data).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    apiClientAuth.delete(`/deals/${id}`).then((r) => r.data),

  bulkUpdate: (data: BulkUpdateDealsDto): Promise<void> =>
    apiClientAuth.patch("/deals/bulk-update", data).then((r) => r.data),
};

async function getArchivedDealsAllPages(
  params: ArchivedDealsParams,
): Promise<ArchivedDealsResponse> {
  const firstPage = await api.getArchivedDeals(params);
  const totalPages = firstPage?.meta?.totalPages ?? 1;

  if (totalPages <= 1) {
    return firstPage;
  }

  let allDeals = [...(firstPage.data ?? [])];

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await api.getArchivedDeals({
      ...params,
      page,
    });
    allDeals = allDeals.concat(nextPage.data ?? []);
  }

  return {
    ...firstPage,
    data: allDeals,
    meta: {
      ...firstPage.meta,
      itemCount: allDeals.length,
    },
  };
}

const normalizeDeal = (rawResponse: any, fallbackId = ""): Deal => {
  const raw =
    (rawResponse as any)?.id || !(rawResponse as any)?.data
      ? rawResponse
      : (rawResponse as any).data;

  const stage = (raw as any)?.current_stage ?? (raw as any)?.stage;
  const pipeline = (raw as any)?.pipeline;
  const owner = (raw as any)?.owner ?? (raw as any)?.assigned_user;
  const statusRaw =
    (raw as any)?.status ??
    (raw as any)?.closeStatus ??
    (raw as any)?.current_status ??
    (raw as any)?.currentStatus;
  const normalizedStatus = (() => {
    const value = String(statusRaw || "open").toLowerCase();
    if (value === "won") return "won";
    if (value === "lost") return "lost";
    return "open";
  })();

  const valueRaw =
    (raw as any)?.value ??
    (raw as any)?.estimated_value ??
    (raw as any)?.lead?.estimated_value ??
    0;
  const parsedValue = Number(valueRaw);
  const rollbackCountRaw =
    (raw as any)?.rollback_count ??
    (raw as any)?.rollbackCount ??
    (raw as any)?.stage_data?.backward_moves ??
    0;
  const rollbackCount = Number(rollbackCountRaw);
  const normalizedRollbackCount = Number.isFinite(rollbackCount)
    ? rollbackCount
    : 0;

  return {
    ...raw,
    id: (raw as any)?.id || fallbackId,
    title: (raw as any)?.title || (raw as any)?.deal_name || "",
    deal_name: (raw as any)?.deal_name || (raw as any)?.title,
    value: Number.isFinite(parsedValue) ? parsedValue : 0,
    position: (raw as any)?.position ?? 0,
    current_stage_id:
      (raw as any)?.current_stage_id ??
      (raw as any)?.currentStageId ??
      stage?.id ??
      "",
    stage: stage ?? (raw as any)?.stage,
    current_stage: (raw as any)?.current_stage ?? stage,
    pipeline_id:
      (raw as any)?.pipeline_id ??
      (raw as any)?.pipelineId ??
      stage?.pipeline_id ??
      "",
    pipeline: pipeline ?? (raw as any)?.pipeline,
    school_id:
      (raw as any)?.school_id ??
      (raw as any)?.schoolId ??
      (raw as any)?.lead?.school_id,
    school: (raw as any)?.school ?? (raw as any)?.lead?.school,
    lead_id: (raw as any)?.lead_id ?? (raw as any)?.leadId,
    lead: (raw as any)?.lead,
    owner_id:
      (raw as any)?.owner_id ??
      (raw as any)?.assigned_to ??
      owner?.id,
    owner: owner ?? (raw as any)?.owner,
    assigned_to:
      (raw as any)?.assigned_to ??
      (raw as any)?.assignedTo ??
      (raw as any)?.assigned_user?.id,
    assigned_user:
      (raw as any)?.assigned_user ?? (raw as any)?.assignedUser,
    status: normalizedStatus,
    current_status:
      (raw as any)?.current_status ??
      (raw as any)?.currentStatus ??
      stage?.name,
    health_score:
      (raw as any)?.health_score ?? (raw as any)?.healthScore,
    risk_score: (raw as any)?.risk_score ?? (raw as any)?.riskScore,
    expected_close_date:
      (raw as any)?.expected_close_date ??
      (raw as any)?.expectedCloseDate,
    closed_at:
      (raw as any)?.closed_at ?? (raw as any)?.actualCloseDate,
    current_stage_since:
      (raw as any)?.current_stage_since ??
      (raw as any)?.currentStageSince,
    last_contacted_at:
      (raw as any)?.last_contacted_at ??
      (raw as any)?.lastContactedAt ??
      (raw as any)?.lead?.last_contacted_at,
    rollback_count: normalizedRollbackCount,
    stage_data: {
      ...((raw as any)?.stage_data ?? {}),
      backward_moves: normalizedRollbackCount,
    },
    notes: (raw as any)?.notes ?? (raw as any)?.lead?.notes,
    created_at: (raw as any)?.created_at ?? (raw as any)?.createdAt ?? "",
    updated_at: (raw as any)?.updated_at ?? (raw as any)?.updatedAt ?? "",
    currentStatus: (raw as any)?.currentStatus,
    expectedCloseDate: (raw as any)?.expectedCloseDate,
    actualCloseDate: (raw as any)?.actualCloseDate,
    currentStageSince: (raw as any)?.currentStageSince,
    createdAt: (raw as any)?.createdAt,
    updatedAt: (raw as any)?.updatedAt,
    closeStatus: (raw as any)?.closeStatus,
    stageHistory: (raw as any)?.stageHistory ?? (raw as any)?.stage_history,
    quotes: (raw as any)?.quotes ?? [],
    invoices: (raw as any)?.invoices ?? [],
  } as Deal;
};

export function useDeals(params: DealListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api.getAll(params),
  });
}

export function usePipelineDeals(id: string) {
  return useQuery({
    queryKey: keys.listPipelineDeals(id),
    queryFn: async () => {
      const response = await api.getPipelineDeals(id);
      return {
        ...response,
        data: Array.isArray(response?.data)
          ? response.data.map((deal) => normalizeDeal(deal))
          : [],
      };
    },
    enabled: !!id,
  });
}

export function useArchivedDeals(
  params: ArchivedDealsParams | null | undefined,
  options?: { enabled?: boolean; fetchAllPages?: boolean },
) {
  const enabled = (options?.enabled ?? true) && !!params;

  return useQuery({
    queryKey: params
      ? keys.archived(params)
      : ([...keys.all, "archived", "disabled"] as const),
    queryFn: async () => {
      if (!params) {
        throw new Error("Archived deal params are required");
      }
      if (options?.fetchAllPages) {
        return getArchivedDealsAllPages(params);
      }
      return api.getArchivedDeals(params);
    },
    enabled,
  });
}

export function useDealsSummary(pipelineId?: string) {
  return useQuery({
    queryKey: keys.summary(pipelineId),
    queryFn: () => api.getSummary(pipelineId),
    enabled: !!pipelineId,
  });
}

export function useDeal(id: string) {
  return useQuery({
    queryKey: keys.byId(id),
    queryFn: async () => {
      const response = await api.getById(id);
      return normalizeDeal((response as { data?: Deal }).data ?? response, id);
    },
    enabled: !!id,
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDealDto) => api.create(data),
    // DEAL-GHOST1: reconcile the deal/pipeline caches on BOTH outcomes. A
    // rejected create previously invalidated nothing (onSuccess only), so a
    // stale card could linger on the pipeline until a hard refresh — the
    // "ghost deal" Kim saw after a failed create. Refetching on settle
    // forces the board to match the database on success OR failure.
    onSettled: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDealDto }) =>
      api.update(id, data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: keys.all });
      qc.invalidateQueries({ queryKey: keys.byId(variables.id) });
    },
  });
}

export function useCloseDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CloseDealValues }) =>
      api.close(
        id,
        (() => {
          const parsed = closeDealSchema.parse(data);
          if (parsed.close_status === "lost") {
            return {
              close_status: parsed.close_status,
              lost_reason: parsed.lost_reason?.trim(),
            };
          }
          return { close_status: "won" as const };
        })(),
      ),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: keys.all });
      qc.invalidateQueries({ queryKey: keys.byId(variables.id) });
    },
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useBulkUpdateDeals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkUpdateDealsDto) => api.bulkUpdate(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
