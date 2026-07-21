/**
 * Activities — the rep's daily working surface, redesigned to match
 * the density and workflow of best-in-class sales tools (Pipedrive
 * being the explicit reference).
 *
 * Layout, top to bottom:
 *
 *   1. Page header — title + subtitle + primary "Log activity" button.
 *   2. Date-context tabs (To-do / Overdue / Today / Tomorrow / This
 *      week / Next week / All). The tab is the source of truth for
 *      the date window and propagates to both views.
 *   3. Toolbar — view toggle (List ↔ Calendar), type-chip rail,
 *      assignee picker, search box, and a refresh button.
 *   4. View body — either the dense list view (with bulk-done bar)
 *      or the week-grid calendar.
 *
 * State lives in a single component so changing a tab or a chip
 * shifts every panel atomically; nothing is duplicated between the
 * two views.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { format } from "date-fns";
import { useAuthStore } from "~/stores/use-auth-store";
import {
  CalendarRange,
  Loader2,
  Plus,
  RefreshCw,
  Rows3,
  Search,
} from "lucide-react";
import { DatePicker } from "~/components/ui/date-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Autocomplete } from "~/components/ui/autocomplete";
import {
  ACTIVITY_TYPES,
  useActivityList,
  useBulkUpdateActivityStatus,
  useUpdateActivityStatus,
  type Activity,
  type ActivityType,
} from "~/api/activities";
import { CreateActivityModal } from "~/components/activities/create-activity-modal";
import { ActivityInspectorSheet } from "~/components/activities/activity-inspector-sheet";
import { ActivityTypePill } from "~/components/activities/activity-kit";
import {
  ACTIVITIES_PERIODS,
  resolveActivitiesPeriod,
  type ActivitiesPeriod,
} from "~/components/activities/activities-period";
import {
  ActivitiesBulkBar,
  ActivitiesListView,
} from "~/components/activities/activities-list-view";
import { ActivitiesWeekView } from "~/components/activities/activities-week-view";
import { useStaff } from "~/api/users";
import { useDebounce } from "~/hooks/use-debounce";
import { useActivityCompletionStore } from "~/stores/use-activity-completion-store";
import { usePermission } from "~/hooks/use-permission";
import { isDealReadonly, isLeadReadonly } from "~/stores/use-is-readonly";
import { cn } from "~/lib/utils";

type ViewMode = "list" | "calendar";
type TypeFilter = "all" | ActivityType;

export default function ActivitiesPage() {
  const canManageActivities = usePermission("Activity", "manage");
  const currentUser = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();

  // ---------- view state ----------
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [period, setPeriod] = useState<ActivitiesPeriod>("today");
  /**
   * Custom date range — when set, takes precedence over `period` and the
   * preset tabs render as inactive. Mirrors the "Select period" pattern
   * from the reference: the rep can either pick a preset (Today, This
   * week, …) or pin an exact range without leaving the toolbar.
   */
  const [customRange, setCustomRange] = useState<{
    from?: Date;
    to?: Date;
  } | null>(null);
  // Hydrate the type filter from the URL. This is how the legacy
  // /tasks route surfaces as an Activities view: the redirect lands
  // on /activities?type=task and the page opens with the Task chip
  // already active. When the user changes the chip, we push the new
  // value back to the URL so bookmarks stay truthful.
  const urlType = searchParams.get("type");
  const initialType: TypeFilter =
    urlType && (ACTIVITY_TYPES as readonly string[]).includes(urlType)
      ? (urlType as ActivityType)
      : "all";
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialType);
  const [repFilter, setRepFilter] = useState<string>("all");
  const isMeOnly = !!currentUser && repFilter === currentUser.id;

  // Keep `?type=…` in the URL in lockstep with the active type chip.
  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (typeFilter === "all") {
      nextParams.delete("type");
    } else {
      nextParams.set("type", typeFilter);
    }
    const a = nextParams.toString();
    const b = searchParams.toString();
    if (a !== b) {
      setSearchParams(nextParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [page, setPage] = useState(1);

  // Calendar week anchor; allows independent navigation when the
  // period tab is "All". When a date-context tab is selected, the
  // anchor follows the tab's window so the week is always relevant.
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date());

  // ---------- selection state ----------
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // ---------- modal / inspector state ----------
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null,
  );
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // ---------- staff dropdown (kept the same as before) ----------
  const [staffSearch, setStaffSearch] = useState("");
  const debouncedStaffSearch = useDebounce(staffSearch, 500);
  const { data: staffData, isLoading: isLoadingStaff } = useStaff({
    page: 1,
    limit: 15,
    search: debouncedStaffSearch,
    status: "active",
  });
  const staff = staffData?.data ?? [];

  // ---------- resolved query params ----------
  // The single useActivityList call powers both the list AND the week
  // calendar. Custom range trumps the period tab; otherwise the period
  // tab decides the window. For "All" we still feed the calendar a
  // one-week slice so the grid has data.
  const periodResolution = useMemo(
    () => resolveActivitiesPeriod(period, weekAnchor),
    [period, weekAnchor],
  );

  const queryWindow = useMemo(() => {
    if (customRange?.from || customRange?.to) {
      return {
        due_from: customRange?.from?.toISOString(),
        due_to: customRange?.to?.toISOString(),
        open_only: false,
      };
    }
    if (viewMode === "calendar") {
      // Calendar follows its own week anchor so prev/next still
      // pull fresh data without losing chip + assignee filters.
      const ws = new Date(weekAnchor);
      ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7)); // Monday
      ws.setHours(0, 0, 0, 0);
      return {
        due_from: ws.toISOString(),
        due_to: undefined as string | undefined,
        open_only: false,
      };
    }
    return {
      due_from: periodResolution.due_from,
      due_to: periodResolution.due_to,
      open_only: periodResolution.open_only,
    };
  }, [customRange, viewMode, weekAnchor, periodResolution]);

  const {
    data: activitiesData,
    isLoading,
    isFetching,
    refetch,
  } = useActivityList({
    limit: viewMode === "calendar" ? 200 : 50,
    page: viewMode === "list" ? page : 1,
    type: typeFilter !== "all" ? typeFilter : undefined,
    assigned_to_id: repFilter === "all" ? undefined : repFilter,
    open_only: queryWindow.open_only,
    due_from: queryWindow.due_from,
    due_to: queryWindow.due_to,
    include_details: true,
  });

  const allActivities = activitiesData?.data ?? [];
  const meta = activitiesData?.meta;

  // ---------- mutations ----------
  const updateStatus = useUpdateActivityStatus();
  const bulkUpdateStatus = useBulkUpdateActivityStatus();
  const requestCompletion = useActivityCompletionStore((s) => s.request);

  // ---------- search filter (client-side) ----------
  const visibleActivities = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return allActivities;
    return allActivities.filter((a) => {
      const subj = a.subject?.toLowerCase() ?? "";
      const school = a.lead?.school?.name?.toLowerCase() ?? "";
      const desc = a.description?.toLowerCase() ?? "";
      return subj.includes(q) || school.includes(q) || desc.includes(q);
    });
  }, [allActivities, debouncedSearch]);

  // ---------- handlers ----------
  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll(ids: string[]) {
    setSelectedIds((prev) =>
      prev.length === ids.length ? [] : [...ids],
    );
  }
  function clearSelection() {
    setSelectedIds([]);
  }

  async function toggleComplete(activity: Activity) {
    const isDone =
      activity.status === "completed" || !!activity.completed_at;
    // Reopen → direct mutation (no outcome needed).
    if (isDone) {
      setPendingIds((prev) => new Set(prev).add(activity.id));
      try {
        await updateStatus.mutateAsync({
          id: activity.id,
          status: "scheduled",
        });
      } finally {
        setPendingIds((prev) => {
          const n = new Set(prev);
          n.delete(activity.id);
          return n;
        });
      }
      return;
    }
    // Mark-done → route through the outcome-capture dialog. The
    // callbacks flip the row's local pending state once the dialog
    // resolves (either with a saved completion or a cancel).
    setPendingIds((prev) => new Set(prev).add(activity.id));
    requestCompletion({
      activity,
      onCompleted: () => {
        setPendingIds((prev) => {
          const n = new Set(prev);
          n.delete(activity.id);
          return n;
        });
      },
      onCancelled: () => {
        setPendingIds((prev) => {
          const n = new Set(prev);
          n.delete(activity.id);
          return n;
        });
      },
    });
  }

  async function bulkMarkDone() {
    if (selectedIds.length === 0) return;
    // Bulk path: we route the FIRST selected activity through the
    // outcome dialog; once that outcome is captured it's applied to
    // every row in the batch via the bulk mutation. Keeps the rule
    // enforced without showing one dialog per selected row.
    const first = allActivities.find(
      (a: Activity) => a.id === selectedIds[0],
    );
    if (!first) return;
    requestCompletion({
      activity: first,
      onCompleted: async (completedHead) => {
        const outcome = completedHead.completion_outcome ?? undefined;
        const remaining = selectedIds.filter((id) => id !== completedHead.id);
        if (remaining.length > 0 && outcome) {
          await bulkUpdateStatus.mutateAsync({
            ids: remaining,
            status: "completed",
            outcome,
            completionNote:
              completedHead.completion_note ?? undefined,
          });
        }
        setSelectedIds([]);
      },
    });
  }

  function openInspector(activity: Activity) {
    setSelectedActivity(activity);
    setInspectorOpen(true);
  }

  const inspectorReadonly = useMemo(() => {
    if (!selectedActivity) return false;
    const lead = selectedActivity.lead;
    const deal = selectedActivity.deal as
      | { closeStatus?: string; close_status?: string; status?: string }
      | undefined;
    return (
      isLeadReadonly(lead?.status) ||
      isDealReadonly(
        deal?.closeStatus ?? deal?.close_status ?? deal?.status,
      )
    );
  }, [selectedActivity]);

  // Per-period count badges — derived from the currently loaded slice
  // so they're free; they're meant as a "what's in this window" cue
  // rather than authoritative numbers.
  const periodCount = visibleActivities.length;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Activities"
        subtitle="Track every call, meeting, demo, install, and follow-up across your schools."
        actions={
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4",
                      isFetching && "animate-spin",
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Log activity
            </Button>
          </div>
        }
      />

      <Container className="p-4 space-y-3">
        {/* Toolbar row 1: view toggle + result count + assignee + search */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <div className="text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${periodCount} activities`}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search activities…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-56 pl-8"
              />
            </div>

            {/* Quick "Me" toggle — single click to scope the page to
                the logged-in user. Pairs with the assignee dropdown
                below: the dropdown still lets managers pick anyone,
                the Me/Everyone toggle is the one-click rep view. */}
            {currentUser && (
              <div className="inline-flex rounded-md border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => setRepFilter("all")}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    !isMeOnly
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Everyone
                </button>
                <button
                  type="button"
                  onClick={() => setRepFilter(currentUser.id)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    isMeOnly
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Me
                </button>
              </div>
            )}

            {canManageActivities && (
              <div className="w-56">
                <Autocomplete
                  value={repFilter}
                  options={[
                    { label: "All assignees", value: "all" },
                    ...staff.map((rep) => ({
                      label: `${rep.first_name} ${rep.last_name}`,
                      value: rep.id,
                    })),
                  ]}
                  onValueChange={setRepFilter}
                  onSearchChange={setStaffSearch}
                  searchValue={staffSearch}
                  isLoading={isLoadingStaff}
                  emptyText="No reps found"
                  placeholder="All assignees"
                />
              </div>
            )}
          </div>
        </div>

        {/* Toolbar row 2: type chips left, date-context tabs right.
            Wraps cleanly on narrow screens — chips drop to a new line
            before the date tabs do. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <TypeChipRail value={typeFilter} onChange={setTypeFilter} />
          <div className="ml-auto flex items-center gap-2">
            <DateContextTabs
              value={period}
              onChange={(p) => {
                setPeriod(p);
                setCustomRange(null);
                setPage(1);
              }}
              disabled={!!(customRange?.from || customRange?.to)}
            />
            <CustomPeriodPicker
              value={customRange}
              onChange={(range) => {
                setCustomRange(range);
                setPage(1);
              }}
            />
          </div>
        </div>

        {/* View body */}
        {isLoading ? (
          <div className="flex items-center justify-center rounded-md border bg-background py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === "list" ? (
          <div>
            <ActivitiesBulkBar
              count={selectedIds.length}
              onClear={clearSelection}
              onMarkDone={bulkMarkDone}
              pending={bulkUpdateStatus.isPending}
            />
            <ActivitiesListView
              activities={visibleActivities}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
              onToggleComplete={toggleComplete}
              onActivityClick={openInspector}
              pendingIds={pendingIds}
            />
            {visibleActivities.length === 0 && (
              <EmptyState
                period={period}
                hasFilters={
                  typeFilter !== "all" ||
                  repFilter !== "all" ||
                  debouncedSearch.length > 0
                }
              />
            )}
            {meta && meta.totalPages > 1 && (
              <ListPagination
                page={page}
                totalPages={meta.totalPages}
                totalItems={meta.totalItems}
                onPageChange={setPage}
              />
            )}
          </div>
        ) : (
          <ActivitiesWeekView
            weekAnchor={weekAnchor}
            onWeekAnchorChange={setWeekAnchor}
            activities={visibleActivities}
            onActivityClick={openInspector}
          />
        )}
      </Container>

      <CreateActivityModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <ActivityInspectorSheet
        activity={selectedActivity}
        open={inspectorOpen}
        isReadonly={inspectorReadonly}
        onOpenChange={(open) => {
          setInspectorOpen(open);
          if (!open) setSelectedActivity(null);
        }}
      />
    </div>
  );
}

