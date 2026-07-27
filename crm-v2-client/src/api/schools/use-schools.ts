import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth, handleApiError } from "~/api/axios";
import type { School, SchoolStats, Province, SchoolType, AddSchoolValues, UpdateSchoolValues } from "./types";
import type { Paginated, ApiResponse, PaginationParams } from "../common-api-type";

// Query keys
export const schoolsKeys = {
  all: ["schools"] as const,
  allSchools: (
    params: PaginationParams & {
      province?: Province;
      school_type?: SchoolType;
      search?: string;
    },
  ) => [...schoolsKeys.all, "list", params] as const,
  byId: (id: string) => [...schoolsKeys.all, "detail", id] as const,
  stats: (id: string) => [...schoolsKeys.all, "stats", id] as const,
};

// API functions
const schoolsApi = {
  // Get all schools
  getAllSchools: (
    params: PaginationParams & {
      province?: Province;
      school_type?: SchoolType;
      search?: string;
    },
  ): Promise<Paginated<School[]>> =>
    apiClientAuth.get("/schools", { params }).then((res) => res.data),

  // Get school by ID
  getById: (id: string): Promise<ApiResponse<School>> =>
    apiClientAuth.get(`/schools/${id}`).then((res) => res.data),

  // Create new school
  create: (data: AddSchoolValues): Promise<School> =>
    apiClientAuth.post("/schools/with-contacts", data).then((res) => res.data),

  // Update school
  update: (id: string, data: UpdateSchoolValues): Promise<School> =>
    apiClientAuth.put(`/schools/${id}`, data).then((res) => res.data),

  // Get school stats
  getStats: (id: string): Promise<ApiResponse<SchoolStats>> =>
    apiClientAuth.get(`/schools/${id}/stats`).then((res) => res.data),

  // Fill in a missing city (open to every role)
  setCity: (id: string, city: string): Promise<ApiResponse<School>> =>
    apiClientAuth.patch(`/schools/${id}/city`, { city }).then((res) => res.data),
};

// Hooks

/**
 * Get all schools with optional filters
 */
export function useSchools(
  params: PaginationParams & {
    province?: Province;
    school_type?: SchoolType;
    search?: string;
  },
) {
  return useQuery({
    queryKey: schoolsKeys.allSchools(params),
    queryFn: () => schoolsApi.getAllSchools(params),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Get school by ID
 */
export function useSchool(id: string) {
  return useQuery({
    queryKey: schoolsKeys.byId(id),
    queryFn: () => schoolsApi.getById(id),
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  });
}

/**
 * Create a new school
 */
export function useCreateSchool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: schoolsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolsKeys.all });
    },
    onError: (error) => {
      console.error("Create school error:", handleApiError(error));
    },
  });
}

export function useSchoolStats(id: string) {
  return useQuery({
    queryKey: schoolsKeys.stats(id),
    queryFn: () => schoolsApi.getStats(id),
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  });
}

/**
 * Fill in a missing city on a school. Available to every signed-in
 * user — the server rejects overwriting an already-set city for
 * non-managers.
 */
export function useSetSchoolCity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, city }: { id: string; city: string }) =>
      schoolsApi.setCity(id, city),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolsKeys.all });
    },
    onError: (error) => {
      console.error("Set school city error:", handleApiError(error));
    },
  });
}

export function useUpdateSchool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSchoolValues }) =>
      schoolsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolsKeys.all });
    },
    onError: (error) => {
      console.error("Update school error:", handleApiError(error));
    },
  });
}
