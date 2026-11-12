export interface ActivityLog {
  id: string;
  entity: string;
  entity_id: string;
  action: ActivityAction;
  summary?: string;
  actioned_by: string;
  user?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  actioned_by_user?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  created_at: string;
  /** Filled by the server when listing: what the row means, from what it recorded. */
  category?: "financial" | "other";
  title?: string | null;
  reference?: string | null;
  source?: string;
  school_name?: string | null;
  deal_title?: string | null;
}

export const AUDIT_CATEGORIES = ["all", "financial", "other"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_EVENTS = {
  cancelled: "Cancelled",
  status_changed: "Status changed",
  reassigned: "Reassigned",
  payment_recorded: "Payment recorded",
  deal_value_changed: "Deal value changed",
} as const;
export type AuditEvent = keyof typeof AUDIT_EVENTS;

export interface AuditCategoryCounts {
  all: number;
  financial: number;
  other: number;
}

export interface AuditActor {
  id: string;
  name: string;
}

export const ACTIVITY_ACTIONS = [
  "create",
  "update",
  "delete",
  "view",
  "restore",
  "bulk_create",
  "bulk_update",
  "bulk_delete",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface ActivityLogParams {
  page?: number;
  limit?: number;
  entity?: string;
  entity_id?: string;
  action?: ActivityAction;
  actioned_by?: string;
  start_date?: string;
  end_date?: string;
  category?: AuditCategory;
  event?: AuditEvent;
  record?: string;
}
