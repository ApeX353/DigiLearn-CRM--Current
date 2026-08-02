import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Copy,
  Loader2,
  CheckCircle2,
  XCircle,
  SplitSquareVertical,
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
import { useAnyRole } from "~/hooks/use-permission";

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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">
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
          <div className="flex flex-wrap gap-2 pt-1">
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
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            Reviewed{reviewer ? ` by ${reviewer}` : ""}
            {row.reviewed_at
              ? ` · ${formatDistanceToNow(new Date(row.reviewed_at), { addSuffix: true })}`
              : ""}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
