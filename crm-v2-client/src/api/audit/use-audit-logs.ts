import { useQuery } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";

export interface AuditLogChange {
  field: string;
  old_value: any;
  new_value: any;
}

export interface AuditLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  user_id: string | null;
  action: "create" | "update" | "delete";
  changes: AuditLogChange[] | null;
  summary: string | null;
  ip_address: string | null;
  created_at: string;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

/**
 * AUD1: the record history now reads from `activity_logs` — the trail
 * the whole app actually writes to (6,700+ rows) — not the parallel
 * `audit_logs` table, which nothing ever wrote and left this tab
 * permanently empty. The server matches the entity name
 * case-insensitively, so "Deal" resolves the deal trail even though
 * deals are logged as "deal".
 */
interface RawActivityLog {
  id: string;
  entity: string;
  entity_id: string;
  action: string;
  summary: string | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  actioned_by: string | null;
  created_at: string;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

function toChanges(
  oldValues: Record<string, any> | null,
  newValues: Record<string, any> | null,
): AuditLogChange[] {
  if (!newValues && !oldValues) return [];
  const fields = new Set<string>([
    ...Object.keys(oldValues ?? {}),
    ...Object.keys(newValues ?? {}),
  ]);
  const changes: AuditLogChange[] = [];
  for (const field of fields) {
    const oldV = oldValues?.[field];
    const newV = newValues?.[field];
    // Only surface fields that actually moved.
    if (JSON.stringify(oldV) === JSON.stringify(newV)) continue;
    changes.push({ field, old_value: oldV ?? null, new_value: newV ?? null });
  }
  return changes;
}

function normalizeAction(action: string): AuditLogEntry["action"] {
  const a = action.toLowerCase();
  if (a === "create" || a === "update" || a === "delete") return a;
  return "update";
}

export function useAuditLogs(entityType: string, entityId: string) {
  return useQuery({
    queryKey: ["audit-logs", "activity", entityType, entityId],
    queryFn: async () => {
      const response = await apiClientAuth.get(
        `/activity-logs/entity/${entityType}/${entityId}`,
      );
      const raw = (response.data?.data ??
        response.data?.items ??
        response.data ??
        []) as RawActivityLog[];
      const items: AuditLogEntry[] = (Array.isArray(raw) ? raw : []).map(
        (r) => ({
          id: r.id,
          entity_type: r.entity,
          entity_id: r.entity_id,
          user_id: r.actioned_by,
          action: normalizeAction(r.action),
          changes: toChanges(r.old_values, r.new_values),
          summary: r.summary ?? null,
          ip_address: null,
          created_at: r.created_at,
          user: r.user,
        }),
      );
      return {
        success: true,
        items,
        meta: {
          totalItems: items.length,
          currentPage: 1,
          totalPages: 1,
        },
      };
    },
    enabled: !!entityType && !!entityId,
  });
}
