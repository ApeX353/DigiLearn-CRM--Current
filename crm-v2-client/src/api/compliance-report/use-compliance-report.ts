import { useQuery } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";

export interface ComplianceReportRepRow {
  user_id: string;
  name: string;
  email: string | null;
  contacts: number;
  completed: number;
  with_outcome: number;
  outcome_pct: number;
  next_step_compliant: number;
  next_step_pct: number;
  overdue: number;
  stale_leads: number;
  passes_outcome: boolean;
  passes_next_step: boolean;
}

export interface ComplianceReportResponse {
  window: { start: string; end: string; range: string };
  thresholds: {
    outcome_target_pct: number;
    next_step_target_pct: number;
    daily_contacts_per_rep: number;
    stale_lead_days: number;
    stale_deal_days: number;
  };
  totals: {
    completed: number;
    with_outcome: number;
    outcome_pct: number;
    next_step_compliant: number;
    next_step_pct: number;
    overdue: number;
    stale_leads: number;
    pending_approvals: {
      tactical_disqualify: number;
      reassignment: number;
      status_reversal: number;
    };
  };
  reps: ComplianceReportRepRow[];
}

const api = {
  get: (params: { dateRange?: string }): Promise<ComplianceReportResponse> =>
    apiClientAuth
      .get(`/dashboard/compliance-report`, { params })
      .then((r) => r.data?.data ?? r.data),
};

export function useComplianceReport(opts?: { dateRange?: string }) {
  const dateRange = opts?.dateRange ?? "mtd";
  return useQuery({
    queryKey: ["compliance-report", dateRange] as const,
    queryFn: () => api.get({ dateRange }),
    staleTime: 60 * 1000,
  });
}
