import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Bug,
  CheckSquare,
  Database,
  Lightbulb,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
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
  useBugReportCounts,
  useCreateBugReport,
  useUpdateBugReport,
  useAssignableUsers,
  SEVERITY_LABELS,
  STATUS_LABELS,
  WORK_TYPE_LABELS,
  type BugReport,
  type BugReportFilters,
  type BugSeverity,
  type BugStatus,
  type WorkType,
} from "~/api/bug-reports";

const SEVERITIES: BugSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
  "very_critical",
];
const STATUSES: BugStatus[] = [
  "open",
  "in_progress",
  "backlog",
  "verification",
  "resolved",
  "done",
  "closed",
  "duplicate",
  "cancelled",
  "wont_do",
];
const WORK_TYPES: WorkType[] = [
  "bug",
  "feature",
  "data_task",
  "investigation",
  "task",
];

/* ------------------------------------------------------------------ */
/* Visual encodings — each dimension gets a distinct one              */
/* ------------------------------------------------------------------ */

// Work type: colour + icon (a "what is this" identity chip).
const TYPE_META: Record<
  WorkType,
  { icon: typeof Bug; className: string }
> = {
  bug: {
    icon: Bug,
    className:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
  },
  feature: {
    icon: Lightbulb,
    className:
      "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
  },
  data_task: {
    icon: Database,
    className:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  },
  investigation: {
    icon: Search,
    className:
      "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  },
  task: {
    icon: CheckSquare,
    className:
      "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  },
};

function TypeBadge({ type }: { type: WorkType }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}
    >
      <Icon className="h-3 w-3" />
      {WORK_TYPE_LABELS[type]}
    </span>
  );
}

// Severity: the existing shadcn Badge variants (an "impact" signal).
const severityVariant: Record<
  BugSeverity,
  "default" | "secondary" | "outline" | "destructive"
> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
  very_critical: "destructive",
};

const statusVariant: Record<
  BugStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  open: "destructive",
  in_progress: "default",
  backlog: "outline",
  verification: "default",
  resolved: "secondary",
  done: "secondary",
  closed: "outline",
  duplicate: "outline",
  cancelled: "outline",
  wont_do: "outline",
};

/* ------------------------------------------------------------------ */
/* Saved views                                                         */
/* ------------------------------------------------------------------ */
type ViewKey =
  | "all"
  | "bugs"
  | "features"
  | "data"
  | "investigations"
  | "done";

const VIEWS: {
  key: ViewKey;
  label: string;
  filter: { workType?: WorkType; status?: BugStatus };
}[] = [
  { key: "all", label: "All", filter: {} },
  { key: "bugs", label: "Bugs", filter: { workType: "bug" } },
  {
    key: "features",
    label: "Features (Backlog)",
    filter: { workType: "feature" },
  },
  { key: "data", label: "Data & Ops", filter: { workType: "data_task" } },
  {
    key: "investigations",
    label: "Investigations",
    filter: { workType: "investigation" },
  },
  { key: "done", label: "Done", filter: { status: "done" } },
];

/* ------------------------------------------------------------------ */
/* Create work item dialog (type-aware)                                */
/* ------------------------------------------------------------------ */
/**
 * "Create work item" asks WHAT is being reported first, then shows the
 * right fields. Bugs get expected/actual/steps/environment; features get
 * problem/outcome/value/acceptance; the rest get a plain description. The
 * "Report a problem" shortcut locks the type to bug.
 */
