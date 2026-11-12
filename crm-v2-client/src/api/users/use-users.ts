import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type { StaffUser, CreateUserDto, UpdateUserDto } from "./types";
import type { Paginated, PaginationParams } from "../common-api-type";

const keys = {
  all: ["users"] as const,
  list: (
    params: PaginationParams & {
      search?: string;
      role?: string;
      status?: "active" | "inactive" | "all";
    },
  ) => [...keys.all, "list", params] as const,
  byId: (id: string) => [...keys.all, "detail", id] as const,
  stats: () => [...keys.all, "stats"] as const,
};

const api = {
  getAll: (
    params: PaginationParams & {
      search?: string;
      role?: string;
      status?: "active" | "inactive" | "all";
    },
  ): Promise<Paginated<StaffUser[]>> =>
    apiClientAuth.get("/users", { params }).then((r) => r.data),

  getById: (id: string): Promise<StaffUser> =>
    apiClientAuth.get(`/users/${id}`).then((r) => r.data),

  create: (data: CreateUserDto): Promise<StaffUser> =>
    apiClientAuth.post("/users", data).then((r) => r.data),

  update: (id: string, data: UpdateUserDto): Promise<StaffUser> =>
    apiClientAuth.put(`/users/${id}`, data).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    apiClientAuth.delete(`/users/${id}`).then((r) => r.data),

  activate: (id: string): Promise<StaffUser> =>
    apiClientAuth.patch(`/users/${id}/activate`).then((r) => r.data),
};

export function useStaff(
  params: PaginationParams & {
    search?: string;
    role?: string;
    status?: "active" | "inactive" | "all";
  },
) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api.getAll(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStaffMember(id: string) {
  return useQuery({
    queryKey: keys.byId(id),
    queryFn: () => api.getById(id),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserDto) => api.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserDto }) =>
      api.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useActivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.activate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useToggleUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, activate }: { id: string; activate: boolean }) => {
      if (activate) {
        return api.activate(id);
      }
      // Deactivate = soft delete
      await api.remove(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
