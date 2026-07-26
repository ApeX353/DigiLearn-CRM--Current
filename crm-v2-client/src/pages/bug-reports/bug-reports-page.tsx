import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Bug, Loader2, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useAnyRole } from "~/hooks/use-permission";
import {
  useBugReports,
  useCreateBugReport,
  useUpdateBugReport,
  useAssignableUsers,
  SEVERITY_LABELS,
  STATUS_LABELS,
  type BugReport,
  type BugSeverity,
  type BugStatus,
} from "~/api/bug-reports";

const SEVERITIES: BugSeverity[] = ["low", "medium", "high", "critical"];
const STATUSES: BugStatus[] = ["open", "in_progress", "resolved", "closed"];

const severityVariant: Record<
  BugSeverity,
  "default" | "secondary" | "outline" | "destructive"
> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};

const statusVariant: Record<
  BugStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  open: "destructive",
  in_progress: "default",
  resolved: "secondary",
  closed: "outline",
};

/* ------------------------------------------------------------------ */
/* Report-a-bug dialog (available to everyone)                         */
/* ------------------------------------------------------------------ */
function ReportBugDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<BugSeverity>("medium");
  const [pageUrl, setPageUrl] = useState("");
  const create = useCreateBugReport();

  const reset = () => {
    setTitle("");
    setDescription("");
    setSeverity("medium");
    setPageUrl("");
  };

  const submit = async () => {
    if (title.trim().length < 3) {
      toast.error("Give the bug a short title (at least 3 characters).");
      return;
    }
    if (description.trim().length < 5) {
      toast.error("Please describe what happened (at least 5 characters).");
      return;
    }
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        severity,
        pageUrl: pageUrl.trim() || undefined,
      });
      toast.success("Thanks! Your bug report was sent to the team.");
      reset();
      setOpen(false);
    } catch {
      toast.error("Could not submit the report. Please try again.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        Report a bug
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a bug</DialogTitle>
          <DialogDescription>
            Tell us what went wrong. This goes straight to the support team as
            an in-house ticket.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bug-title">Title</Label>
            <Input
              id="bug-title"
              placeholder="Short summary of the problem"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bug-desc">What happened?</Label>
            <Textarea
              id="bug-desc"
              placeholder="Steps to reproduce, what you expected, what you saw…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as BugSeverity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEVERITY_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bug-url">Page / where (optional)</Label>
              <Input
                id="bug-url"
                placeholder="e.g. Leads page"
                value={pageUrl}
                onChange={(e) => setPageUrl(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Triage dialog (admin / admin_support)                               */
/* ------------------------------------------------------------------ */
function TriageDialog({
  bug,
  onClose,
}: {
  bug: BugReport | null;
  onClose: () => void;
}) {
  const update = useUpdateBugReport();
  const { data: users } = useAssignableUsers(!!bug);
  const [status, setStatus] = useState<BugStatus>("open");
  const [severity, setSeverity] = useState<BugSeverity>("medium");
  const [assignee, setAssignee] = useState<string>("unassigned");
  const [resolution, setResolution] = useState("");

  // Sync local state when a new ticket is opened.
  useEffect(() => {
    if (bug) {
      setStatus(bug.status);
      setSeverity(bug.severity);
      setAssignee(bug.assigned_to_id ?? "unassigned");
      setResolution(bug.resolution_note ?? "");
    }
  }, [bug]);

  if (!bug) return null;

  const save = async () => {
    try {
      await update.mutateAsync({
        id: bug.id,
        dto: {
          status,
          severity,
          assignedToId: assignee === "unassigned" ? null : assignee,
          resolutionNote: resolution.trim() || undefined,
        },
      });
      toast.success("Ticket updated.");
      onClose();
    } catch {
      toast.error("Could not update the ticket.");
    }
  };

  return (
    <Dialog open={!!bug} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6">{bug.title}</DialogTitle>
          <DialogDescription>
            Reported{" "}
            {bug.reported_by
              ? `by ${bug.reported_by.first_name} ${bug.reported_by.last_name} `
              : ""}
            on {format(new Date(bug.created_at), "MMM d, yyyy 'at' h:mma")}
            {bug.page_url ? ` · ${bug.page_url}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
            {bug.description}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as BugStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as BugSeverity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEVERITY_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Assign to</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {(users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resolution">Resolution note</Label>
            <Textarea
              id="resolution"
              placeholder="What was done (sent to the reporter when resolved)…"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function BugReportsPage() {
  // Three audiences, deliberately different views:
  //  - owner triager (admin_support = prince): full workspace — dates,
  //    reporter, assignee, aging, and the Triage controls.
  //  - product owner (admin = Mr Dube): a status-only tracker. He can see
  //    WHAT bugs exist and their severity/status, but NOT when they were
  //    raised, how long they've been open, or who's on them — so the board
  //    never advertises that a fix is taking a while.
  //  - everyone else: their own reported tickets.
  const isOwnerTriager = useAnyRole(["admin_support"]);
  const isAdmin = useAnyRole(["admin"]);
  const isProductOwner = isAdmin && !isOwnerTriager;

  const showRaised = !isProductOwner;
  const showReporter = isOwnerTriager;
  const showAssignee = !isProductOwner;
  const showManage = isOwnerTriager;

  const [statusFilter, setStatusFilter] = useState<BugStatus | "all">("all");
  const [active, setActive] = useState<BugReport | null>(null);

  const { data, isLoading } = useBugReports(
    statusFilter === "all" ? undefined : statusFilter,
  );
  const rows = data?.data ?? [];

  const subtitle = isProductOwner
    ? "Reported issues and their current status."
    : isOwnerTriager
      ? "In-house ticket queue. Triage, assign, and resolve reported issues."
      : "Spotted something broken? Report it and track your tickets here.";

  return (
    <Container>
      <PageHeader
        title={isProductOwner ? "Bug Tracker" : "Bug Reports"}
        actions={<ReportBugDialog />}
      >
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as BugStatus | "all")}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {STATUSES.map((s) => (
              <TabsTrigger key={s} value={s}>
                {STATUS_LABELS[s]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>

      <p className="mb-4 text-sm text-muted-foreground">{subtitle}</p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-12 text-center">
          <Bug className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isOwnerTriager || isProductOwner
              ? "No bug reports match this filter."
              : "You haven't reported any bugs yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {showRaised && <th className="px-3 py-2">Raised</th>}
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Status</th>
                {/* Solved date shows for every audience (owner decision
                    2026-07-26): only resolved/closed tickets carry a date,
                    so open tickets still advertise no aging. */}
                <th className="px-3 py-2">Solved</th>
                {showReporter && <th className="px-3 py-2">Reporter</th>}
                {showAssignee && <th className="px-3 py-2">Assignee</th>}
                {showManage && <th className="px-3 py-2 text-right">Manage</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((bug) => (
                <tr key={bug.id} className="hover:bg-muted/30">
                  {showRaised && (
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {format(new Date(bug.created_at), "MMM d, yyyy")}
                    </td>
                  )}
                  <td
                    className="max-w-[280px] truncate px-3 py-2 font-medium"
                    title={bug.title}
                  >
                    {bug.title}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={severityVariant[bug.severity]}>
                      {SEVERITY_LABELS[bug.severity]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant[bug.status]}>
                      {STATUS_LABELS[bug.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {bug.resolved_at
                      ? format(new Date(bug.resolved_at), "MMM d, yyyy")
                      : "—"}
                  </td>
                  {showReporter && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {bug.reported_by
                        ? `${bug.reported_by.first_name} ${bug.reported_by.last_name}`
                        : "—"}
                    </td>
                  )}
                  {showAssignee && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {bug.assigned_to ? (
                        `${bug.assigned_to.first_name} ${bug.assigned_to.last_name}`
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                  )}
                  {showManage && (
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActive(bug)}
                      >
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        Triage
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isOwnerTriager && (
        <TriageDialog bug={active} onClose={() => setActive(null)} />
      )}
    </Container>
  );
}
