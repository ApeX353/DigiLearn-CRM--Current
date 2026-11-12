import { useState } from "react";
import { useSearchParams } from "react-router";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { useAnyRole } from "~/hooks/use-permission";
import {
  useActivityLogs,
  useAuditActors,
  useAuditCategoryCounts,
} from "~/api/activity-logs/use-activity-logs";
import {
  ACTIVITY_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_EVENTS,
  type ActivityAction,
  type ActivityLog,
  type ActivityLogParams,
  type AuditCategory,
  type AuditEvent,
} from "~/api/activity-logs/types";
import {
  auditEnvironmentNote,
  auditSourceLabel,
  entityName,
  harareDayBound,
  harareTime,
  readableAuditChanges,
  recordLabel,
} from "~/lib/audit-presentation";

const PAGE_SIZE = 25;
const ANY = "__any__";

/**
 * The audit trail, readable at last.
 *
 * Every change has been recorded for months in `activity_logs` — who acted, what
 * changed from what to what, and which record it belonged to — and none of it was
 * ever displayed. The only way to read a decision was to query the API. A reversal
 * would record "Kept: 1 deal, 1 quote, invoice INV-2026-0084 (57600.00)" and then
 * show it to nobody.
 *
 * Two deliberate choices here:
 *
 *  - the old/new values are rendered, not just `summary`. The summary line is
 *    truncated at the point of writing (60 characters on a reversal note), so the
 *    substance only survives in the value diff. A view that shows the headline and
 *    hides the detail would repeat the original problem.
 *  - admin and admin_support read the whole system, which is a different thing
 *    from seeing history on a lead you own. A sales manager reads the CRM and
 *    financial records that role works with; the API enforces that, not this page.
 */
const actorName = (log: ActivityLog) => {
  const u = log.actioned_by_user || log.user;
  if (!u) return log.actioned_by || "Unknown";
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return full || u.email || log.actioned_by;
};

const actionTone = (action: string) => {
  if (action.includes("delete")) return "destructive" as const;
  if (action.includes("create")) return "default" as const;
  return "secondary" as const;
};

