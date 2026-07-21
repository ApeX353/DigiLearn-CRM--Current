export interface ActivityLog {
  id: string;
  entity: string;
  entity_id: string;
  action: ActivityAction;
  actioned_by: string;
  actioned_by_user?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  details?: Record<string, unknown>;
  created_at: string;
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
}
