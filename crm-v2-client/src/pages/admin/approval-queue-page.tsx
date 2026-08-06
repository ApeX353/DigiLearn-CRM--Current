import { useMemo, useState } from "react";
import { Link } from "react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowRightLeft,
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
  useRejectAssignmentProposalBatch,
  useAssignmentProjection,
  useRedirectRejectedProposal,
  useSendProposalToNewLeads,
  useRunAutoAssign,
  useRebalanceLeads,
  useUndoAssignmentApproval,
  DISTRIBUTION_BATCH_SIZES,
} from "~/api/assignment-proposals";
import { useCampaigns } from "~/api/campaigns";
import type {
  AssignmentProposal,
  DistributionPreviewRow,
  RebalanceResult,
} from "~/api/assignment-proposals";
import { ImportApprovalsQueue } from "~/components/admin/import-approvals-queue";
import { useImportBatches } from "~/api/leads/import-batches";
import { useStaff } from "~/api/users";
import { RequestEnquiry } from "~/components/admin/request-enquiry";

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
          <div className="space-y-1">
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
            <RequestEnquiry request={request} />
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

type SalesTeamRep = {
  id: string;
  first_name?: string;
  last_name?: string;
  roles?: { name: string }[];
  territory_provinces?: string | null;
};

/**
 * Valid redirect / rebalance targets = the sales team: managers (Kim, Busi)
 * + reps who actually carry a territory (Manake, Tanya). Excludes seed
 * sales_reps with no territory so the picker isn't cluttered with non-team
 * accounts. Shared by the pending queue, the rebalance panel and the rejected
 * list so they always offer the same people.
 */
