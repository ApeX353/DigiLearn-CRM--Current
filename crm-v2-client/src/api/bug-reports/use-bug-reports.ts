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
  // The server pages at 50 by default and refuses anything above 100, so
  // a single request cannot show the whole tracker. Collect the pages and
  // hand back one list. `meta.total` is carried through so the page can
  // state "showing N of M" — a short list is never silent.
  list: async (status?: BugStatus): Promise<ListResponse> => {
    const PER_PAGE = 100;
    const MAX_PAGES = 20; // 2,000 tickets; far beyond any real board
    const rows: BugReport[] = [];
    let total = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await apiClientAuth.get("/bug-reports", {
        params: { ...(status ? { status } : {}), page, limit: PER_PAGE },
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
   * Counts per status.
   *
   * Deliberately NOT derived by counting the rows of a list call: the
   * list is paginated and returns 50 by default, so counting rows gives
   * the size of the first page, not the board. Each status is asked for
   * with limit=1 and only `meta.total` is read — accurate at any volume,
   * and the payloads are tiny.
   */
  counts: async (): Promise<Record<BugStatus, number>> => {
    const statuses: BugStatus[] = [
      "open",
      "in_progress",
      "resolved",
      "closed",
    ];
    const totals = await Promise.all(
      statuses.map((s) =>
        apiClientAuth
          .get("/bug-reports", { params: { status: s, limit: 1 } })
          .then((res) => Number(res.data?.meta?.total ?? 0))
          .catch(() => 0),
      ),
    );
    return statuses.reduce(
      (acc, s, i) => ({ ...acc, [s]: totals[i] }),
      {} as Record<BugStatus, number>,
    );
  },
};

export function useBugReports(status?: BugStatus) {
  return useQuery({
    queryKey: keys.list(status),
    queryFn: () => api.list(status),
    staleTime: 15 * 1000,
  });
}

/** Ticket counts by status, for the at-a-glance totals. */
export function useBugReportCounts() {
  return useQuery({
    queryKey: [...keys.all, "counts"] as const,
    queryFn: api.counts,
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
