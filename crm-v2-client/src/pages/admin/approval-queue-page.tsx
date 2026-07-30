import { useMemo, useState } from "react";
import { Link } from "react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  Sparkles,
  UsersRound,
  Undo2,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import PageHeader from "~/components/page-header";
import Container from "~/components/container";
import {
  useAllLeadReversalRequests,
  useApproveLeadReversalRequest,
  useRejectLeadReversalRequest,
} from "~/api/lead-reversal-requests";
import type {
  LeadReversalRequest,
  LeadReversalRequestKind,
  LeadReversalRequestStatus,
} from "~/api/lead-reversal-requests";
import {
  useAssignmentProposals,
  useApproveAssignmentProposal,
  useRejectAssignmentProposal,
  useApproveAssignmentProposalBatch,
  useRunAutoAssign,
  DISTRIBUTION_BATCH_SIZES,
} from "~/api/assignment-proposals";
import type {
  AssignmentProposal,
  DistributionPreviewRow,
} from "~/api/assignment-proposals";
import { ImportApprovalsQueue } from "~/components/admin/import-approvals-queue";
import { useImportBatches } from "~/api/leads/import-batches";

/**
 * Phase C.2 — Manager approval queue.
 *
 * Single screen that aggregates every reversal / reassignment /
 * tactical_disqualify request across the org so managers don't have
 * to dig into each lead to find what needs their attention. Filters
 * by status (default pending) and by kind. Inline approve / reject
 * actions hit the existing `/lead-reversal-requests/:id/approve` and
 * `/reject` endpoints.
 */

const KIND_OPTIONS: { value: LeadReversalRequestKind | "all"; label: string }[] =
  [
    { value: "all", label: "All types" },
    { value: "tactical_disqualify", label: "Soft-reason disqualification" },
    { value: "reassignment", label: "Reassignment" },
    { value: "status_reversal", label: "Reopen / undo status" },
  ];

const KIND_BADGE: Record<LeadReversalRequestKind, { label: string; tone: string; icon: typeof ShieldAlert }> = {
  tactical_disqualify: {
    label: "Soft-reason disqualification",
    tone: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
    icon: ShieldAlert,
  },
  reassignment: {
    label: "Reassignment",
    tone: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900",
    icon: UsersRound,
  },
  status_reversal: {
    label: "Reopen / undo status",
    tone: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900",
    icon: Undo2,
  },
};

/**
 * Returns "2 hours ago" / "3 days ago" / etc — same vibe as the rest of
 * the CRM's relative timestamps. We hand-roll this to avoid pulling in
 * date-fns just for the queue.
 */