/** Renders the recorded changes without exposing payload or database internals. */
function ValueDiff({ log }: { log: ActivityLog }) {
  const rows = readableAuditChanges(
    log.entity,
    log.old_values,
    log.new_values,
    log.action,
  );

  if (!rows.length) return null;

  return (
    <div className="mt-2 space-y-1">
      {rows.map((r) => (
        <div key={r.field} className="grid grid-cols-[10rem_1fr] gap-2 text-xs">
          <span className="text-muted-foreground">{r.field}</span>
          <span>
            {r.from === r.to ? (
              <span className="font-medium">Changed</span>
            ) : (
              <>
                <span className="text-muted-foreground line-through">{r.from}</span>
                <span className="mx-1">&rarr;</span>
                <span className="font-medium">{r.to}</span>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AuditLogPage() {
  const allowed = useAnyRole(["admin", "admin_support", "sales_manager"]);

  const [page, setPage] = useState(1);
  const [params] = useSearchParams();
  const linkedCategory = params.get("category");
  const [category, setCategory] = useState<AuditCategory>(
    AUDIT_CATEGORIES.includes(linkedCategory as AuditCategory)
      ? (linkedCategory as AuditCategory)
      : "all",
  );
  const [entity, setEntity] = useState("");
  const [record, setRecord] = useState(params.get("record") ?? "");
  const [action, setAction] = useState<ActivityAction | "">("");
  const [event, setEvent] = useState<AuditEvent | "">("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const changed = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  const filters: ActivityLogParams = {
    ...(entity.trim() ? { entity: entity.trim() } : {}),
    ...(record.trim() ? { record: record.trim() } : {}),
    ...(action ? { action } : {}),
    ...(event ? { event } : {}),
    ...(actor ? { actioned_by: actor } : {}),
    ...(from ? { start_date: harareDayBound(from, "start") } : {}),
    ...(to ? { end_date: harareDayBound(to, "end") } : {}),
  };

  const { data, isLoading, isError } = useActivityLogs({
    page,
    limit: PAGE_SIZE,
    category,
    ...filters,
  });
  const { data: counts } = useAuditCategoryCounts(filters);
  const { data: actors } = useAuditActors();

  if (!allowed) {
    return (
      <Container>
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertTitle>Not available</AlertTitle>
          <AlertDescription>
            The audit trail is limited to admin, support and sales manager
            accounts.
          </AlertDescription>
        </Alert>
      </Container>
    );
  }

  const logs = (data?.data as ActivityLog[] | undefined) || [];
  const environmentNote = auditEnvironmentNote(data?.environment);
  const total = data?.meta?.totalItems ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tab = (value: AuditCategory, label: string) => (
    <TabsTrigger value={value}>
      {label}
      {counts ? ` (${counts[value].toLocaleString()})` : ""}
    </TabsTrigger>
  );

  return (
    <Container>
      <PageHeader
        title="Audit trail"
        subtitle="Who did what, to which record, and what changed. Times are Africa/Harare."
      />

      <section className="space-y-4 p-4">
        <Tabs
          value={category}
          onValueChange={(value) => changed(setCategory)(value as AuditCategory)}
        >
          <TabsList>
            {tab("all", "All Activity")}
            {tab("financial", "Financial Activity")}
            {tab("other", "Other Activity")}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Record reference or ID (INV-2026-0105…)"
            className="max-w-xs"
            value={record}
            onChange={(e) => changed(setRecord)(e.target.value)}
          />
          <Input
            placeholder="Record type (Lead, Deal, Invoice…)"
            className="max-w-48"
            value={entity}
            onChange={(e) => changed(setEntity)(e.target.value)}
          />
          <Select
            value={event || ANY}
            onValueChange={(v) => changed(setEvent)(v === ANY ? "" : (v as AuditEvent))}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Any event" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any event</SelectItem>
              {(Object.keys(AUDIT_EVENTS) as AuditEvent[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {AUDIT_EVENTS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={action || ANY}
            onValueChange={(v) => changed(setAction)(v === ANY ? "" : (v as ActivityAction))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Any action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any action</SelectItem>
              {ACTIVITY_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={actor || ANY}
            onValueChange={(v) => changed(setActor)(v === ANY ? "" : v)}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Anyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Anyone</SelectItem>
              {(actors ?? []).map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            aria-label="From date"
            className="w-40"
            value={from}
            onChange={(e) => changed(setFrom)(e.target.value)}
          />
          <Input
            type="date"
            aria-label="To date"
            className="w-40"
            value={to}
            onChange={(e) => changed(setTo)(e.target.value)}
          />
          <span className="text-muted-foreground text-sm">
            {isLoading
              ? "Loading…"
              : `${total.toLocaleString()} ${total === 1 ? "entry" : "entries"}`}
          </span>
        </div>

        {environmentNote && (
          <Alert>
            <AlertTitle>Not production history</AlertTitle>
            <AlertDescription>{environmentNote}</AlertDescription>
          </Alert>
        )}

        {isError && (
          <Alert variant="destructive">
            <AlertTitle>Could not load the audit trail</AlertTitle>
            <AlertDescription>
              The server refused or is unavailable. Try again shortly.
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && !logs.length && !isError && (
          <p className="text-muted-foreground text-sm">
            Nothing recorded for this filter.
          </p>
        )}

        <div className="space-y-2">
          {logs.map((log) => {
            const label =
              log.reference ?? recordLabel(log.entity, log.old_values, log.new_values);
            return (
              <Card key={log.id}>
                <CardContent className="space-y-1 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={actionTone(log.action)}>
                      {String(log.action).replace(/_/g, " ")}
                    </Badge>
                    {log.category === "financial" && (
                      <Badge variant="outline">Financial</Badge>
                    )}
                    <span className="text-sm font-medium">
                      {log.title ?? `Change to ${entityName(log.entity)}`}
                    </span>
                    {label && <span className="text-sm font-medium">{label}</span>}
                    <span className="text-muted-foreground ml-auto text-xs">
                      {harareTime(log.created_at)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    By {actorName(log)}
                    {log.source ? ` · ${auditSourceLabel(log.source)}` : ""}
                    {log.school_name ? ` · ${log.school_name}` : ""}
                    {log.deal_title ? ` · ${log.deal_title}` : ""}
                  </p>
                  {log.summary && log.summary !== log.title && (
                    <p className="text-sm">{log.summary}</p>
                  )}
                  <ValueDiff log={log} />
                </CardContent>
              </Card>
            );
          })}
        </div>

        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-muted-foreground text-sm">
              Page {page} of {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </section>
    </Container>
  );
}
