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
  });
}

export function useApproveAssignmentProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClientAuth.patch(
        `/automation/assignment-proposals/${id}/approve`,
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
