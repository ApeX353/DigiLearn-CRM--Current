import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth, handleApiError } from "~/api/axios";
import type { Paginated, PaginationParams } from "../common-api-type";
import type { Staff, UserStatus } from "./types";
import type {
  BulkImportStaffRequest,
  BulkImportStaffResponse,
} from "./bulk-import-types";
import z from "zod";
import type { Role } from "../rbac";

export const addStaffForm = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one symbol"),
  role_ids: z.array(z.string()).min(1, "At least one role is required"),
});

export type AddStaffValues = z.infer<typeof addStaffForm>;

export const staffKeys = {
  all: ["staff"] as const,
  allStaff: ({
    role,
    search,
    page,
    limit,
    status,
  }: PaginationParams & {
    role?: Role;
    search?: string;
    status: UserStatus;
  }) => [...staffKeys.all, role, search, status, page, limit] as const,
};

const staffApi = {
  getAllStaff: (
    params: PaginationParams & {
      role?: Role;
      search?: string;
      status: UserStatus;
    },
  ): Promise<Paginated<Staff[]>> =>
    apiClientAuth.get("/users", { params }).then((res) => res.data),

  addStaff: (data: AddStaffValues): Promise<Staff> =>
    apiClientAuth.post("/users", data).then((res) => res.data),

  bulkImportStaff: (
    data: BulkImportStaffRequest,
  ): Promise<BulkImportStaffResponse> =>
    apiClientAuth.post("/users/bulk-import", data).then((res) => res.data),

  deleteStaff: ({
    id,
    permanent = false,
  }: {
    id: string;
    permanent: boolean;
  }): Promise<void> =>
    apiClientAuth.delete(`/users/delete/${id}`, {
      params: {
        permanent,
      },
    }),
};

export function useAllStaff({
  role,
  search,
  page,
  limit,
  status,
}: PaginationParams & {
  role?: Role;
  search?: string;
  status: UserStatus;
}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: staffKeys.allStaff({ role, search, page, limit, status }),
    queryFn: () => staffApi.getAllStaff({ role, search, page, limit, status }),
    staleTime: 10 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Add a new staff member
 */
export function useAddStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: staffApi.addStaff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
    onError: (error) => {
      console.error("Add staff error:", handleApiError(error));
    },
  });
}

/**
 * Bulk import staff from Excel/CSV file
 */
export function useBulkImportStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: staffApi.bulkImportStaff,
    onSuccess: () => {
      // Invalidate all staff queries to refetch data
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
    onError: (error) => {
      console.error("Bulk import error:", handleApiError(error));
    },
  });
}

/**
 * Add a new staff member
 */
export function useDeleteStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: staffApi.deleteStaff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
    onError: (error) => {
      console.error("Add staff error:", handleApiError(error));
    },
  });
}
