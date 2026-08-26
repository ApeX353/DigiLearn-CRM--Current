import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  BugReport,
  BugReportCounts,
  BugReportFilters,
  CreateBugReportDto,
  UpdateBugReportDto,
  AssignableUser,
} from "./types";

const keys = {
  all: ["bug-reports"] as const,
  list: (filters?: BugReportFilters) =>
    [...keys.all, "list", filters ?? {}] as const,
  counts: (filters?: BugReportFilters) =>
    [...keys.all, "counts", filters ?? {}] as const,
  assignable: [...["bug-reports"], "assignable-users"] as const,
};

interface ListResponse {
  success: boolean;
  data: BugReport[];
  meta?: { total?: number };
}

/** Drop empty values so the query string stays clean. */
function toParams(filters?: BugReportFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (!filters) return out;
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && `${v}`.trim() !== "") out[k] = `${v}`;
  }
  return out;
}

const api = {
  // The server pages at 50 by default and caps at 100, so a single request
  // cannot show the whole tracker. Collect the pages (server-side filtered)
  // and hand back one list; `meta.total` is carried through so the page can
  // state "showing N of M".
  list: async (filters?: BugReportFilters): Promise<ListResponse> => {
    const PER_PAGE = 100;
    const MAX_PAGES = 20; // 2,000 tickets; far beyond any real board
    const base = toParams(filters);
    const rows: BugReport[] = [];
    let total = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await apiClientAuth.get("/bug-reports", {
        params: { ...base, page, limit: PER_PAGE },
      });
      const body = res.data as ListResponse;
      const batch = body?.data ?? [];
      total = body?.meta?.total ?? total;
      rows.push(...batch);
      if (batch.length < PER_PAGE || rows.length >= total) break;
    }
    return { success: true, data: rows, meta: { total: total || rows.length } };
  },

  create: (dto: CreateBugReportDto): Promise<BugReport> =>
    apiClientAuth.post("/bug-reports", dto).then((res) => res.data.data),

  update: (id: string, dto: UpdateBugReportDto): Promise<BugReport> =>
    apiClientAuth.patch(`/bug-reports/${id}`, dto).then((res) => res.data.data),

  assignableUsers: (): Promise<AssignableUser[]> =>
    apiClientAuth
      .get("/bug-reports/assignable-users")
      .then((res) => res.data.data),

  /**
   * One request returns tallies by status AND work_type — replacing the
   * previous four separate per-status requests. Filters (except status)
   * scope the counts the same way they scope the list.
   */
  counts: async (filters?: BugReportFilters): Promise<BugReportCounts> => {
    const res = await apiClientAuth.get("/bug-reports/counts", {
      params: toParams(filters),
    });
    const data = res.data?.data as BugReportCounts | undefined;
    return (
      data ?? { total: 0, byStatus: {}, byWorkType: {} }
    );
  },
};

export function useBugReports(filters?: BugReportFilters) {
  return useQuery({
    queryKey: keys.list(filters),
    queryFn: () => api.list(filters),
    staleTime: 15 * 1000,
  });
}

/** Ticket counts by status and work_type, for the tabs and totals. */
export function useBugReportCounts(filters?: BugReportFilters) {
  return useQuery({
    queryKey: keys.counts(filters),
    queryFn: () => api.counts(filters),
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

/** Only triagers (admin_support / managers) can call this endpoint. */
export function useAssignableUsers(enabled = true) {
  return useQuery({
    queryKey: keys.assignable,
    queryFn: api.assignableUsers,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
