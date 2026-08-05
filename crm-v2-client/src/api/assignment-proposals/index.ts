import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";

/**
 * AUTO1: the auto-assign engine proposes, a manager approves. These
 * hooks back the "Auto-assign" tab of the manager Approval Queue.
 */

export type AssignmentProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "superseded";

export interface AssignmentProposal {
  id: string;
  lead_id: string;
  proposed_rep_id: string;
  reason: string;
  status: AssignmentProposalStatus;
  decided_at: string | null;
  created_at: string;
  lead?: {
    id: string;
    lead_name?: string | null;
    status?: string | null;
    school?: { id: string; name?: string | null; province?: string | null } | null;
  } | null;
  proposed_rep?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
  decided_by?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
}

export const assignmentProposalsKeys = {
  all: ["assignment-proposals"] as const,
  list: (status: AssignmentProposalStatus) =>
    [...assignmentProposalsKeys.all, "list", status] as const,
  projection: () => [...assignmentProposalsKeys.all, "projection"] as const,
};

export function useAssignmentProposals(status: AssignmentProposalStatus) {
  return useQuery({
    queryKey: assignmentProposalsKeys.list(status),
    queryFn: async (): Promise<AssignmentProposal[]> => {
      const res = await apiClientAuth.get(
        `/automation/assignment-proposals?status=${status}`,
      );
      const data = res.data?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    // Auto-refresh so proposals appear in the queue as a run finishes,
    // without the manager having to reload the page.
    refetchInterval: status === "pending" ? 8000 : false,
  });
}

export function useApproveAssignmentProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    // repId set = redirect the lead to a manager-chosen rep instead of the
    // engine's suggestion (TEST-BACKLOG #5).
    mutationFn: async (vars: string | { id: string; repId?: string }) => {
      const { id, repId } =
        typeof vars === "string" ? { id: vars, repId: undefined } : vars;
      const res = await apiClientAuth.patch(
        `/automation/assignment-proposals/${id}/approve`,
        repId ? { rep_id: repId } : undefined,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentProposalsKeys.all });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useRejectAssignmentProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClientAuth.patch(
        `/automation/assignment-proposals/${id}/reject`,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentProposalsKeys.all });
    },
  });
}

/** R2 — one row of the per-rep current→projected strip. */
export interface AssignmentProjectionRow {
  rep_id: string;
  name: string;
  current: number;
  pending: number;
  projected: number;
}

/**
 * R2 — per-rep current vs projected load for the pending proposals. Powers
 * the persistent strip above the auto-assign queue. Auto-refreshes like the
 * pending list so it tracks a run landing.
 */
export function useAssignmentProjection() {
  return useQuery({
    queryKey: assignmentProposalsKeys.projection(),
    queryFn: async (): Promise<AssignmentProjectionRow[]> => {
      const res = await apiClientAuth.get(
        `/automation/assignment-proposals/projection`,
      );
      const data = res.data?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 8000,
  });
}

/** R4/R8 — reject a batch of selected proposals in one call. */
export function useRejectAssignmentProposalBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      ids: string[],
    ): Promise<{ rejected: number; skipped: Array<{ id: string; why: string }> }> => {
      const res = await apiClientAuth.post(
        `/automation/assignment-proposals/reject-batch`,
        { ids },
      );
      return res.data?.data ?? res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentProposalsKeys.all });
    },
  });
}

/**
 * R5 — redirect a REJECTED suggestion to a chosen rep/manager. Turns the
 * reject into an approval and assigns the lead.
 */
export function useRedirectRejectedProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; repId: string }) => {
      const res = await apiClientAuth.post(
        `/automation/assignment-proposals/${vars.id}/redirect`,
        { rep_id: vars.repId },
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentProposalsKeys.all });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

/**
 * R5 — send a rejected suggestion's lead back to the New Leads pool
 * (unassign + reset status to New + re-run duplicate detection server-side).
 */
export function useSendProposalToNewLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClientAuth.post(
        `/automation/assignment-proposals/${id}/to-new-leads`,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentProposalsKeys.all });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export interface DistributionPreviewRow {
  rep_id: string;
  name: string;
  cohort: "rep" | "manager";
  current: number;
  will_gain: number;
  new_total: number;
}

export interface DistributionResult {
  proposed: number;
  skipped: number;
  preview: DistributionPreviewRow[];
}

/** Batch sizes the manager can distribute at once; null = all leads. */
export const DISTRIBUTION_BATCH_SIZES: Array<number | null> = [
  50,
  100,
  250,
  500,
  null,
];

/**
 * The "Run auto-assign" button — proposes only, returns the preview.
 * `limit` is the chosen batch size; null = distribute all eligible leads.
 */
export function useRunAutoAssign() {
  const queryClient = useQueryClient();
  return useMutation({
    // `limit` = batch size (null = all). `campaignId` scopes the run to a
    // single import campaign's leads (Kim's flow) — omitted = whole pool.
    mutationFn: async (
      vars: { limit?: number | null; campaignId?: string | null } = {},
    ): Promise<DistributionResult> => {
      const { limit = null, campaignId = null } = vars;
      const params = new URLSearchParams();
      params.set("limit", limit === null ? "all" : String(limit));
      if (campaignId) params.set("campaign_id", campaignId);
      const res = await apiClientAuth.post(
        `/automation/assignment-proposals/run?${params.toString()}`,
      );
      return res.data?.data ?? res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentProposalsKeys.all });
    },
  });
}

export interface RebalanceSide {
  id: string;
  name: string;
  before: number;
  after: number;
}

export interface RebalanceResult {
  preview: boolean;
  moved: number;
  from: RebalanceSide;
  to: RebalanceSide;
  lead_ids: string[];
  note?: string;
}

export interface RebalanceInput {
  from_rep_id: string;
  to_rep_id: string;
  /** null/omitted = auto-even the two to the middle. */
  count?: number | null;
  /** true = "will move X" figures without writing. */
  preview?: boolean;
}

/**
 * Rebalance — a manager moves a batch of leads from one rep to another to
 * even out load. Cross-territory is allowed (a deliberate hand move). Call
 * with preview:true first to show the "will move X" figures, then again
 * without it to commit.
 */
export function useRebalanceLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RebalanceInput): Promise<RebalanceResult> => {
      const res = await apiClientAuth.post(`/automation/rebalance`, input);
      return res.data?.data ?? res.data;
    },
    onSuccess: (data) => {
      // Only a committed move (not a preview) changes ownership.
      if (!data?.preview) {
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        queryClient.invalidateQueries({ queryKey: assignmentProposalsKeys.all });
      }
    },
  });
}

export function useApproveAssignmentProposalBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      ids: string[],
    ): Promise<{ approved: number; skipped: Array<{ id: string; why: string }> }> => {
      const res = await apiClientAuth.post(
        `/automation/assignment-proposals/approve-batch`,
        { ids },
      );
      return res.data?.data ?? res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentProposalsKeys.all });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

/**
 * Undo — reverse approvals a manager just made. Unassigns the lead(s),
 * clears the first-touch SLA the approval started, and returns the
 * proposal(s) to PENDING (they reappear in the queue). Leads a rep has
 * already worked, or that were reassigned by hand, are kept (skipped).
 */
export function useUndoAssignmentApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      ids: string[],
    ): Promise<{ undone: number; skipped: Array<{ id: string; why: string }> }> => {
      const res = await apiClientAuth.post(
        `/automation/assignment-proposals/undo`,
        { ids },
      );
      return res.data?.data ?? res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentProposalsKeys.all });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
