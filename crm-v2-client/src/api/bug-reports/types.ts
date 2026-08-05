export type BugSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "very_critical";

/**
 * Lifecycle states. The original four are kept for historical rows; the
 * Work-Tracker redesign adds backlog/verification/done and the terminal
 * duplicate/cancelled/wont_do.
 */
export type BugStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "closed"
  | "backlog"
  | "verification"
  | "done"
  | "duplicate"
  | "cancelled"
  | "wont_do";

export type WorkType =
  | "bug"
  | "feature"
  | "data_task"
  | "investigation"
  | "task";

export type WorkPriority = "p0" | "p1" | "p2" | "p3" | "backlog";

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
  work_type: WorkType;
  severity: BugSeverity;
  priority: WorkPriority | null;
  status: BugStatus;
  component: string | null;
  labels: string[];
  page_url: string | null;
  reported_by_id: string;
  reported_by?: BugReportUser | null;
  assigned_to_id: string | null;
  assigned_to?: BugReportUser | null;
  duplicate_of_id: string | null;
  resolution_note: string | null;
  /** Set when the ticket entered a solved state; null while open. */
  resolved_at: string | null;
  triaged_at: string | null;
  started_at: string | null;
  verified_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBugReportDto {
  title: string;
  description: string;
  workType?: WorkType;
  severity?: BugSeverity;
  priority?: WorkPriority;
  component?: string;
  labels?: string[];
  pageUrl?: string;
}

export interface UpdateBugReportDto {
  status?: BugStatus;
  workType?: WorkType;
  severity?: BugSeverity;
  priority?: WorkPriority;
  component?: string;
  labels?: string[];
  duplicateOfId?: string | null;
  assignedToId?: string | null;
  resolutionNote?: string;
}

export interface AssignableUser {
  id: string;
  name: string;
  email: string;
}

/** One counts call: tallies by status AND work_type, plus the total. */
export interface BugReportCounts {
  total: number;
  byStatus: Partial<Record<BugStatus, number>>;
  byWorkType: Partial<Record<WorkType, number>>;
}

/** Filters accepted by the list and counts endpoints. */
export interface BugReportFilters {
  status?: BugStatus;
  workType?: WorkType;
  severity?: BugSeverity;
  priority?: WorkPriority;
  component?: string;
  /** A user id, or the literal "unassigned". */
  assignee?: string;
  q?: string;
}

export const SEVERITY_LABELS: Record<BugSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
  very_critical: "Very Critical",
};

export const STATUS_LABELS: Record<BugStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
  backlog: "Backlog",
  verification: "Verification",
  done: "Done",
  duplicate: "Duplicate",
  cancelled: "Cancelled",
  wont_do: "Won't do",
};

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  bug: "Bug",
  feature: "Feature",
  data_task: "Data",
  investigation: "Investigation",
  task: "Task",
};

export const PRIORITY_LABELS: Record<WorkPriority, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
  backlog: "Backlog",
};
