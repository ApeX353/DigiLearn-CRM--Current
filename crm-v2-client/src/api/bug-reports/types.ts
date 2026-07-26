export type BugSeverity = "low" | "medium" | "high" | "critical";
export type BugStatus = "open" | "in_progress" | "resolved" | "closed";

export interface BugReportUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface BugReport {
  id: string;
  title: string;
  description: string;
  severity: BugSeverity;
  status: BugStatus;
  page_url: string | null;
  reported_by_id: string;
  reported_by?: BugReportUser | null;
  assigned_to_id: string | null;
  assigned_to?: BugReportUser | null;
  resolution_note: string | null;
  /** Set when the ticket entered resolved/closed; null while open. */
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBugReportDto {
  title: string;
  description: string;
  severity?: BugSeverity;
  pageUrl?: string;
}

export interface UpdateBugReportDto {
  status?: BugStatus;
  severity?: BugSeverity;
  assignedToId?: string | null;
  resolutionNote?: string;
}

export interface AssignableUser {
  id: string;
  name: string;
  email: string;
}

export const SEVERITY_LABELS: Record<BugSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const STATUS_LABELS: Record<BugStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};
