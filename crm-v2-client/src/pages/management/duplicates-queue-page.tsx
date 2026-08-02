import { useEffect, useState, type ReactNode } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { Link } from "react-router";
import {
  Copy,
  Loader2,
  CheckCircle2,
  XCircle,
  SplitSquareVertical,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MapPin,
  Phone,
  Mail,
  MessageCircle,
  User as UserIcon,
  DollarSign,
  Tag,
  Calendar,
  GitMerge,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
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
  useDuplicateQueue,
  useReviewDuplicate,
  describeSignal,
  type DuplicateRecordType,
  type DuplicateSuspicion,
  type DuplicateSuspicionStatus,
} from "~/api/duplicates";
import { useLead, useMergeLeads, type Lead } from "~/api/leads";
import { useAnyRole } from "~/hooks/use-permission";

// Lead status colours — mirrors the map in components/leads/related-leads.tsx
// so the detail tiles read the same as the rest of the leads UI.
const statusColors: Record<string, string> = {
  New: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  Contacted: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
  Qualified:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  Nurture:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  Disqualified: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
  Converted:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
};

export default function DuplicatesQueuePage() {
  // admin_support is an oversight role (aliases to admin at the API's
  // RolesGuard, which already admits it to the duplicates endpoints) — let
  // it view the review queue in the UI too, so support can scope duplicates.
  const canAccess = useAnyRole(["admin", "admin_support", "sales_manager"]);
  if (!canAccess) {
    return (
      <div>
        <PageHeader title="Duplicate suspicions" />
        <Container className="p-4">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              You need manager access to review duplicate suspicions.
            </CardContent>
          </Card>
        </Container>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Duplicate suspicions"
        subtitle="Records flagged during creation — merge, keep separate, or dismiss."
      />
      <Container className="p-4">
        <Tabs defaultValue="pending" className="w-full">
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-4 space-y-6">
            <QueueSection record_type="lead" status="pending" />
            <QueueSection record_type="school" status="pending" />
            <QueueSection record_type="contact" status="pending" />
          </TabsContent>
          <TabsContent value="reviewed" className="mt-4 space-y-6">
            <QueueSection record_type="lead" status="all" reviewedOnly />
            <QueueSection record_type="school" status="all" reviewedOnly />
            <QueueSection record_type="contact" status="all" reviewedOnly />
          </TabsContent>
        </Tabs>
      </Container>
    </div>
  );
}

function QueueSection({
  record_type,
  status,
  reviewedOnly,
}: {
  record_type: DuplicateRecordType;
  status: DuplicateSuspicionStatus | "all";
  reviewedOnly?: boolean;
}) {
  const { data = [], isLoading } = useDuplicateQueue(record_type, status);
  const rows = reviewedOnly
    ? data.filter((r) => r.status !== "pending")
    : data;

  return (
    <section>
      <header className="mb-2 flex items-center gap-2">
        <Copy className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold capitalize">{record_type}</h3>
        <Badge variant="outline" className="text-[11px]">
          {rows.length}
        </Badge>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground text-center">
            Nothing here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <SuspicionCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}

function SuspicionCard({ row }: { row: DuplicateSuspicion }) {
  const review = useReviewDuplicate();
  const [pendingAction, setPendingAction] = useState<
    "merged" | "kept_separate" | "false_positive" | null
  >(null);
  const [expanded, setExpanded] = useState(false);

  // Only pending lead suspicions get the richer detail + merge-preview panel;
  // school/contact (and already-reviewed) rows keep the simple card.
  const canReviewDetail = row.record_type === "lead" && row.status === "pending";

  const raised = row.created_at
    ? formatDistanceToNow(new Date(row.created_at), { addSuffix: true })
    : "—";

  const reviewer =
    [row.reviewed_by?.first_name, row.reviewed_by?.last_name]
      .filter(Boolean)
      .join(" ") ||
    row.reviewed_by?.email ||
    null;

  const decide = (status: "merged" | "kept_separate" | "false_positive") => {
    setPendingAction(status);
    review.mutate(
      { id: row.id, data: { status } },
      {
        onSuccess: () => {
          toast.success(
            status === "merged"
              ? "Marked as merged"
              : status === "kept_separate"
                ? "Both records kept"
                : "Marked as false positive",
          );
          setPendingAction(null);
        },
        onError: () => {
          toast.error("Failed to record decision");
          setPendingAction(null);
        },
      },
    );
  };

  return (
    <Card
      className={canReviewDetail ? "cursor-pointer" : undefined}
      onClick={canReviewDetail ? () => setExpanded((v) => !v) : undefined}
      role={canReviewDetail ? "button" : undefined}
      aria-expanded={canReviewDetail ? expanded : undefined}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-1.5">
              {canReviewDetail && (
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    expanded ? "rotate-180" : ""
                  }`}
                />
              )}
              Score {row.score}/100 ·{" "}
              <span className="capitalize text-muted-foreground">
                {row.record_type}
              </span>
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Flagged {raised}
              {row.raised_by?.email ? ` by ${row.raised_by.email}` : ""}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              row.status === "pending"
                ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30"
                : row.status === "merged"
                  ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30"
                  : row.status === "kept_separate"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30"
                    : "bg-muted text-muted-foreground"
            }
          >
            {row.status.replace("_", " ")}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Signals
          </p>
          <div className="flex flex-wrap gap-1.5">
            {row.signals.map((s, i) => (
              <Badge key={`${s.kind}-${i}`} variant="outline">
                {describeSignal(s)}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>
            New record:{" "}
            <span className="text-foreground font-mono text-[11px]">
              {row.new_record_id.slice(0, 8)}…
            </span>
          </span>
          <span>·</span>
          <span>
            Matches:{" "}
            <span className="text-foreground font-mono text-[11px]">
              {row.existing_record_id.slice(0, 8)}…
            </span>
          </span>
        </div>

        {row.status === "pending" ? (
          <div
            className="flex flex-wrap gap-2 pt-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="sm"
              onClick={() => decide("merged")}
              disabled={review.isPending}
            >
              {pendingAction === "merged" && review.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <SplitSquareVertical className="mr-2 h-4 w-4" />
              )}
              Merge new → existing
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => decide("kept_separate")}
              disabled={review.isPending}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Keep both
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => decide("false_positive")}
              disabled={review.isPending}
            >
              <XCircle className="mr-2 h-4 w-4" />
              False positive
            </Button>
            {canReviewDetail && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? (
                  <ChevronUp className="mr-2 h-4 w-4" />
                ) : (
                  <ChevronDown className="mr-2 h-4 w-4" />
                )}
                Review details
              </Button>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            Reviewed{reviewer ? ` by ${reviewer}` : ""}
            {row.reviewed_at
              ? ` · ${formatDistanceToNow(new Date(row.reviewed_at), { addSuffix: true })}`
              : ""}
          </div>
        )}

        {canReviewDetail && expanded && <LeadMergeDetail row={row} />}
      </CardContent>
    </Card>
  );
}

// ---- Lead duplicate: detail view + merge preview ------------------------

type Survivor = "new" | "existing";

const COMPLETENESS_MAX = 8;

/** Count populated key fields — used to badge the more/less complete lead. */
function completenessScore(lead?: Lead | null): number {
  if (!lead) return 0;
  let n = 0;
  if (lead.lead_name?.trim()) n++;
  if (lead.school?.name?.trim()) n++;
  if (lead.school?.city?.trim()) n++;
  const contactName = [
    lead.primary_contact?.first_name,
    lead.primary_contact?.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (contactName) n++;
  if (lead.primary_contact?.phone?.trim()) n++;
  if (lead.primary_contact?.email?.trim()) n++;
  if ((Number(lead.estimated_value) || 0) > 0) n++;
  if (lead.notes?.trim()) n++;
  return n;
}

function leadDisplayName(lead?: Lead | null, fallback = "this lead"): string {
  return lead?.lead_name?.trim() || fallback;
}

function LeadMergeDetail({ row }: { row: DuplicateSuspicion }) {
  const newQuery = useLead(row.new_record_id);
  const existingQuery = useLead(row.existing_record_id);
  const mergeLeads = useMergeLeads();

  const newLead = newQuery.data?.data ?? null;
  const existingLead = existingQuery.data?.data ?? null;

  const isLoading = newQuery.isLoading || existingQuery.isLoading;
  const newUnavailable = !newQuery.isLoading && !newLead;
  const existingUnavailable = !existingQuery.isLoading && !existingLead;

  const newScore = completenessScore(newLead);
  const existingScore = completenessScore(existingLead);

  // Default survivor = the more complete lead (ties default to existing, the
  // record already in the system). Chosen once both leads have loaded.
  const [survivor, setSurvivor] = useState<Survivor | null>(null);
  useEffect(() => {
    if (survivor === null && newLead && existingLead) {
      setSurvivor(newScore > existingScore ? "new" : "existing");
    }
  }, [survivor, newLead, existingLead, newScore, existingScore]);

  const survivorLead = survivor === "new" ? newLead : existingLead;
  const otherLead = survivor === "new" ? existingLead : newLead;

  const busy = mergeLeads.isPending;

  const handleMerge = async () => {
    if (!survivor || !survivorLead || !otherLead) {
      toast.error("Both leads must be available to merge.");
      return;
    }
    if (survivorLead.id === otherLead.id) {
      toast.error("Survivor and retired lead must be different.");
      return;
    }

    // DUP2 — TRUE field-level merge. The server fuses the loser into the
    // survivor (survivor-wins, gaps filled), reparents every child record
    // (activities/deals/quotes/etc.) to the survivor, retires the loser,
    // and marks this suspicion 'merged' — all in one transaction.
    try {
      const result = await mergeLeads.mutateAsync({
        survivorId: survivorLead.id,
        loserId: otherLead.id,
      });
      const filled = result.filledFields?.length ?? 0;
      toast.success(
        `Merged — ${leadDisplayName(otherLead)} fused into ${leadDisplayName(survivorLead)}` +
          (filled ? ` (${filled} field${filled === 1 ? "" : "s"} filled)` : ""),
      );
    } catch {
      toast.error("Merge failed — nothing was changed.");
    }
  };

  if (isLoading) {
    return (
      <div
        className="mt-3 flex items-center justify-center rounded-lg border border-dashed py-8"
        onClick={(e) => e.stopPropagation()}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      {(newUnavailable || existingUnavailable) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {newUnavailable && existingUnavailable
            ? "Neither record is available any more — you can still keep both or mark this a false positive."
            : `The ${newUnavailable ? "new" : "existing"} record is no longer available. Merge is disabled; you can still keep both or mark this a false positive.`}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <LeadTile
          heading="New lead"
          lead={newLead}
          score={newScore}
          otherScore={existingScore}
          unavailable={newUnavailable}
        />
        <LeadTile
          heading="Existing lead"
          lead={existingLead}
          score={existingScore}
          otherScore={newScore}
          unavailable={existingUnavailable}
        />
        <AfterMergeTile
          survivor={survivor}
          setSurvivor={setSurvivor}
          survivorLead={survivorLead}
          otherLead={otherLead}
          canChoose={!!newLead && !!existingLead}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
        <p className="mr-auto text-[11px] text-muted-foreground">
          Fields are fused (survivor-wins, gaps filled from the other) and all
          activities, deals and quotes move to the survivor. The other lead is
          retired as Disqualified — nothing is deleted.
        </p>
        <Button
          size="sm"
          onClick={handleMerge}
          disabled={busy || !newLead || !existingLead || !survivorLead}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <GitMerge className="mr-2 h-4 w-4" />
          )}
          {survivorLead
            ? `Merge — keep ${leadDisplayName(survivorLead)}`
            : "Merge"}
        </Button>
      </div>
    </div>
  );
}

function CompletenessBadge({
  score,
  otherScore,
}: {
  score: number;
  otherScore: number;
}) {
  if (score === otherScore) return null;
  const isMost = score > otherScore;
  return (
    <Badge
      variant="outline"
      className={
        isMost
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300"
          : "bg-muted text-muted-foreground"
      }
    >
      {isMost ? "Most complete" : "Least complete"}
    </Badge>
  );
}

function DetailRow({
  icon: Icon,
  children,
}: {
  icon: typeof MapPin;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
      <span className="min-w-0 break-words text-foreground">{children}</span>
    </div>
  );
}

function LeadTile({
  heading,
  lead,
  score,
  otherScore,
  unavailable,
}: {
  heading: string;
  lead: Lead | null;
  score: number;
  otherScore: number;
  unavailable: boolean;
}) {
  if (!lead) {
    return (
      <div className="rounded-lg border bg-background p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {heading}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {unavailable
            ? "Record no longer available."
            : "Could not load this record."}
        </p>
      </div>
    );
  }

  const location = [lead.school?.city, lead.school?.district, lead.school?.province]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(", ");
  const contactName = [lead.primary_contact?.first_name, lead.primary_contact?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const rep = [lead.assignee?.first_name, lead.assignee?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const value = Number(lead.estimated_value) || 0;

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {heading}
        </p>
        <CompletenessBadge score={score} otherScore={otherScore} />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Link
          to={`/leads/${lead.id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {leadDisplayName(lead)}
          <ExternalLink className="h-3 w-3" />
        </Link>
        <Badge className={statusColors[lead.status] || "bg-muted text-foreground"}>
          {lead.status}
        </Badge>
      </div>

      <div className="mt-2 space-y-1.5">
        {lead.school?.name && (
          <DetailRow icon={MapPin}>
            {lead.school.name}
            {location ? ` · ${location}` : ""}
          </DetailRow>
        )}
        {contactName && <DetailRow icon={UserIcon}>{contactName}</DetailRow>}
        {lead.primary_contact?.phone && (
          <DetailRow icon={Phone}>{lead.primary_contact.phone}</DetailRow>
        )}
        {lead.primary_contact?.email && (
          <DetailRow icon={Mail}>{lead.primary_contact.email}</DetailRow>
        )}
        {lead.primary_contact?.whatsapp_number && (
          <DetailRow icon={MessageCircle}>
            {lead.primary_contact.whatsapp_number}
          </DetailRow>
        )}
        <DetailRow icon={DollarSign}>
          {value > 0 ? value.toLocaleString() : "No estimated value"}
        </DetailRow>
        {rep && <DetailRow icon={UserIcon}>Rep: {rep}</DetailRow>}
        {lead.source && <DetailRow icon={Tag}>{lead.source}</DetailRow>}
        <DetailRow icon={Calendar}>
          {lead.created_at
            ? format(new Date(lead.created_at), "MMM d, yyyy")
            : "—"}
        </DetailRow>
      </div>

      {lead.notes?.trim() && (
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap border-t pt-2 text-xs text-muted-foreground">
          {lead.notes.trim()}
        </p>
      )}
    </div>
  );
}

function AfterMergeTile({
  survivor,
  setSurvivor,
  survivorLead,
  otherLead,
  canChoose,
}: {
  survivor: Survivor | null;
  setSurvivor: (s: Survivor) => void;
  survivorLead: Lead | null;
  otherLead: Lead | null;
  canChoose: boolean;
}) {
  const survivorName = leadDisplayName(survivorLead, "the survivor");
  const otherName = leadDisplayName(otherLead, "the other lead");

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div className="flex items-center gap-1.5">
        <ArrowRight className="h-3.5 w-3.5 text-primary" />
        <p className="text-[11px] uppercase tracking-wide text-primary">
          After merge
        </p>
      </div>

      {/* Survivor chooser — segmented control; defaults to most complete. */}
      <div className="mt-2 inline-flex rounded-md border p-0.5">
        <button
          type="button"
          disabled={!canChoose}
          onClick={() => setSurvivor("new")}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
            survivor === "new"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Keep New
        </button>
        <button
          type="button"
          disabled={!canChoose}
          onClick={() => setSurvivor("existing")}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
            survivor === "existing"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Keep Existing
        </button>
      </div>

      {survivorLead ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{survivorName}</span>
            <Badge
              className={
                statusColors[survivorLead.status] || "bg-muted text-foreground"
              }
            >
              {survivorLead.status}
            </Badge>
          </div>

          <ul className="mt-2 space-y-1.5 text-xs">
            <li className="flex gap-1.5">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              <span>
                <span className="font-medium">{survivorName}</span> stays active
                and keeps its own values — any empty field is filled from{" "}
                <span className="font-medium">{otherName}</span>, and both leads'
                notes are combined.
              </span>
            </li>
            <li className="flex gap-1.5">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              <span>
                All of {otherName}'s activities, deals, quotes, requisitions and
                stakeholders move to{" "}
                <span className="font-medium">{survivorName}</span>.
              </span>
            </li>
            <li className="flex gap-1.5">
              <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-medium">{otherName}</span> is retired
                (Disqualified, reason: Merged (field-level)) with a note pointing
                to <span className="font-medium">{survivorName}</span> — kept for
                history, not deleted.
              </span>
            </li>
          </ul>

          <p className="mt-2 border-t pt-2 text-[11px] italic text-muted-foreground">
            True field-level merge — the two records are fused into the survivor
            in one step. This cannot be undone automatically.
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Both records must be available to preview the merge.
        </p>
      )}
    </div>
  );
}