function ago(value?: string | null): string {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function fmt(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy h:mm a");
}

function requesterName(r: LeadReversalRequest) {
  if (!r.requested_by) return "—";
  const fn =
    `${r.requested_by.first_name ?? ""} ${r.requested_by.last_name ?? ""}`.trim();
  return fn || r.requested_by.email || "—";
}

function leadSummary(
  r: LeadReversalRequest & {
    lead_summary?: {
      lead_name?: string | null;
      status?: string | null;
      id?: string;
    } | null;
  },
) {
  return r.lead_summary;
}

function RequestRow({
  request,
  onApprove,
  onReject,
  busy,
}: {
  request: LeadReversalRequest;
  onApprove: (r: LeadReversalRequest) => void;
  onReject: (r: LeadReversalRequest) => void;
  busy: boolean;
}) {
  const KindBadge = KIND_BADGE[request.kind] ?? KIND_BADGE.status_reversal;
  const summary = leadSummary(request);
  const isStale =
    request.status === "pending" &&
    !!request.created_at &&
    Date.now() - new Date(request.created_at).getTime() > 48 * 60 * 60 * 1000;
  // Phase C.2 — server enriches reassignment rows with proposed-assignee
  // name; show it inline so the manager sees "→ Grace Mutasa" without
  // clicking into the lead.
  const proposed = request.proposed_assignee_summary;
  return (
    <tr
      className="border-t hover:bg-muted/30"
      data-testid={`approval-row-${request.id}`}
    >
      <td className="p-3 align-top">
        <Badge variant="outline" className={KindBadge.tone}>
          <KindBadge.icon className="mr-1 h-3 w-3" />
          {KindBadge.label}
        </Badge>
      </td>
      <td className="p-3 align-top">
        <Link
          to={`/leads/${request.lead_id}`}
          className="font-medium text-primary hover:underline"
        >
          {summary?.lead_name || request.lead_id.slice(0, 8)}
        </Link>
        {summary?.status && (
          <div className="text-xs text-muted-foreground mt-0.5">
            currently: {summary.status}
          </div>
        )}
        {request.kind === "reassignment" && proposed && (
          <div className="text-xs text-sky-700 dark:text-sky-400 mt-0.5">
            → propose owner: <strong>{proposed.name}</strong>
          </div>
        )}
      </td>
      <td className="p-3 align-top text-sm">{requesterName(request)}</td>
      <td className="p-3 align-top text-sm max-w-[36ch]">
        {/* Full reason on hover (title attr) — line-clamp keeps the row
            scannable but managers can mouse over for the full text. */}
        <div className="line-clamp-3 break-words" title={request.reason}>
          {request.reason}
        </div>
        {request.notes && (
          <div
            className="text-xs text-muted-foreground italic mt-1 line-clamp-2"
            title={request.notes}
          >
            {request.notes}
          </div>
        )}
      </td>
      <td className="p-3 align-top text-xs text-muted-foreground whitespace-nowrap">
        <div>{fmt(request.created_at)}</div>
        {isStale && (
          <Badge
            variant="outline"
            className="mt-1 bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900"
            title="Pending more than 48 hours"
          >
            ⚠ {ago(request.created_at)}
          </Badge>
        )}
      </td>
      <td className="p-3 align-top whitespace-nowrap">
        {request.status === "pending" ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => onApprove(request)}
              disabled={busy}
              data-testid={`approval-approve-${request.id}`}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3 w-3" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReject(request)}
              disabled={busy}
              data-testid={`approval-reject-${request.id}`}
            >
              <XCircle className="mr-1.5 h-3 w-3" />
              Reject
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            <Badge
              variant="outline"
              className={
                request.status === "approved"
                  ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900"
                  : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900"
              }
            >
              {request.status === "approved" ? (
                <CheckCircle2 className="mr-1 h-3 w-3" />
              ) : (
                <XCircle className="mr-1 h-3 w-3" />
              )}
              {request.status}
            </Badge>
            {(request.reviewed_at || request.reviewed_by) && (
              <div className="text-[10px] text-muted-foreground">
                {request.reviewed_by
                  ? `${request.reviewed_by.first_name ?? ""} ${request.reviewed_by.last_name ?? ""}`.trim() ||
                    request.reviewed_by.email ||
                    "—"
                  : "—"}
                {request.reviewed_at && ` · ${ago(request.reviewed_at)}`}
              </div>
            )}
            {request.review_note && (
              <div
                className="text-[10px] italic text-muted-foreground max-w-[20ch] line-clamp-2"
                title={request.review_note}
              >
                "{request.review_note}"
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function QueueTable({
  status,
  kind,
}: {
  status: LeadReversalRequestStatus;
  kind: LeadReversalRequestKind | "all";
}) {
  const { data: requests = [], isLoading, refetch } =
    useAllLeadReversalRequests({
      status,
      kind: kind === "all" ? undefined : kind,
      limit: 200,
    });

  const approve = useApproveLeadReversalRequest();
  const reject = useRejectLeadReversalRequest();

  const handleApprove = (r: LeadReversalRequest) => {
    approve.mutate(
      {
        requestId: r.id,
        data: { decision: "approved" },
      },
      {
        onSuccess: () => {
          toast.success("Request approved");
          refetch();
        },
        onError: (err: any) => {
          toast.error(
            err?.response?.data?.message || "Failed to approve request",
          );
        },
      },
    );
  };

  const handleReject = (r: LeadReversalRequest) => {
    reject.mutate(
      {
        requestId: r.id,
        data: { decision: "rejected" },
      },
      {
        onSuccess: () => {
          toast.success("Request rejected");
          refetch();
        },
        onError: (err: any) => {
          toast.error(
            err?.response?.data?.message || "Failed to reject request",
          );
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    const kindFriendly =
      KIND_OPTIONS.find((o) => o.value === kind)?.label.toLowerCase() ?? "";
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">
        {status === "pending"
          ? "No pending requests right now."
          : `No ${status} ${kind !== "all" ? kindFriendly + " " : ""}requests in this view.`}
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full" data-testid={`approval-queue-${status}-${kind}`}>
        <thead className="bg-muted/50">
          <tr className="text-left text-xs font-medium uppercase tracking-wide">
            <th className="p-3 w-48">Type</th>
            <th className="p-3">Lead</th>
            <th className="p-3 w-44">Requested by</th>
            <th className="p-3">Reason &amp; notes</th>
            <th className="p-3 w-44">Submitted</th>
            <th className="p-3 w-60">
              {status === "pending" ? "Action" : "Decision"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {requests.map((r) => (
            <RequestRow
              key={r.id}
              request={r}
              onApprove={handleApprove}
              onReject={handleReject}
              busy={approve.isPending || reject.isPending}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Select needs string values; null (all leads) maps to "all". */
function batchLabel(n: number | null): string {
  return n === null ? "all" : String(n);
}

function repName(p: AssignmentProposal): string {
  const r = p.proposed_rep;
  if (!r) return p.proposed_rep_id.slice(0, 8);
  return (
    `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.email || "—"
  );
}

/**
 * AUTO1 — the auto-assign engine's suggestions. Nothing is assigned
 * until a manager approves here; the reason column says why each rep
 * was picked (territory match + current load) so this is an informed
 * decision, not a rubber stamp.
 */
function AutoAssignQueue() {
  const { data: pending = [], isLoading, refetch } =
    useAssignmentProposals("pending");
  const approve = useApproveAssignmentProposal();
  const reject = useRejectAssignmentProposal();
  const approveBatch = useApproveAssignmentProposalBatch();
  const runAutoAssign = useRunAutoAssign();
  const [preview, setPreview] = useState<DistributionPreviewRow[] | null>(null);
  const [batchSize, setBatchSize] = useState<number | null>(50);
  const busy =
    approve.isPending || reject.isPending || approveBatch.isPending;

  const runDistribution = (limit: number | null) => {
    runAutoAssign.mutate(limit, {
      onSuccess: (r) => {
        setPreview(r.preview.filter((p) => p.will_gain > 0));
        toast.success(
          r.proposed > 0
            ? `${r.proposed} lead(s) proposed — review and approve below`
            : "Nothing to distribute right now",
        );
        refetch();
      },
      onError: (err: any) =>
        toast.error(err?.response?.data?.message || "Could not run auto-assign"),
    });
  };

  const decide = (p: AssignmentProposal, action: "approve" | "reject") => {
    const m = action === "approve" ? approve : reject;
    m.mutate(p.id, {
      onSuccess: () =>
        toast.success(
          action === "approve"
            ? `Lead assigned to ${repName(p)}`
            : "Suggestion rejected — lead stays unassigned",
        ),
      onError: (err: any) =>
        toast.error(err?.response?.data?.message || "Something went wrong"),
    });
  };

  const approveAll = () => {
    approveBatch.mutate(
      pending.map((p) => p.id),
      {
        onSuccess: (r) => {
          toast.success(
            `${r.approved} assigned${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`,
          );
          refetch();
        },
        onError: (err: any) =>
          toast.error(err?.response?.data?.message || "Batch approve failed"),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  // Run button + the per-person "will gain X" preview — shown whether or
  // not there are pending proposals, so a manager can trigger a run.
  const toolbar = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Distribute</span>
          <Select
            value={batchLabel(batchSize)}
            onValueChange={(v) => setBatchSize(v === "all" ? null : Number(v))}
          >
            <SelectTrigger className="w-28" data-testid="auto-assign-batch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISTRIBUTION_BATCH_SIZES.map((n) => (
                <SelectItem key={batchLabel(n)} value={batchLabel(n)}>
                  {n === null ? "All leads" : `${n} leads`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => runDistribution(batchSize)}
            disabled={runAutoAssign.isPending}
            data-testid="auto-assign-run"
          >
            {runAutoAssign.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            Run auto-assign
          </Button>
        </div>
        {pending.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={approveAll}
            disabled={busy}
            data-testid="auto-assign-approve-all"
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 h-3 w-3" />
            )}
            Approve all {pending.length}
          </Button>
        )}
      </div>
      {preview && preview.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            This run would give:
          </div>
          <div className="flex flex-wrap gap-2">
            {preview.map((p) => (
              <Badge key={p.rep_id} variant="secondary" className="text-xs">
                {p.name} +{p.will_gain}
                <span className="ml-1 text-muted-foreground">
                  ({p.current} → {p.new_total})
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (pending.length === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="p-12 text-center text-sm text-muted-foreground">
          No assignment suggestions waiting. Tap <strong>Run auto-assign</strong>{" "}
          to distribute unworked, unassigned leads by territory and workload —
          the suggestions land here for you to approve. Nothing is assigned to
          anyone until you approve it.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {toolbar}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full" data-testid="auto-assign-queue">
          <thead className="bg-muted/50">
            <tr className="text-left text-xs font-medium uppercase tracking-wide">
              <th className="p-3">Lead</th>
              <th className="p-3 w-44">Suggested rep</th>
              <th className="p-3">Why this rep</th>
              <th className="p-3 w-36">Suggested</th>
              <th className="p-3 w-60">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pending.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="p-3 align-top">
                  <Link
                    to={`/leads/${p.lead_id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {p.lead?.lead_name || p.lead_id.slice(0, 8)}
                  </Link>
                  {p.lead?.school?.name && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {p.lead.school.name}
                      {p.lead.school.province
                        ? ` — ${p.lead.school.province}`
                        : ""}
                    </div>
                  )}
                </td>
                <td className="p-3 align-top text-sm font-medium">
                  {repName(p)}
                </td>
                <td className="p-3 align-top text-sm max-w-[40ch]">
                  <div className="line-clamp-2 break-words" title={p.reason}>
                    {p.reason}
                  </div>
                </td>
                <td className="p-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                  {ago(p.created_at)}
                </td>
                <td className="p-3 align-top whitespace-nowrap">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => decide(p, "approve")}
                      disabled={busy}
                      data-testid={`auto-assign-approve-${p.id}`}
                    >
                      <CheckCircle2 className="mr-1.5 h-3 w-3" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide(p, "reject")}
                      disabled={busy}
                      data-testid={`auto-assign-reject-${p.id}`}
                    >
                      <XCircle className="mr-1.5 h-3 w-3" />
                      Reject
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ApprovalQueuePage() {
  const [kind, setKind] = useState<LeadReversalRequestKind | "all">("all");

  const pendingCountQuery = useAllLeadReversalRequests({
    status: "pending",
    kind: kind === "all" ? undefined : kind,
    limit: 500,
  });
  const pendingCount = useMemo(
    () => pendingCountQuery.data?.length ?? 0,
    [pendingCountQuery.data],
  );
  const autoAssignQuery = useAssignmentProposals("pending");
  const autoAssignCount = autoAssignQuery.data?.length ?? 0;
  const importBatchesQuery = useImportBatches();
  const importCount = importBatchesQuery.data?.length ?? 0;

  return (
    <Container>
      <PageHeader
        title="Approval Queue"
        subtitle={
          pendingCount > 0
            ? `${pendingCount} pending request${pendingCount === 1 ? "" : "s"} awaiting review`
            : "No pending requests"
        }
      />
      <section className="p-4 space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Requests waiting for your decision
              </CardTitle>
              <CardDescription>
                Approve or reject requests from your team. Approving a
                <strong> reassignment</strong> moves the lead to the proposed
                rep automatically. Approving a <strong>soft-reason
                disqualification</strong> lets the rep close the lead with
                their chosen reason. Approving a{" "}
                <strong>reopen / undo status</strong> rolls a converted lead
                back to the requested status and removes its dependent deals.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Type:</span>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as typeof kind)}
              >
                <SelectTrigger
                  className="w-64"
                  data-testid="approval-kind-filter"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="pending" className="space-y-4">
              <TabsList>
                <TabsTrigger value="pending" data-testid="approval-tab-pending">
                  Pending
                  {pendingCount > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {pendingCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="approved" data-testid="approval-tab-approved">
                  Approved
                </TabsTrigger>
                <TabsTrigger value="rejected" data-testid="approval-tab-rejected">
                  Rejected
                </TabsTrigger>
                <TabsTrigger
                  value="auto-assign"
                  data-testid="approval-tab-auto-assign"
                >
                  Auto-assign
                  {autoAssignCount > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {autoAssignCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="imports"
                  data-testid="approval-tab-imports"
                >
                  Import approvals
                  {importCount > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {importCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="pending">
                <QueueTable status="pending" kind={kind} />
              </TabsContent>
              <TabsContent value="approved">
                <QueueTable status="approved" kind={kind} />
              </TabsContent>
              <TabsContent value="rejected">
                <QueueTable status="rejected" kind={kind} />
              </TabsContent>
              <TabsContent value="auto-assign">
                <AutoAssignQueue />
              </TabsContent>
              <TabsContent value="imports">
                <ImportApprovalsQueue />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </Container>
  );
}
