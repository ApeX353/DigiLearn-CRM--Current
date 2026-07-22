import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  BugReport,
  CreateBugReportDto,
  UpdateBugReportDto,
  AssignableUser,
  BugStatus,
} from "./types";

const keys = {
  all: ["bug-reports"] as const,
  list: (status?: BugStatus) => [...keys.all, "list", status ?? "all"] as const,
  assignable: [...["bug-reports"], "assignable-users"] as const,
};

interface ListResponse {
  success: boolean;
  data: BugReport[];
  meta?: { total?: number };
}

const api = {
  list: (status?: BugStatus): Promise<ListResponse> =>
    apiClientAuth
      .get("/bug-reports", { params: status ? { status } : undefined })
      .then((res) => res.data),

  create: (dto: CreateBugReportDto): Promise<BugReport> =>
    apiClientAuth.post("/bug-reports", dto).then((res) => res.data.data),

  update: (id: string, dto: UpdateBugReportDto): Promise<BugReport> =>
    apiClientAuth.patch(`/bug-reports/${id}`, dto).then((res) => res.data.data),

  assignableUsers: (): Promise<AssignableUser[]> =>
    apiClientAuth
      .get("/bug-reports/assignable-users")
      .then((res) => res.data.data),
};

export function useBugReports(status?: BugStatus) {
  return useQuery({
    queryKey: keys.list(status),
    queryFn: () => api.list(status),
    staleTime: 15 * 1000,
  });
}

export function useCreateBugReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateBugReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateBugReportDto }) =>
      api.update(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

/** Only triagers (admin / admin_support) can call this endpoint. */
export function useAssignableUsers(enabled = true) {
  return useQuery({
    queryKey: keys.assignable,
    queryFn: api.assignableUsers,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