function CreateWorkItemDialog({
  triggerLabel,
  defaultType,
  lockType,
}: {
  triggerLabel: string;
  defaultType: WorkType;
  lockType?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<WorkType>(defaultType);
  const [title, setTitle] = useState("");
  const [component, setComponent] = useState("");
  const [severity, setSeverity] = useState<BugSeverity>("medium");
  const [pageUrl, setPageUrl] = useState("");

  // Bug fields
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [steps, setSteps] = useState("");
  const [environment, setEnvironment] = useState("");

  // Feature fields
  const [problem, setProblem] = useState("");
  const [outcome, setOutcome] = useState("");
  const [value, setValue] = useState("");
  const [acceptance, setAcceptance] = useState("");

  // Generic (data/investigation/task)
  const [details, setDetails] = useState("");

  const create = useCreateBugReport();

  const reset = () => {
    setType(defaultType);
    setTitle("");
    setComponent("");
    setSeverity("medium");
    setPageUrl("");
    setExpected("");
    setActual("");
    setSteps("");
    setEnvironment("");
    setProblem("");
    setOutcome("");
    setValue("");
    setAcceptance("");
    setDetails("");
  };

  const section = (label: string, body: string) =>
    body.trim() ? `**${label}**\n${body.trim()}` : "";

  const buildDescription = (): string => {
    if (type === "bug") {
      return [
        section("Expected result", expected),
        section("Actual result", actual),
        section("Steps to reproduce", steps),
        section("Environment", environment),
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    if (type === "feature") {
      return [
        section("User problem", problem),
        section("Desired outcome", outcome),
        section("Business value", value),
        section("Acceptance criteria", acceptance),
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    return details.trim();
  };

  const submit = async () => {
    if (title.trim().length < 3) {
      toast.error("Give the item a short title (at least 3 characters).");
      return;
    }
    const description = buildDescription();
    if (description.trim().length < 5) {
      toast.error("Please fill in at least one detail field.");
      return;
    }
    try {
      await create.mutateAsync({
        title: title.trim(),
        description,
        workType: type,
        component: component.trim() || undefined,
        ...(type === "bug"
          ? { severity, pageUrl: pageUrl.trim() || undefined }
          : {}),
      });
      toast.success("Thanks! Your work item was sent to the team.");
      reset();
      setOpen(false);
    } catch {
      toast.error("Could not submit. Please try again.");
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
      <Button
        variant={lockType ? "outline" : "default"}
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        {triggerLabel}
      </Button>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lockType ? "Report a problem" : "Create work item"}</DialogTitle>
          <DialogDescription>
            {lockType
              ? "Tell us what went wrong. This is filed as a bug for the support team."
              : "Pick what you're reporting, then fill in the details."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!lockType && (
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as WorkType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {WORK_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="wi-title">Title</Label>
            <Input
              id="wi-title"
              placeholder="Short summary"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          {type === "bug" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="wi-expected">Expected result</Label>
                <Textarea
                  id="wi-expected"
                  placeholder="What should have happened"
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-actual">Actual result</Label>
                <Textarea
                  id="wi-actual"
                  placeholder="What actually happened"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-steps">Steps to reproduce</Label>
                <Textarea
                  id="wi-steps"
                  placeholder="1. … 2. … 3. …"
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wi-env">Environment</Label>
                  <Input
                    id="wi-env"
                    placeholder="e.g. production, Chrome"
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                  />
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
                <Label htmlFor="wi-url">Page / where (optional)</Label>
                <Input
                  id="wi-url"
                  placeholder="e.g. Leads page"
                  value={pageUrl}
                  onChange={(e) => setPageUrl(e.target.value)}
                  maxLength={500}
                />
              </div>
            </>
          )}

          {type === "feature" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="wi-problem">User problem</Label>
                <Textarea
                  id="wi-problem"
                  placeholder="What can't the user do today?"
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-outcome">Desired outcome</Label>
                <Textarea
                  id="wi-outcome"
                  placeholder="What should be possible instead?"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-value">Business value</Label>
                <Textarea
                  id="wi-value"
                  placeholder="Why does it matter / who benefits?"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-accept">Acceptance criteria</Label>
                <Textarea
                  id="wi-accept"
                  placeholder="How do we know it's done?"
                  value={acceptance}
                  onChange={(e) => setAcceptance(e.target.value)}
                  rows={2}
                />
              </div>
            </>
          )}

          {type !== "bug" && type !== "feature" && (
            <div className="space-y-1.5">
              <Label htmlFor="wi-details">Details</Label>
              <Textarea
                id="wi-details"
                placeholder={
                  type === "data_task"
                    ? "Source file/query, expected affected count, backup and rollback plan…"
                    : type === "investigation"
                      ? "The question, evidence so far, decision owner and required output…"
                      : "Describe the task…"
                }
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={5}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="wi-component">Component (optional)</Label>
            <Input
              id="wi-component"
              placeholder="e.g. leads, payments, imports"
              value={component}
              onChange={(e) => setComponent(e.target.value)}
              maxLength={100}
            />
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
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Triage dialog (triagers)                                            */
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
  const [workType, setWorkType] = useState<WorkType>("bug");
  const [severity, setSeverity] = useState<BugSeverity>("medium");
  const [component, setComponent] = useState("");
  const [assignee, setAssignee] = useState<string>("unassigned");
  const [resolution, setResolution] = useState("");

  useEffect(() => {
    if (bug) {
      setStatus(bug.status);
      setWorkType(bug.work_type);
      setSeverity(bug.severity);
      setComponent(bug.component ?? "");
      setAssignee(bug.assigned_to_id ?? "unassigned");
      setResolution(bug.resolution_note ?? "");
    }
  }, [bug]);

  if (!bug) return null;

  const needsNote =
    status === "resolved" || status === "verification" || status === "done";

  const save = async () => {
    if (needsNote && resolution.trim().length === 0) {
      toast.error(
        "A resolution note is required to move this to resolved, verification, or done.",
      );
      return;
    }
    try {
      await update.mutateAsync({
        id: bug.id,
        dto: {
          status,
          workType,
          severity,
          component: component.trim() || undefined,
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
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 break-words">{bug.title}</DialogTitle>
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
          <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap break-words">
            {bug.description}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={workType}
                onValueChange={(v) => setWorkType(v as WorkType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {WORK_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="triage-component">Component</Label>
              <Input
                id="triage-component"
                placeholder="e.g. leads, payments"
                value={component}
                onChange={(e) => setComponent(e.target.value)}
                maxLength={100}
              />
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resolution">
              Resolution note{needsNote ? " (required)" : ""}
            </Label>
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
/* Read-only detail dialog                                             */
/* ------------------------------------------------------------------ */
const STATUS_PLAIN: Record<BugStatus, string> = {
  open: "This has been reported and is waiting to be worked on.",
  in_progress: "The team is working on this right now.",
  backlog: "This is a planned item waiting to be scheduled.",
  verification: "The fix is done and is being verified.",
  resolved: "This has been fixed.",
  done: "This has been delivered and accepted.",
  closed: "This ticket is closed.",
  duplicate: "This is a duplicate of another ticket.",
  cancelled: "This was cancelled.",
  wont_do: "This will not be worked on.",
};

function BugDetailDialog({
  bug,
  onClose,
}: {
  bug: BugReport | null;
  onClose: () => void;
}) {
  if (!bug) return null;

  const fixed = bug.resolved_at ? new Date(bug.resolved_at) : null;
  const isDone =
    bug.status === "resolved" ||
    bug.status === "closed" ||
    bug.status === "done";

  return (
    <Dialog open={!!bug} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 break-words">{bug.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5 pt-1">
            <TypeBadge type={bug.work_type} />
            <Badge variant={severityVariant[bug.severity]}>
              {SEVERITY_LABELS[bug.severity]}
            </Badge>
            <Badge variant={statusVariant[bug.status]}>
              {STATUS_LABELS[bug.status]}
            </Badge>
            {bug.component ? (
              <span className="text-xs text-muted-foreground">
                · {bug.component}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">{STATUS_PLAIN[bug.status]}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Raised
              </p>
              <p className="mt-1 font-medium">
                {format(new Date(bug.created_at), "MMM d, yyyy")}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Fixed
              </p>
              <p className="mt-1 font-medium">
                {fixed ? format(fixed, "MMM d, yyyy") : "Not yet"}
              </p>
            </div>
          </div>

          {bug.labels?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {bug.labels.map((l) => (
                <span
                  key={l}
                  className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {l}
                </span>
              ))}
            </div>
          ) : null}

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Details
            </p>
            <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap break-words">
              {bug.description}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              What was done about it
            </p>
            <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap break-words">
              {bug.resolution_note
                ? bug.resolution_note
                : isDone
                  ? "Done — no further notes were added."
                  : "Nothing yet — this will be filled in once the work is done."}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
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
  const isOwnerTriager = useAnyRole(["admin_support"]);
  const isAdmin = useAnyRole(["admin"]);
  const isManager = useAnyRole(["sales_manager", "manager"]);
  const isTriager = isOwnerTriager || isManager;
  const isProductOwner = isAdmin && !isOwnerTriager;

  const showRaised = !isProductOwner;
  const showReporter = isTriager;
  const showAssignee = !isProductOwner;
  const showManage = isTriager;

  const [view, setView] = useState<ViewKey>("all");
  const [statusFilter, setStatusFilter] = useState<BugStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<WorkType | "all">("all");
  const [componentFilter, setComponentFilter] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [active, setActive] = useState<BugReport | null>(null);
  const [detail, setDetail] = useState<BugReport | null>(null);

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const activeView = VIEWS.find((v) => v.key === view) ?? VIEWS[0];

  // Refinements shared by list + counts (NOT the view filter, so tab
  // badges show each view's own total).
  const refinements: BugReportFilters = useMemo(
    () => ({
      ...(componentFilter.trim() ? { component: componentFilter.trim() } : {}),
      ...(debouncedQ.trim() ? { q: debouncedQ.trim() } : {}),
    }),
    [componentFilter, debouncedQ],
  );

  const listFilters: BugReportFilters = useMemo(
    () => ({
      ...activeView.filter,
      ...refinements,
      // An explicit status/type filter overrides the view's own.
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      ...(typeFilter !== "all" && !activeView.filter.workType
        ? { workType: typeFilter }
        : {}),
    }),
    [activeView, refinements, statusFilter, typeFilter],
  );

  const { data, isLoading } = useBugReports(listFilters);
  const rows = data?.data ?? [];
  const filteredTotal = data?.meta?.total ?? rows.length;

  const { data: countData } = useBugReportCounts(refinements);
  const counts = countData ?? { total: 0, byStatus: {}, byWorkType: {} };

  const viewCount = (v: (typeof VIEWS)[number]) => {
    if (v.key === "all") return counts.total ?? 0;
    if (v.filter.workType) return counts.byWorkType[v.filter.workType] ?? 0;
    if (v.filter.status) return counts.byStatus[v.filter.status] ?? 0;
    return 0;
  };

  const subtitle = isProductOwner
    ? "Reported work and its current status. Click any row to see the detail."
    : isTriager
      ? "Every work item across the team. Click a row to read the detail, or use Triage to classify and assign it."
      : "Spotted something, or want to request a change? Create a work item and track it here.";

  return (
    <Container>
      <PageHeader
        title="Work Tracker"
        actions={
          <div className="flex gap-2">
            <CreateWorkItemDialog
              triggerLabel="Report a problem"
              defaultType="bug"
              lockType
            />
            <CreateWorkItemDialog
              triggerLabel="Create work item"
              defaultType="bug"
            />
          </div>
        }
      >
        <Tabs value={view} onValueChange={(v) => setView(v as ViewKey)}>
          <TabsList>
            {VIEWS.map((v) => (
              <TabsTrigger key={v.key} value={v.key}>
                {v.label}
                <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">
                  {viewCount(v)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>

      <p className="mb-3 text-sm text-muted-foreground">{subtitle}</p>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="w-56 pl-8"
            placeholder="Search title & description…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {view === "all" && (
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as WorkType | "all")}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {WORK_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {WORK_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as BugStatus | "all")}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          className="w-40"
          placeholder="Component…"
          value={componentFilter}
          onChange={(e) => setComponentFilter(e.target.value)}
          maxLength={100}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-12 text-center">
          <Bug className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isTriager || isProductOwner
              ? "No work items match these filters."
              : "You haven't created any work items yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Showing {rows.length} of {filteredTotal}
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {showRaised && <th className="px-3 py-2">Raised</th>}
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Solved</th>
                  {showReporter && <th className="px-3 py-2">Reporter</th>}
                  {showAssignee && <th className="px-3 py-2">Assignee</th>}
                  {showManage && (
                    <th className="px-3 py-2 text-right">Manage</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((bug) => (
                  <tr
                    key={bug.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => setDetail(bug)}
                  >
                    {showRaised && (
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {format(new Date(bug.created_at), "MMM d, yyyy")}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <TypeBadge type={bug.work_type} />
                    </td>
                    <td
                      className="max-w-[260px] truncate px-3 py-2 font-medium"
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
                          <span className="text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                      </td>
                    )}
                    {showManage && (
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActive(bug);
                          }}
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
        </div>
      )}

      {isTriager && (
        <TriageDialog bug={active} onClose={() => setActive(null)} />
      )}
      <BugDetailDialog bug={detail} onClose={() => setDetail(null)} />
    </Container>
  );
}
