import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";

/**
 * Import approvals (TEST-BACKLOG §2). An upload STAGES a pending batch —
 * nothing hits the CRM until a manager approves. These hooks back the
 * "Import approvals" section of the manager Approval Queue.
 */

export type ImportRowDuplicateKind =
  | "existing-school"
  | "existing-lead"
  | "within-batch";

export interface ImportRowDuplicate {
  kind: ImportRowDuplicateKind;
  name: string;
  id?: string;
}

export interface PendingImportRow {
  rowNumber: number;
  schoolName: string;
  contactFirst: string;
  contactLast: string;
  province: string | null;
  region: "urban" | "rural" | null;
  city?: string;
  district?: string;
  phone?: string;
  role: string;
  status: "importable" | "invalid";
  invalidReason?: string;
  /** R3: region couldn't be mapped to urban|rural (e.g. "peri urban") but the
   *  row is otherwise complete — a manager must pick a region to admit it. */
  needsRegion?: boolean;
  duplicate?: ImportRowDuplicate;
  decision: "approve" | "skip";
}

export type ImportBatchStatus = "pending" | "approved" | "rejected";

export interface ImportBatch {
  id: string;
  filename: string | null;
  status: ImportBatchStatus;
  total_rows: number;
  importable_count: number;
  duplicate_count: number;
  created_count: number | null;
  campaign_id: string | null;
  created_at: string;
  /** Set when the batch was approved/rejected — drives the "Approved" view. */
  decided_at?: string | null;
  uploaded_by?: { first_name?: string; last_name?: string } | null;
  /** R7: entry_date drives the campaign "folder" header on the approval queue. */
  campaign?: { id: string; name: string; entry_date?: string | null } | null;
  rows?: PendingImportRow[];
}

export const importBatchKeys = {
  all: ["import-batches"] as const,
  list: (status: "pending" | "approved") =>
    ["import-batches", { status }] as const,
  detail: (id: string) => ["import-batches", id] as const,
};

/** Import batches for the approval queue (rows omitted). Defaults to pending;
 *  pass "approved" for the read-only Approved view. Polls so the nav badge
 *  updates and beeps soon after a new import comes in. */
export function useImportBatches(status: "pending" | "approved" = "pending") {
  return useQuery({
    queryKey: importBatchKeys.list(status),
    queryFn: async (): Promise<ImportBatch[]> => {
      const res = await apiClientAuth.get("/leads/import/batches", {
        params: { status },
      });
      return res.data?.data ?? [];
    },
    // Real-time counters: poll fast so importable/duplicate/created counts and
    // the nav badge update live (esp. created_count ticking during approval).
    refetchInterval: 4_000,
  });
}

/** One batch with its rows and duplicate flags. */
export function useImportBatch(id: string | null) {
  return useQuery({
    queryKey: id ? importBatchKeys.detail(id) : ["import-batches", "none"],
    enabled: !!id,
    queryFn: async (): Promise<ImportBatch> => {
      const res = await apiClientAuth.get(`/leads/import/batches/${id}`);
      return res.data?.data;
    },
    // Keep the open batch's row/decision counters live.
    refetchInterval: 4_000,
  });
}

export function useUpdateImportDecisions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      decisions: { rowNumber: number; decision: "approve" | "skip" }[];
    }) => {
      const res = await apiClientAuth.patch(
        `/leads/import/batches/${vars.id}/decisions`,
        { decisions: vars.decisions },
      );
      return res.data?.data as ImportBatch;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: importBatchKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: importBatchKeys.all });
    },
  });
}

/** R3: classify a peri-urban staged row as urban or rural before approval. */
export function useSetImportRowRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      rowNumber: number;
      region: "urban" | "rural";
    }) => {
      const res = await apiClientAuth.patch(
        `/leads/import/batches/${vars.id}/rows/${vars.rowNumber}/region`,
        { region: vars.region },
      );
      return res.data?.data as ImportBatch;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: importBatchKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: importBatchKeys.all });
    },
  });
}

export function useApproveImportBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClientAuth.post(
        `/leads/import/batches/${id}/approve`,
      );
      return res.data as { message: string; data: ImportBatch };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: importBatchKeys.all });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useRejectImportBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClientAuth.post(
        `/leads/import/batches/${id}/reject`,
      );
      return res.data?.data as ImportBatch;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: importBatchKeys.all });
    },
  });
}
