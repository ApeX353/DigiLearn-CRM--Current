import { useAuditLogs, type AuditLogEntry } from "~/api/audit/use-audit-logs";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AuditTimelineProps {
  entityType: string;
  entityId: string;
}

function getActionIcon(action: string) {
  switch (action) {
    case "create":
      return <Plus className="h-3 w-3" />;
    case "update":
      return <Pencil className="h-3 w-3" />;
    case "delete":
      return <Trash2 className="h-3 w-3" />;
    default:
      return <Pencil className="h-3 w-3" />;
  }
}

function getActionColor(action: string) {
  switch (action) {
    case "create":
      return "bg-green-100 text-green-700";
    case "update":
      return "bg-blue-100 text-blue-700";
    case "delete":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function AuditEntry({ entry }: { entry: AuditLogEntry }) {
  const userName = entry.user
    ? `${entry.user.first_name} ${entry.user.last_name}`
    : "System";
  const initials = entry.user
    ? `${entry.user.first_name[0]}${entry.user.last_name[0]}`
    : "SY";

  return (
    <div className="flex gap-3 pb-4 last:pb-0">
      <div className="flex flex-col items-center">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="w-px flex-1 bg-border mt-2" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{userName}</span>
          <Badge
            variant="secondary"
            className={`text-[10px] px-1.5 py-0 ${getActionColor(entry.action)}`}
          >
            {getActionIcon(entry.action)}
            <span className="ml-1 capitalize">{entry.action}</span>
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(entry.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>

        {/* When we have no field-level diff (creates, deletes, or logs
            that only carried a summary), show the human-readable line so
            the entry still says what happened. */}
        {(!entry.changes || entry.changes.length === 0) && entry.summary && (
          <div className="text-xs text-muted-foreground">{entry.summary}</div>
        )}

        {entry.changes && entry.changes.length > 0 && (
          <div className="space-y-1">
            {entry.changes.map((change, i) => (
              <div key={i} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground capitalize">
                  {change.field.replace(/_/g, " ")}
                </span>
                :{" "}
                {entry.action === "create" ? (
                  <span className="text-green-600">
                    {formatValue(change.new_value)}
                  </span>
                ) : (
                  <>
                    <span className="line-through text-red-500">
                      {formatValue(change.old_value)}
                    </span>
                    {" → "}
                    <span className="text-green-600">
                      {formatValue(change.new_value)}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AuditTimeline({ entityType, entityId }: AuditTimelineProps) {
  const { data, isLoading } = useAuditLogs(entityType, entityId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const logs = data?.items || [];

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No audit history available
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {logs.map((entry) => (
        <AuditEntry key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
