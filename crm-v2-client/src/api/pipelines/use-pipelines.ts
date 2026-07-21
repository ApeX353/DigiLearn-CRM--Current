import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth, handleApiError } from "~/api/axios";
import type {
  Pipeline,
  Stage,
  CreatePipelineValues,
  UpdatePipelineValues,
  CreateStageDto,
  UpdateStageDto,
  ReorderStagesDto,
  PaginationParams,
} from "./types";
import type { Paginated } from "../common-api-type";

// Query keys
export const pipelineKeys = {
  all: ["pipelines"] as const,
  lists: () => [...pipelineKeys.all, "list"] as const,
  list: (params?: PaginationParams) =>
    [...pipelineKeys.lists(), params] as const,
  details: () => [...pipelineKeys.all, "detail"] as const,
  detail: (id: string) => [...pipelineKeys.details(), id] as const,
  default: () => [...pipelineKeys.all, "default"] as const,
  stages: (pipelineId: string) =>
    [...pipelineKeys.all, "stages", pipelineId] as const,
  stage: (pipelineId: string, stageId: string) =>
    [...pipelineKeys.all, "stage", pipelineId, stageId] as const,
};

// API functions - Pipelines
const pipelineApi = {
  // Get all pipelines
  getAll: (
    params?: PaginationParams,
  ): Promise<{ data: Pipeline[]; total: number }> =>
    apiClientAuth.get("/pipelines", { params }).then((res) => res.data),

  // Get pipeline by ID
  getById: (id: string): Promise<Pipeline> =>
    apiClientAuth.get(`/pipelines/${id}`).then((res) => res.data),

  // Get default pipeline
  getDefault: (): Promise<Pipeline> =>
    apiClientAuth.get("/pipelines/default").then((res) => res.data),

  // Create pipeline
  create: (data: CreatePipelineValues): Promise<Pipeline> =>
    apiClientAuth.post("/pipelines", data).then((res) => res.data),

  // Update pipeline
  update: (id: string, data: UpdatePipelineValues): Promise<Pipeline> =>
    apiClientAuth.put(`/pipelines/${id}`, data).then((res) => res.data),

  // Delete pipeline (soft delete)
  remove: (id: string): Promise<void> =>
    apiClientAuth.delete(`/pipelines/${id}`).then((res) => res.data),

  // Set pipeline as default
  setDefault: (id: string): Promise<Pipeline> =>
    apiClientAuth.patch(`/pipelines/${id}/set-default`).then((res) => res.data),
};

// API functions - Stages
const stageApi = {
  // Get all stages for a pipeline
  getByPipeline: (
    pipelineId: string,
  ): Promise<Omit<Paginated<Stage[]>, "meta">> =>
    apiClientAuth
      .get(`/pipelines/${pipelineId}/stages`)
      .then((res) => res.data),

  // Get stage by ID
  getById: (pipelineId: string, stageId: string): Promise<Stage> =>
    apiClientAuth
      .get(`/pipelines/${pipelineId}/stages/${stageId}`)
      .then((res) => res.data),

  // Create stage
  create: (pipelineId: string, data: CreateStageDto): Promise<Stage> =>
    apiClientAuth
      .post(`/pipelines/${pipelineId}/stages`, data)
      .then((res) => res.data),

  // Update stage
  update: (
    pipelineId: string,
    stageId: string,
    data: UpdateStageDto,
  ): Promise<Stage> =>
    apiClientAuth
      .put(`/pipelines/${pipelineId}/stages/${stageId}`, data)
      .then((res) => res.data),

  // Delete stage (soft delete)
  remove: (pipelineId: string, stageId: string): Promise<void> =>
    apiClientAuth
      .delete(`/pipelines/${pipelineId}/stages/${stageId}`)
      .then((res) => res.data),

  // Reorder stages
  reorder: (pipelineId: string, data: ReorderStagesDto): Promise<Stage[]> =>
    apiClientAuth
      .patch(`/pipelines/${pipelineId}/stages/reorder`, data)
      .then((res) => res.data),
};

// Hooks - Pipelines

/**
 * Get all pipelines
 */
export function usePipelines(params?: PaginationParams) {
  return useQuery({
    queryKey: pipelineKeys.list(params),
    queryFn: () => pipelineApi.getAll(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get pipeline by ID
 */
export function usePipeline(id: string) {
  return useQuery({
    queryKey: pipelineKeys.detail(id),
    queryFn: () => pipelineApi.getById(id),
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  });
}

/**
 * Get default pipeline
 */
export function useDefaultPipeline() {
  return useQuery({
    queryKey: pipelineKeys.default(),
    queryFn: pipelineApi.getDefault,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Create pipeline
 */
export function useCreatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: pipelineApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
    onError: (error) => {
      console.error("Create pipeline error:", handleApiError(error));
    },
  });
}

/**
 * Update pipeline
 */
export function useUpdatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePipelineValues }) =>
      pipelineApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
    onError: (error) => {
      console.error("Update pipeline error:", handleApiError(error));
    },
  });
}

/**
 * Delete pipeline
 */
export function useDeletePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: pipelineApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
    onError: (error) => {
      console.error("Delete pipeline error:", handleApiError(error));
    },
  });
}

/**
 * Set pipeline as default
 */
export function useSetDefaultPipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: pipelineApi.setDefault,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
    onError: (error) => {
      console.error("Set default pipeline error:", handleApiError(error));
    },
  });
}

// Hooks - Stages

/**
 * Get all stages for a pipeline
 */
export function usePipelineStages(pipelineId: string) {
  return useQuery({
    queryKey: pipelineKeys.stages(pipelineId),
    queryFn: () => stageApi.getByPipeline(pipelineId),
    staleTime: 5 * 60 * 1000,
    enabled: !!pipelineId,
  });
}

/**
 * Get stage by ID
 */
export function usePipelineStage(pipelineId: string, stageId: string) {
  return useQuery({
    queryKey: pipelineKeys.stage(pipelineId, stageId),
    queryFn: () => stageApi.getById(pipelineId, stageId),
    staleTime: 5 * 60 * 1000,
    enabled: !!pipelineId && !!stageId,
  });
}

/**
 * Create stage
 */
export function useCreateStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pipelineId,
      data,
    }: {
      pipelineId: string;
      data: CreateStageDto;
    }) => stageApi.create(pipelineId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: pipelineKeys.stages(variables.pipelineId),
      });
    },
    onError: (error) => {
      console.error("Create stage error:", handleApiError(error));
    },
  });
}

/**
 * Update stage
 */
export function useUpdateStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pipelineId,
      stageId,
      data,
    }: {
      pipelineId: string;
      stageId: string;
      data: UpdateStageDto;
    }) => stageApi.update(pipelineId, stageId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: pipelineKeys.stages(variables.pipelineId),
      });
    },
    onError: (error) => {
      console.error("Update stage error:", handleApiError(error));
    },
  });
}

/**
 * Delete stage
 */
export function useDeleteStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pipelineId,
      stageId,
    }: {
      pipelineId: string;
      stageId: string;
    }) => stageApi.remove(pipelineId, stageId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: pipelineKeys.stages(variables.pipelineId),
      });
    },
    onError: (error) => {
      console.error("Delete stage error:", handleApiError(error));
    },
  });
}

/**
 * Reorder stages
 */
export function useReorderStages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pipelineId,
      data,
    }: {
      pipelineId: string;
      data: ReorderStagesDto;
    }) => stageApi.reorder(pipelineId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: pipelineKeys.stages(variables.pipelineId),
      });
    },
    onError: (error) => {
      console.error("Reorder stages error:", handleApiError(error));
    },
  });
}
