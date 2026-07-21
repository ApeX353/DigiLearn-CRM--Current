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
  ip_address: string | null;
  created_at: string;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

export function useAuditLogs(entityType: string, entityId: string) {
  return useQuery({
    queryKey: ["audit-logs", entityType, entityId],
    queryFn: async () => {
      const response = await apiClientAuth.get(
        `/audit-logs/entity/${entityType}/${entityId}`
      );
      return response.data as {
        success: boolean;
        items: AuditLogEntry[];
        meta: { totalItems: number; currentPage: number; totalPages: number };
      };
    },
    enabled: !!entityType && !!entityId,
  });
}