// ---------- Sub-components ----------

function DateContextTabs({
  value,
  onChange,
  disabled,
}: {
  value: ActivitiesPeriod;
  onChange: (p: ActivitiesPeriod) => void;
  /** True when a custom date range is in force; the preset tabs go
      muted because they no longer reflect the loaded data. */
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 overflow-x-auto",
        disabled && "opacity-50",
      )}
    >
      {ACTIVITIES_PERIODS.map((opt) => {
        const isActive = !disabled && opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "border-b-2 pb-0.5 transition-colors",
                isActive ? "border-primary" : "border-transparent",
              )}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CustomPeriodPicker({
  value,
  onChange,
}: {
  value: { from?: Date; to?: Date } | null;
  onChange: (range: { from?: Date; to?: Date } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ from?: Date; to?: Date }>(
    value ?? {},
  );
  const isActive = !!(value?.from || value?.to);
  const label = isActive
    ? `${value?.from ? format(value.from, "MMM d") : "—"} → ${
        value?.to ? format(value.to, "MMM d") : "—"
      }`
    : "Select period";

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(value ?? {});
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            isActive
              ? "border-primary bg-primary/10 text-primary"
              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="end">
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                From
              </label>
              <DatePicker
                value={draft.from}
                onChange={(d) => setDraft((p) => ({ ...p, from: d }))}
                placeholder="Start"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                To
              </label>
              <DatePicker
                value={draft.to}
                onChange={(d) => setDraft((p) => ({ ...p, to: d }))}
                placeholder="End"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null);
                setDraft({});
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (draft.from || draft.to) {
                  // Pin start-of-day / end-of-day so the API range
                  // includes the full day on both edges.
                  const from = draft.from
                    ? new Date(
                        draft.from.getFullYear(),
                        draft.from.getMonth(),
                        draft.from.getDate(),
                        0, 0, 0,
                      )
                    : undefined;
                  const to = draft.to
                    ? new Date(
                        draft.to.getFullYear(),
                        draft.to.getMonth(),
                        draft.to.getDate(),
                        23, 59, 59,
                      )
                    : undefined;
                  onChange({ from, to });
                }
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const options: { value: ViewMode; icon: React.ReactNode; label: string }[] = [
    { value: "list", icon: <Rows3 className="h-4 w-4" />, label: "List" },
    {
      value: "calendar",
      icon: <CalendarRange className="h-4 w-4" />,
      label: "Calendar",
    },
  ];
  return (
    <div className="inline-flex rounded-md border bg-background p-0.5">
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {opt.icon}
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TypeChipRail({
  value,
  onChange,
}: {
  value: TypeFilter;
  onChange: (v: TypeFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          value === "all"
            ? "bg-primary text-primary-foreground border-transparent shadow-sm"
            : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        All types
      </button>
      {ACTIVITY_TYPES.map((t) => (
        <ActivityTypePill
          key={t}
          type={t}
          active={value === t}
          onClick={() => onChange(t)}
        />
      ))}
    </div>
  );
}

function EmptyState({
  period,
  hasFilters,
}: {
  period: ActivitiesPeriod;
  hasFilters: boolean;
}) {
  const opt = ACTIVITIES_PERIODS.find((o) => o.value === period);
  const message = hasFilters
    ? "No activities match the current filters. Try clearing the type chip, search, or assignee."
    : opt?.emptyHint ?? "Nothing to show here yet.";
  return (
    <div className="rounded-md border border-dashed bg-background py-10 text-center">
      <p className="text-sm font-medium text-foreground">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Use the “Log activity” button to add a call, meeting, demo, or
        follow-up for a school.
      </p>
    </div>
  );
}

function ListPagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (n: number) => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        Page {page} of {totalPages} · {totalItems} activities
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
