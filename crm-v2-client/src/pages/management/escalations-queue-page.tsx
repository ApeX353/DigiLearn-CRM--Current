import { useMemo, useState } from "react";
import { Link } from "react-router";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/components/ui/tabs";
import {
  useEscalationQueue,
  useResolveLeadEscalation,
  ESCALATION_REASON_LABELS,
  ESCALATION_RESOLUTIONS,
  ESCALATION_RESOLUTION_LABELS,
  type LeadEscalation,
  type EscalationResolution,
} from "~/api/lead-escalations";
import Modal from "~/components/ui/modal";
import { DialogFooter } from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";
import { useAnyRole } from "~/hooks/use-permission";

/**
 * Escalations manager queue (Phase 5).
 *
 * Two tabs — Open / Resolved. Open is the triage list; Resolved is
 * history for audit + coaching review. Admin + sales_manager only.
 */

export default function EscalationsQueuePage() {
  const canAccess = useAnyRole(["admin", "sales_manager"]);

  if (!canAccess) {
    return (
      <div>
        <PageHeader title="Escalations" />
        <Container className="p-4">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              You need manager access to view the escalations queue.
            </CardContent>
          </Card>
        </Container>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Escalations"
        subtitle="Leads flagged by reps for management attention"
      />
      <Container className="p-4">
        <Tabs defaultValue="open" className="w-full">
          <TabsList>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
          </TabsList>
          <TabsContent value="open" className="mt-4">
            <QueueList status="open" />
          </TabsContent>
          <TabsContent value="resolved" className="mt-4">
            <QueueList status="resolved" />
          </TabsContent>
        </Tabs>
      </Container>
    </div>
  );
}

function QueueList({ status }: { status: "open" | "resolved" }) {
  const { data = [], isLoading } = useEscalationQueue(status);
  const [resolveTarget, setResolveTarget] = useState<LeadEscalation | null>(
    null,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          {status === "open"
            ? "No open escalations. Reps are unblocked for now."
            : "No resolved escalations in the window."}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-3">
        {data.map((row) => (
          <EscalationCard
            key={row.id}
            row={row}
            onResolve={() => setResolveTarget(row)}
          />
        ))}
      </div>
      <ResolveDialog
        row={resolveTarget}
        onClose={() => setResolveTarget(null)}
      />
    </>
  );
}

function EscalationCard({
  row,
  onResolve,
}: {
  row: LeadEscalation;
  onResolve: () => void;
}) {
  const escalatedAt = useMemo(
    () =>
      row.created_at
        ? formatDistanceToNow(new Date(row.created_at), { addSuffix: true })
        : "--",
    [row.created_at],
  );

  const resolvedAt = useMemo(
    () =>
      row.resolved_at
        ? formatDistanceToNow(new Date(row.resolved_at), { addSuffix: true })
        : null,
    [row.resolved_at],
  );

  const reasonLabel =
    ESCALATION_REASON_LABELS[row.reason] ?? row.reason.replace(/_/g, " ");
  const resolutionLabel = row.resolution
    ? ESCALATION_RESOLUTION_LABELS[row.resolution] ?? row.resolution
    : null;

  const reporter =
    [row.escalated_by?.first_name, row.escalated_by?.last_name]
      .filter(Boolean)
      .join(" ") || row.escalated_by?.email || "Unknown";
  const resolver =
    [row.resolved_by?.first_name, row.resolved_by?.last_name]
      .filter(Boolean)
      .join(" ") || row.resolved_by?.email || null;

  return (
    <Card
      className={
        row.resolved_at
          ? "border-border/70"
          : "border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/10"
      }
    >
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {row.resolved_at ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              )}
              <span className="truncate">
                {row.lead?.lead_name ?? "(lead removed)"}
              </span>
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {row.lead?.school?.name ?? ""}
              {row.lead?.school?.name && row.lead?.assignee ? " · " : ""}
              {row.lead?.assignee
                ? `Owner: ${row.lead.assignee.first_name ?? ""} ${row.lead.assignee.last_name ?? ""}`.trim()
                : ""}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className={
                row.resolved_at
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400"
                  : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400"
              }
            >
              {row.resolved_at ? "Resolved" : "Open"}
            </Badge>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/leads/${row.lead_id}`}>
                Open lead
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">{reasonLabel}</div>
            {row.blockers && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Blockers: {row.blockers}
              </div>
            )}
            {row.notes && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {row.notes}
              </div>
            )}
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Escalated by <span className="text-foreground">{reporter}</span> ·{" "}
          {escalatedAt}
        </div>

        {row.resolved_at && (
          <div className="rounded-md bg-muted/40 px-2.5 py-2 text-xs space-y-1">
            <div>
              <span className="text-muted-foreground">Resolution:</span>{" "}
              <span className="font-medium">{resolutionLabel}</span>
            </div>
            {row.resolution_notes && (
              <div className="text-muted-foreground">
                {row.resolution_notes}
              </div>
            )}
            <div className="text-muted-foreground">
              by {resolver ?? "—"} · {resolvedAt}
            </div>
          </div>
        )}

        {!row.resolved_at && (
          <div className="pt-1">
            <Button size="sm" onClick={onResolve}>
              Record resolution
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResolveDialog({
  row,
  onClose,
}: {
  row: LeadEscalation | null;
  onClose: () => void;
}) {
  const resolve = useResolveLeadEscalation();
  const [resolution, setResolution] = useState<EscalationResolution | "">("");
  const [note, setNote] = useState("");

  const handleClose = () => {
    setResolution("");
    setNote("");
    onClose();
  };

  const submit = () => {
    if (!row || !resolution) return;
    resolve.mutate(
      {
        id: row.id,
        data: {
          resolution,
          resolution_notes: note.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("Resolution recorded");
          handleClose();
        },
        onError: () => toast.error("Failed to record resolution"),
      },
    );
  };

  return (
    <Modal
      isOpen={!!row}
      onClose={handleClose}
      title="Record resolution"
      description={
        row
          ? `Close escalation on "${row.lead?.lead_name ?? "lead"}" and tell the rep what happens next.`
          : ""
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>
            Resolution <span className="text-destructive">*</span>
          </Label>
          <Select
            value={resolution}
            onValueChange={(v) => setResolution(v as EscalationResolution)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick how this is resolved" />
            </SelectTrigger>
            <SelectContent>
              {ESCALATION_RESOLUTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {ESCALATION_RESOLUTION_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Notes (optional)</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you decide? Share any coaching notes for the rep."
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={resolve.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!resolution || resolve.isPending}
          >
            {resolve.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Record resolution
          </Button>
        </DialogFooter>
      </div>
    </Modal>
  );
}