function useSalesTeamReps(): SalesTeamRep[] {
  const staffQuery = useStaff({ status: "active", page: 1, limit: 100 });
  const allStaff: SalesTeamRep[] =
    (staffQuery.data as any)?.data ??
    (staffQuery.data as any)?.items ??
    (Array.isArray(staffQuery.data) ? staffQuery.data : []);
  return allStaff.filter((u) => {
    const names = (u.roles ?? []).map((r) => r.name);
    return (
      names.includes("sales_manager") ||
      (names.includes("sales_rep") && !!u.territory_provinces)
    );
  });
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
  const { data: projection = [] } = useAssignmentProjection();
  const approve = useApproveAssignmentProposal();
  const reject = useRejectAssignmentProposal();
  const approveBatch = useApproveAssignmentProposalBatch();
  const rejectBatch = useRejectAssignmentProposalBatch();
  const runAutoAssign = useRunAutoAssign();
  const rebalance = useRebalanceLeads();
  const [preview, setPreview] = useState<DistributionPreviewRow[] | null>(null);
  const [batchSize, setBatchSize] = useState<number | null>(50);
  const [repFilter, setRepFilter] = useState<string | null>(null);
  // R4/R8 — bulk multi-select on the pending list.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // R-UX: live fill for "Approve all" — {done,total} while a run is in flight.
  const [approveProgress, setApproveProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  // Rebalance panel state.
  const [rbFrom, setRbFrom] = useState<string>("");
  const [rbTo, setRbTo] = useState<string>("");
  const [rbCount, setRbCount] = useState<string>("");
  const [rbResult, setRbResult] = useState<RebalanceResult | null>(null);
  // REBAL-SCOPE: the import whose leads the balancer may move. Required — the
  // balancer must only touch import leads, never a rep's existing book.
  const [rbCampaign, setRbCampaign] = useState<string>("");
  const { data: rbCampaigns } = useCampaigns();
  const reps = useSalesTeamReps();
  const busy =
    approve.isPending ||
    reject.isPending ||
    approveBatch.isPending ||
    rejectBatch.isPending;

  const runDistribution = (limit: number | null) => {
    runAutoAssign.mutate({ limit }, {
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
      onSuccess: () => {
        if (action === "approve") {
          // Undo now lives in the Approved-tab workflow (AutoAssignApprovedList).
          toast.success(`Lead assigned to ${repName(p)}`);
        } else {
          toast.success("Suggestion rejected — lead stays unassigned");
        }
      },
      onError: (err: any) =>
        toast.error(err?.response?.data?.message || "Something went wrong"),
    });
  };

  // Approve every pending proposal in small chunks so the progress bar fills
  // as each batch lands (better feedback than a lone spinner for hundreds).
  const approveAll = async () => {
    const ids = pending.map((p) => p.id);
    if (ids.length === 0) return;
    const CHUNK = 20;
    let approved = 0;
    let skipped = 0;
    setApproveProgress({ done: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const r = await approveBatch.mutateAsync(ids.slice(i, i + CHUNK));
        approved += r.approved;
        skipped += r.skipped.length;
        setApproveProgress({
          done: Math.min(i + CHUNK, ids.length),
          total: ids.length,
        });
      }
      toast.success(
        `${approved} assigned${skipped ? `, ${skipped} skipped` : ""}`,
      );
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Batch approve failed");
    } finally {
      setApproveProgress(null);
    }
  };

  const redirect = (p: AssignmentProposal, repId: string) => {
    if (!repId || repId === p.proposed_rep_id) return;
    approve.mutate(
      { id: p.id, repId },
      {
        onSuccess: () => toast.success("Lead redirected and assigned"),
        onError: (err: any) =>
          toast.error(err?.response?.data?.message || "Could not redirect"),
      },
    );
  };

  // R4/R8 — bulk multi-select helpers.
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = (checked: boolean, rows: AssignmentProposal[]) => {
    setSelected(checked ? new Set(rows.map((p) => p.id)) : new Set());
  };

  const approveSelected = () => {
    const ids = [...selected];
    approveBatch.mutate(ids, {
      onSuccess: (r) => {
        toast.success(
          `${r.approved} assigned${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`,
        );
        setSelected(new Set());
        refetch();
      },
      onError: (err: any) =>
        toast.error(err?.response?.data?.message || "Batch approve failed"),
    });
  };

  const rejectSelected = () => {
    rejectBatch.mutate([...selected], {
      onSuccess: (r) => {
        toast.success(
          `${r.rejected} rejected${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`,
        );
        setSelected(new Set());
        refetch();
      },
      onError: (err: any) =>
        toast.error(err?.response?.data?.message || "Batch reject failed"),
    });
  };

  const runRebalance = (isPreview: boolean) => {
    if (!rbFrom || !rbTo || rbFrom === rbTo) {
      toast.error("Pick two different reps to move leads between");
      return;
    }
    if (!rbCampaign) {
      toast.error(
        "Pick which import to balance — the balancer only moves that import's leads",
      );
      return;
    }
    const n = rbCount.trim() === "" ? null : Number(rbCount);
    rebalance.mutate(
      {
        from_rep_id: rbFrom,
        to_rep_id: rbTo,
        count: n && n > 0 ? Math.floor(n) : null,
        campaign_id: rbCampaign,
        preview: isPreview,
      },
      {
        onSuccess: (r) => {
          setRbResult(r);
          if (r.preview) {
            toast.info(
              r.moved > 0
                ? `Would move ${r.moved} lead(s)`
                : r.note || "Nothing to move",
            );
          } else {
            toast.success(
              r.moved > 0
                ? `Moved ${r.moved} lead(s): ${r.from.name} → ${r.to.name}`
                : r.note || "Nothing to move",
            );
            refetch();
          }
        },
        onError: (err: any) =>
          toast.error(err?.response?.data?.message || "Rebalance failed"),
      },
    );
  };

  // Rep tiles (#6): how many pending proposals sit with each proposed rep.
  const perRep = new Map<string, { name: string; count: number }>();
  for (const p of pending) {
    const cur = perRep.get(p.proposed_rep_id) ?? { name: repName(p), count: 0 };
    cur.count += 1;
    perRep.set(p.proposed_rep_id, cur);
  }
  const filteredPending = repFilter
    ? pending.filter((p) => p.proposed_rep_id === repFilter)
    : pending;

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
      {/* R2 — persistent current→projected strip. Shows, per rep with a
          pending suggestion, their current open load and where it lands if
          every pending suggestion is approved. Sorted by projected desc. */}
      {projection.length > 0 && (
        <div
          className="rounded-lg border bg-muted/20 p-3"
          data-testid="auto-assign-projection"
        >
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Projected load if every pending suggestion is approved
          </div>
          <div className="flex flex-wrap gap-2">
            {projection.map((row) => (
              <Badge
                key={row.rep_id}
                variant="secondary"
                className="text-xs"
                data-testid={`projection-${row.rep_id}`}
              >
                {row.name} <span className="font-semibold">{row.projected}</span>
                <span className="ml-1 text-muted-foreground">
                  ({row.current} → +{row.pending})
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}
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
        {approveProgress && (
          <div className="w-full max-w-xs" data-testid="approve-all-progress">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{
                  width: `${Math.round(
                    (approveProgress.done / approveProgress.total) * 100,
                  )}%`,
                }}
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              Approving {approveProgress.done} / {approveProgress.total}…
            </div>
          </div>
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
      {/* Rebalance — move a batch of leads between two reps to even out load.
          Cross-territory allowed (a deliberate hand move). Preview first,
          then commit. */}
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <ArrowRightLeft className="h-4 w-4" />
          Rebalance load
          <span className="text-xs font-normal text-muted-foreground">
            move a batch of <strong>the selected import's</strong> leads between
            two reps (cross-territory allowed, existing books untouched) — keeps
            the 50-lead fairness gap, unworked leads move first
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              Balance which import
            </label>
            <select
              className="h-9 w-48 rounded-md border border-input bg-transparent px-2 text-sm"
              value={rbCampaign}
              onChange={(e) => {
                setRbCampaign(e.target.value);
                setRbResult(null);
              }}
              data-testid="rebalance-campaign"
            >
              <option value="">Select import…</option>
              {(rbCampaigns ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">From</label>
            <select
              className="h-9 w-40 rounded-md border border-input bg-transparent px-2 text-sm"
              value={rbFrom}
              onChange={(e) => {
                setRbFrom(e.target.value);
                setRbResult(null);
              }}
              data-testid="rebalance-from"
            >
              <option value="">Select rep…</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {[r.first_name, r.last_name].filter(Boolean).join(" ") ||
                    "rep"}
                </option>
              ))}
            </select>
          </div>
          <ArrowRightLeft className="mb-2 h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">To</label>
            <select
              className="h-9 w-40 rounded-md border border-input bg-transparent px-2 text-sm"
              value={rbTo}
              onChange={(e) => {
                setRbTo(e.target.value);
                setRbResult(null);
              }}
              data-testid="rebalance-to"
            >
              <option value="">Select rep…</option>
              {reps
                .filter((r) => r.id !== rbFrom)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {[r.first_name, r.last_name].filter(Boolean).join(" ") ||
                      "rep"}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">How many</label>
            <input
              type="number"
              min={1}
              placeholder="auto"
              className="h-9 w-24 rounded-md border border-input bg-transparent px-2 text-sm"
              value={rbCount}
              onChange={(e) => {
                setRbCount(e.target.value);
                setRbResult(null);
              }}
              data-testid="rebalance-count"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runRebalance(true)}
            disabled={rebalance.isPending || !rbFrom || !rbTo || !rbCampaign}
            data-testid="rebalance-preview"
          >
            {rebalance.isPending && (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            )}
            Preview
          </Button>
          <Button
            size="sm"
            onClick={() => runRebalance(false)}
            disabled={
              rebalance.isPending ||
              !rbResult ||
              rbResult.preview !== true ||
              rbResult.moved === 0
            }
            data-testid="rebalance-move"
          >
            <ArrowRightLeft className="mr-1.5 h-3 w-3" />
            Move
            {rbResult && rbResult.preview && rbResult.moved > 0
              ? ` ${rbResult.moved}`
              : ""}
          </Button>
        </div>
        {rbResult && (
          <div className="text-xs text-muted-foreground" data-testid="rebalance-result">
            {rbResult.moved > 0 ? (
              <span>
                {rbResult.preview ? "Would move" : "Moved"}{" "}
                <strong>{rbResult.moved}</strong> lead(s): {rbResult.from.name}{" "}
                {rbResult.from.before}→{rbResult.from.after}, {rbResult.to.name}{" "}
                {rbResult.to.before}→{rbResult.to.after}
              </span>
            ) : (
              <span>{rbResult.note || "Nothing to move"}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const allSelected =
    filteredPending.length > 0 &&
    filteredPending.every((p) => selected.has(p.id));

  // AUTO1 — this tab now shows PENDING suggestions only. Rejected suggestions
  // live under the top-level "Rejected" tab (one place for everything
  // rejected), rendered by <AutoAssignRejectedList />.
  return (
    <div className="space-y-3">
      {toolbar}
      {pending.length === 0 ? (
        <div className="p-12 text-center text-sm text-muted-foreground">
          No assignment suggestions waiting. Tap{" "}
          <strong>Run auto-assign</strong> to distribute unworked, unassigned
          leads by territory and workload — the suggestions land here for you to
          approve. Nothing is assigned to anyone until you approve it.
        </div>
      ) : (
        <>
            {perRep.size > 0 && (
              <div className="flex flex-wrap gap-2" data-testid="rep-tiles">
                <button
                  onClick={() => setRepFilter(null)}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    !repFilter
                      ? "border-primary bg-primary/10"
                      : "hover:bg-muted/40"
                  }`}
                >
                  All{" "}
                  <span className="text-muted-foreground">
                    ({pending.length})
                  </span>
                </button>
                {[...perRep.entries()].map(([repId, info]) => (
                  <button
                    key={repId}
                    onClick={() =>
                      setRepFilter(repFilter === repId ? null : repId)
                    }
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      repFilter === repId
                        ? "border-primary bg-primary/10"
                        : "hover:bg-muted/40"
                    }`}
                    data-testid={`rep-tile-${repId}`}
                  >
                    {info.name}{" "}
                    <span className="font-semibold">{info.count}</span>
                  </button>
                ))}
              </div>
            )}
            {/* R4/R8 — sticky bulk bar, shown when ≥1 row is selected. */}
            {selected.size > 0 && (
              <div
                className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow-sm"
                data-testid="auto-assign-bulk-bar"
              >
                <span className="text-sm font-medium">
                  {selected.size} selected
                </span>
                <Button
                  size="sm"
                  onClick={approveSelected}
                  disabled={busy}
                  data-testid="auto-assign-approve-selected"
                >
                  {busy ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 h-3 w-3" />
                  )}
                  Approve selected ({selected.size})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={rejectSelected}
                  disabled={busy}
                  data-testid="auto-assign-reject-selected"
                >
                  <XCircle className="mr-1.5 h-3 w-3" />
                  Reject selected ({selected.size})
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </Button>
              </div>
            )}
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full" data-testid="auto-assign-queue">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs font-medium uppercase tracking-wide">
                    <th className="p-3 w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allSelected}
                        onChange={(e) =>
                          toggleAll(e.target.checked, filteredPending)
                        }
                        data-testid="auto-assign-select-all"
                      />
                    </th>
                    <th className="p-3">Lead</th>
                    <th className="p-3 w-44">Suggested rep</th>
                    <th className="p-3">Why this rep</th>
                    <th className="p-3 w-36">Suggested</th>
                    <th className="p-3 w-60">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPending.map((p) => (
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 align-top">
                        <input
                          type="checkbox"
                          aria-label="Select row"
                          checked={selected.has(p.id)}
                          onChange={() => toggleOne(p.id)}
                          data-testid={`auto-assign-select-${p.id}`}
                        />
                      </td>
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
                        <div
                          className="line-clamp-2 break-words"
                          title={p.reason}
                        >
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
                          <select
                            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                            value=""
                            disabled={busy || reps.length === 0}
                            onChange={(e) => redirect(p, e.target.value)}
                            data-testid={`auto-assign-redirect-${p.id}`}
                            title="Reassign this lead to a different rep"
                          >
                            <option value="">Redirect…</option>
                            {reps
                              .filter((r) => r.id !== p.proposed_rep_id)
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {[r.first_name, r.last_name]
                                    .filter(Boolean)
                                    .join(" ") || "rep"}
                                </option>
                              ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
    </div>
  );
}

/**
 * CHANGE 2/3 — the auto-assign REJECTED suggestions, surfaced under the
 * top-level "Rejected" tab so managers have one place for everything rejected.
 * Each row can be redirected to a chosen rep/manager (turns the reject into an
 * assignment) or sent back to the New Leads pool. Adds multi-select + a sticky
 * bulk bar that loops the single-row hooks over the selection (client-side; no
 * new server endpoint).
 */
function AutoAssignRejectedList() {
  const { data: rejected = [], refetch: refetchRejected } =
    useAssignmentProposals("rejected");
  const redirectRejected = useRedirectRejectedProposal();
  const sendToNewLeads = useSendProposalToNewLeads();
  const reps = useSalesTeamReps();

  // Multi-select + a client-side "busy" flag while a bulk loop is in flight.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRepId, setBulkRepId] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const rejectedBusy =
    redirectRejected.isPending || sendToNewLeads.isPending || bulkBusy;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(rejected.map((p) => p.id)) : new Set());
  };
  const allSelected =
    rejected.length > 0 && rejected.every((p) => selected.has(p.id));

  // Single-row actions (kept alongside the bulk bar).
  const redirectRejectedRow = (p: AssignmentProposal, repId: string) => {
    if (!repId) return;
    redirectRejected.mutate(
      { id: p.id, repId },
      {
        onSuccess: () => {
          toast.success("Lead redirected and assigned");
          refetchRejected();
        },
        onError: (err: any) =>
          toast.error(err?.response?.data?.message || "Could not redirect"),
      },
    );
  };

  const sendRejectedToNewLeads = (p: AssignmentProposal) => {
    sendToNewLeads.mutate(p.id, {
      onSuccess: () => {
        toast.success("Lead sent back to New Leads");
        refetchRejected();
      },
      onError: (err: any) =>
        toast.error(
          err?.response?.data?.message || "Could not send to New Leads",
        ),
    });
  };

  // Bulk — loop the single-row hooks over the selection, await each, toast a
  // summary, then refetch. No new server endpoint (per the brief).
  const bulkRedirect = async () => {
    if (!bulkRepId) {
      toast.error("Pick a rep to redirect the selected leads to");
      return;
    }
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await redirectRejected.mutateAsync({ id, repId: bulkRepId });
        done++;
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    toast.success(`${done} redirected${failed ? `, ${failed} failed` : ""}`);
    setSelected(new Set());
    setBulkRepId("");
    refetchRejected();
  };

  const bulkSendToNewLeads = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await sendToNewLeads.mutateAsync(id);
        done++;
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    toast.success(
      `${done} sent to New Leads${failed ? `, ${failed} failed` : ""}`,
    );
    setSelected(new Set());
    refetchRejected();
  };

  return (
    <div className="space-y-3" data-testid="auto-assign-rejected-section">
      <div className="flex items-center gap-2">
        <XCircle className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">
          Auto-assign — rejected suggestions
          {rejected.length > 0 ? ` (${rejected.length})` : ""}
        </h3>
      </div>
      {rejected.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No rejected suggestions. When you reject a suggestion it lands here so
          you can redirect it to another rep/manager or send it back to New
          Leads — a reject is never just discarded.
        </div>
      ) : (
        <>
          {/* Bulk bar — shown when ≥1 row is selected. */}
          {selected.size > 0 && (
            <div
              className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow-sm"
              data-testid="auto-assign-rejected-bulk-bar"
            >
              <span className="text-sm font-medium">
                {selected.size} selected
              </span>
              <select
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                value={bulkRepId}
                disabled={rejectedBusy || reps.length === 0}
                onChange={(e) => setBulkRepId(e.target.value)}
                data-testid="auto-assign-rejected-bulk-rep"
              >
                <option value="">Redirect selected to…</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {[r.first_name, r.last_name].filter(Boolean).join(" ") ||
                      "rep"}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={bulkRedirect}
                disabled={rejectedBusy || !bulkRepId}
                data-testid="auto-assign-rejected-bulk-redirect"
              >
                {bulkBusy ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <ArrowRightLeft className="mr-1.5 h-3 w-3" />
                )}
                Redirect selected ({selected.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={bulkSendToNewLeads}
                disabled={rejectedBusy}
                data-testid="auto-assign-rejected-bulk-to-new-leads"
              >
                {bulkBusy ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <Undo2 className="mr-1.5 h-3 w-3" />
                )}
                Send selected to New Leads
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          )}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full" data-testid="auto-assign-rejected-queue">
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-medium uppercase tracking-wide">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      data-testid="auto-assign-rejected-select-all"
                    />
                  </th>
                  <th className="p-3">Lead</th>
                  <th className="p-3 w-44">Was suggested to</th>
                  <th className="p-3">Why this rep</th>
                  <th className="p-3 w-36">Rejected</th>
                  <th className="p-3 w-80">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rejected.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 align-top">
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        data-testid={`auto-assign-rejected-select-${p.id}`}
                      />
                    </td>
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
                      {ago(p.decided_at || p.created_at)}
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <div className="flex gap-2">
                        <select
                          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                          value=""
                          disabled={rejectedBusy || reps.length === 0}
                          onChange={(e) =>
                            redirectRejectedRow(p, e.target.value)
                          }
                          data-testid={`auto-assign-redirect-rejected-${p.id}`}
                          title="Assign this lead to a rep or manager"
                        >
                          <option value="">Redirect to…</option>
                          {reps.map((r) => (
                            <option key={r.id} value={r.id}>
                              {[r.first_name, r.last_name]
                                .filter(Boolean)
                                .join(" ") || "rep"}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => sendRejectedToNewLeads(p)}
                          disabled={rejectedBusy}
                          data-testid={`auto-assign-to-new-leads-${p.id}`}
                        >
                          <Undo2 className="mr-1.5 h-3 w-3" />
                          Send to New Leads
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Undo WORKFLOW — the auto-assign APPROVED assignments, surfaced under the
 * top-level "Approved" tab as a persistent, browsable list (replacing the
 * fleeting toast-undo). Each row is a lead an approval put with a rep; a
 * manager can Undo it — reverting the lead to unassigned and returning the
 * proposal to pending. A lead a rep has already worked (or that was
 * hand-reassigned) is kept, never stripped. Mirrors AutoAssignRejectedList:
 * per-row action + multi-select + a sticky bulk bar.
 */
function decidedByName(p: AssignmentProposal): string {
  const u = p.decided_by;
  if (!u) return "";
  return (
    `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || ""
  );
}

function AutoAssignApprovedList() {
  const { data: approved = [], refetch: refetchApproved } =
    useAssignmentProposals("approved");
  const undoApproval = useUndoAssignmentApproval();

  // Multi-select + a client-side "busy" flag while a bulk undo is in flight.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Most-recent first — the assignment a manager just made sits at the top.
  const rows = useMemo(
    () =>
      [...approved].sort(
        (a, b) =>
          new Date(b.decided_at ?? b.created_at).getTime() -
          new Date(a.decided_at ?? a.created_at).getTime(),
      ),
    [approved],
  );

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(rows.map((p) => p.id)) : new Set());
  };
  const allSelected = rows.length > 0 && rows.every((p) => selected.has(p.id));

  // Single-row undo.
  const undoRow = (p: AssignmentProposal) => {
    undoApproval.mutate([p.id], {
      onSuccess: (r) => {
        if (r.undone > 0) {
          toast.success("Reverted — lead is unassigned again");
        } else {
          toast.success("Kept — lead already worked");
        }
        refetchApproved();
      },
      onError: (err: any) =>
        toast.error(err?.response?.data?.message || "Could not undo"),
    });
  };

  // Bulk undo — one server call for the whole selection.
  const undoSelected = () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    undoApproval.mutate(ids, {
      onSuccess: (r) => {
        toast.success(
          `${r.undone} reverted${
            r.skipped.length
              ? `, ${r.skipped.length} kept (already worked)`
              : ""
          }`,
        );
        setSelected(new Set());
        refetchApproved();
      },
      onError: (err: any) =>
        toast.error(err?.response?.data?.message || "Could not undo"),
    });
  };

  return (
    <div className="space-y-3" data-testid="auto-assign-approved-section">
      <div className="flex items-center gap-2">
        <Undo2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">
          Auto-assign — undo an assignment
          {rows.length > 0 ? ` (${rows.length})` : ""}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Auto-assign — approved (assign made). Undo reverts a lead to unassigned;
        a lead that's already been worked is kept.
      </p>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No approved assignments to undo. When you approve an auto-assign
          suggestion the lead lands here so you can reverse it — until a rep
          starts working it.
        </div>
      ) : (
        <>
          {/* Bulk bar — shown when ≥1 row is selected. */}
          {selected.size > 0 && (
            <div
              className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow-sm"
              data-testid="auto-assign-approved-bulk-bar"
            >
              <span className="text-sm font-medium">
                {selected.size} selected
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={undoSelected}
                disabled={undoApproval.isPending}
                data-testid="auto-assign-approved-bulk-undo"
              >
                {undoApproval.isPending ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <Undo2 className="mr-1.5 h-3 w-3" />
                )}
                Undo selected ({selected.size})
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          )}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full" data-testid="auto-assign-approved-queue">
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-medium uppercase tracking-wide">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      data-testid="auto-assign-approved-select-all"
                    />
                  </th>
                  <th className="p-3">Lead</th>
                  <th className="p-3 w-44">Assigned to</th>
                  <th className="p-3 w-44">Approved by</th>
                  <th className="p-3 w-36">When</th>
                  <th className="p-3 w-40">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 align-top">
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        data-testid={`auto-assign-approved-select-${p.id}`}
                      />
                    </td>
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
                    <td className="p-3 align-top text-sm text-muted-foreground">
                      {decidedByName(p) || "—"}
                    </td>
                    <td className="p-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                      {ago(p.decided_at || p.created_at)}
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => undoRow(p)}
                        disabled={undoApproval.isPending}
                        data-testid={`auto-assign-undo-${p.id}`}
                        title="Revert this assignment — lead goes back to unassigned"
                      >
                        <Undo2 className="mr-1.5 h-3 w-3" />
                        Undo
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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
  // Count the ROWS awaiting approval (360 leads = 360), not the batch count.
  const importCount = (importBatchesQuery.data ?? []).reduce(
    (sum, b) => sum + (b.total_rows ?? 0),
    0,
  );

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
                <div className="space-y-6">
                  <QueueTable status="approved" kind={kind} />
                  <AutoAssignApprovedList />
                </div>
              </TabsContent>
              <TabsContent value="rejected">
                <div className="space-y-6">
                  <QueueTable status="rejected" kind={kind} />
                  <AutoAssignRejectedList />
                </div>
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
