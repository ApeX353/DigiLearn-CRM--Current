import type {
  ColumnDef,
  PaginationState,
  RowSelectionState,
} from "@tanstack/react-table";
import {
  ChevronDown,
  Flame,
  GitMerge,
  Loader2,
  Plus,
  Sparkles,
  Target,
  Upload,
  UserRoundPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import { useRunAutoAssign } from "~/api/assignment-proposals";
import { MyEnquiriesBanner } from "~/components/leads/my-enquiries-banner";
import {
  LEAD_SOURCES,
  useLeads,
  type LeadSource,
  type LeadStatus,
} from "~/api/leads";
import { PROVINCES, type Province } from "~/api/schools";
import { useAllStaff } from "~/api/staff";
import { useCheckLeadSlaBreaches, useLeadSlaBreaches } from "~/api/sla";
import PulsingAlert from "~/components/alerts/pusling-alert";
import ContentFilter from "~/components/content-filter";
import { DataTable } from "~/components/data-table";
import { DataTablePagination } from "~/components/data-table-pagination";
import { AssignLeadsDialog } from "~/components/leads/assign-leads-dialog";
import { LeadRowMarkers } from "~/components/leads/lead-row-markers";
import { LeadsCsvImportModal } from "~/components/leads/leads-csv-import-modal";
import { ImportLeadsDialog } from "~/components/leads/import-leads-dialog";
import { MergeSelectedLeadsDialog } from "~/components/leads/merge-selected-leads-dialog";
import PageHeader from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { leadStatuses } from "~/data";
import { useAnyRole } from "~/hooks/use-permission";
import { cn } from "~/lib/utils";
import type { Lead } from "~/api/leads/types";
import { useDebounce } from "~/hooks/use-debounce";

type AssignmentStateFilter = "all" | "assigned" | "unassigned";

// ---------------------------------------------------------------------------
// Column defs — compacted to a single-line row rhythm.
//
// The previous Lead Name / Location / Contact cells stacked their content
// vertically (`space-y-1`), which pushed every row to ~80px tall even when
// the metadata would have fit comfortably on one line. That's the "loose
// floating cards" feel the user called out against the Schools list, which
// renders as a single line per row.
//
// New rhythm: main identity on one line; subordinate metadata on a second
// tight line via `leading-tight`. Location and Contact collapse to single
// lines with a mid-dot separator and truncation. Row height drops from
// ~80px to ~44px — parity with the Schools list — without shrinking text.
// ---------------------------------------------------------------------------
const baseLeadColumns: ColumnDef<Lead>[] = [
  {
    accessorKey: "lead_name",
    header: "Lead Name",
    cell: ({ row }) => (
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to={`/leads/${row.original.id}`}
            className="font-medium hover:underline text-primary truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.lead_name}
          </Link>
          <span className="text-[11px] text-muted-foreground shrink-0">
            Added&nbsp;{format(row.original.created_at, "MMM d")}
          </span>
        </div>
        {/* Indicator pills stay on a tight second row so the row height
            only adds the pill height (~18px), not a full line of text. */}
        <div className="mt-0.5">
          <LeadRowMarkers lead={row.original} compact />
        </div>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = leadStatuses.find((s) => s.name === row.original.status);
      return (
        <Badge className={cn(status?.color, "text-white")}>
          {row.original.status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "school",
    header: "Location",
    cell: ({ row }) => (
      <div className="min-w-0 text-xs leading-tight">
        <Link
          to={`/schools/${row.original.school?.id}`}
          className="font-medium hover:underline text-primary truncate block"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.school?.name || "-"}
        </Link>
        <span className="text-muted-foreground truncate block">
          {row.original.school?.province || "-"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "primary_contact",
    header: "Contact",
    cell: ({ row }) => {
      const contact = row.original.primary_contact;
      if (!contact) return <div className="text-muted-foreground">-</div>;
      return (
        <div className="min-w-0 text-xs leading-tight">
          <div className="font-medium truncate">
            {contact.first_name} {contact.last_name}
          </div>
          {contact.phone && (
            <div className="text-muted-foreground truncate">
              {contact.phone}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "source",
    header: "Source",
    cell: ({ row }) => <div className="text-sm">{row.original.source}</div>,
  },
  {
    accessorKey: "last_action_at",
    header: "Last Activity",
    cell: ({ row }) => {
      const date = row.original.last_action_at;
      if (!date) return <div className="text-muted-foreground">-</div>;
      return (
        <div className="text-sm">{format(new Date(date), "MMM dd, yyyy")}</div>
      );
    },
  },
  {
    accessorKey: "temperature",
    header: "Temp",
    cell: ({ row }) => {
      const temp = row.original.temperature;
      const score = row.original.temperature_score;
      if (!temp) return <div className="text-muted-foreground">-</div>;
      const colors = {
        hot: "bg-red-500",
        warm: "bg-amber-500",
        cold: "bg-blue-500",
      };
      return (
        <div className="flex items-center gap-1.5">
          <span className={cn("w-2 h-2 rounded-full", colors[temp])} />
          <span className="text-xs font-medium capitalize">{temp}</span>
          {score !== null && (
            <span className="text-[10px] text-muted-foreground">
              {score}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "assigned",
    header: "Assigned To",
    cell: ({ row }) => {
      const user = row.original.assignee;
      if (!user) return <div className="text-muted-foreground">Unassigned</div>;
      return (
        <div className="text-sm">
          {user.first_name} {user.last_name}
        </div>
      );
    },
  },
];

/**
 * Compact counts bar rendered above the filter row.
 *
 *   Total: 120    Showing 25    Selected 3
 *
 * - `Total` is the unfiltered lead inventory the user can see.
 * - `Showing` reflects the currently-applied filter + search + tab
 *   combination. Equals `Total` when no filter is active.
 * - `Selected` only renders when the bulk-selection bar is active.
 *
 * The bar stays horizontal and uses tabular-nums so the numbers don't
 * dance as the user types in the search box.
 */
function LeadsCountBar({
  totalCount,
  filteredCount,
  selectedCount,
}: {
  totalCount: number;
  filteredCount: number;
  selectedCount: number;
}) {
  const isFiltered = filteredCount !== totalCount;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>
        <span className="font-medium text-foreground tabular">
          Total: {totalCount.toLocaleString()}
        </span>
        <span className="sr-only"> leads</span>
      </span>
      {isFiltered && (
        <span className="tabular">
          Showing{" "}
          <span className="font-medium text-foreground">
            {filteredCount.toLocaleString()}
          </span>{" "}
          filtered leads
        </span>
      )}
      {selectedCount > 0 && (
        <span className="tabular">
          Selected{" "}
          <span className="font-medium text-foreground">
            {selectedCount.toLocaleString()}
          </span>
        </span>
      )}
    </div>
  );
}

export default function LeadsManagementPage() {
  const [leadFilter, setLeadFilter] = useState<LeadStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [provinceFilter, setProvinceFilter] = useState<Province | "all">("all");
  const [assignedToFilter, setAssignedToFilter] = useState<string | "all">(
    "all",
  );
  const [assignmentStateFilter, setAssignmentStateFilter] =
    useState<AssignmentStateFilter>("all");
  const [showBreachedOnly, setShowBreachedOnly] = useState(false);
  const [temperatureFilter, setTemperatureFilter] = useState<"all" | "hot" | "warm" | "cold">("all");
  // Seed the search box from `?search=` — the global topbar search
  // routes here with that param, and without this the page silently
  // ignored it and showed the unfiltered list.
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(
    () => searchParams.get("search") ?? "",
  );
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLeadsOpen, setImportLeadsOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const debouncedSearchTerm = useDebounce(searchTerm, 700);

  const navigate = useNavigate();
  const runAutoAssign = useRunAutoAssign();
  const runAutoAssignFromNew = () => {
    // Distribute the whole new/unworked pool; approvals happen in the queue.
    runAutoAssign.mutate(null, {
      onSuccess: (r) => {
        toast.success(
          r.proposed > 0
            ? `${r.proposed} lead(s) proposed — review them in the Approval Queue`
            : "Nothing to distribute right now",
        );
        if (r.proposed > 0) navigate("/admin/approval-queue");
      },
      onError: (err: any) =>
        toast.error(err?.response?.data?.message || "Could not run auto-assign"),
    });
  };
  const canAssignLeads = useAnyRole(["admin", "sales_manager"]);
  // CSV5 — bulk import is a management action, not a rep one. Same
  // roles that own lead assignment own bringing leads into the system.
  const canImportLeads = useAnyRole(["admin", "sales_manager"]);
  const canRunSlaCheck = useAnyRole([
    "admin",
    "sales_manager",
    "sale_manager",
    "manager",
  ]);

  const { data, isLoading, error } = useLeads({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    status: leadFilter === "all" ? undefined : leadFilter,
    province: provinceFilter === "all" ? undefined : provinceFilter,
    source: sourceFilter === "all" ? undefined : sourceFilter,
    assignment_state:
      assignmentStateFilter === "all" ? undefined : assignmentStateFilter,
    sla_breached: showBreachedOnly ? true : undefined,
    temperature: temperatureFilter === "all" ? undefined : temperatureFilter,
    assigned_to: assignedToFilter === "all" ? undefined : assignedToFilter,
    search: debouncedSearchTerm,
  });
  // Unfiltered total — cheap second query asking the server for page
  // 1 with `limit: 1`. Only the `meta.totalItems` is consumed; the
  // rows are discarded. Kept independent of the filter bundle so the
  // Total count stays stable as the rep narrows the Showing view.
  const { data: totalsData } = useLeads({ page: 1, limit: 1 });
  const unfilteredTotalCount = totalsData?.meta?.totalItems ?? 0;
  // The assignee filter lists people you can filter leads by — only
  // active staff belong here. "all" pulled in deactivated and test
  // accounts (e.g. the ZZ Verify accounts) and cluttered the dropdown.
  const { data: staff } = useAllStaff({
    page: 1,
    limit: 100,
    search: "",
    status: "active",
  });
  const { data: leadBreaches } = useLeadSlaBreaches();
  useCheckLeadSlaBreaches({ enabled: canRunSlaCheck });
  const allStaff = staff?.data || [];
  const leads = data?.data || [];
  const breachedCount = leadBreaches?.data?.totalBreached ?? 0;
  const selectedLeads = useMemo(
    () => leads.filter((lead) => rowSelection[lead.id]),
    [leads, rowSelection],
  );
  const selectedLeadIds = useMemo(
    () => selectedLeads.map((lead) => lead.id),
    [selectedLeads],
  );
  const selectedCount = selectedLeadIds.length;

  const mergeGuard = useMemo(() => {
    if (selectedLeads.length < 2) {
      return {
        canMerge: false,
        reason: "Select at least two leads to merge.",
      };
    }

    const schoolIds = selectedLeads
      .map((lead) => lead.school?.id)
      .filter(Boolean) as string[];

    if (schoolIds.length !== selectedLeads.length) {
      return {
        canMerge: false,
        reason: "All selected leads must have a school.",
      };
    }

    if (new Set(schoolIds).size !== 1) {
      return {
        canMerge: false,
        reason: "Merge requires selected leads to share the same school.",
      };
    }

    return {
      canMerge: true,
      reason: "",
    };
  }, [selectedLeads]);

  const leadColumns = useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <div
            className="flex items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && "indeterminate")
              }
              onCheckedChange={(checked) =>
                table.toggleAllPageRowsSelected(checked === true)
              }
              aria-label="Select all leads on this page"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div
            className="flex items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(checked) =>
                row.toggleSelected(checked === true)
              }
              aria-label={`Select ${row.original.lead_name}`}
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      ...baseLeadColumns,
    ],
    [],
  );

  useEffect(() => {
    if (assignmentStateFilter !== "unassigned") return;
    if (assignedToFilter === "all") return;
    setAssignedToFilter("all");
  }, [assignmentStateFilter, assignedToFilter]);

  useEffect(() => {
    setRowSelection({});
  }, [
    pagination.pageIndex,
    pagination.pageSize,
    leadFilter,
    sourceFilter,
    provinceFilter,
    assignmentStateFilter,
    assignedToFilter,
    showBreachedOnly,
    debouncedSearchTerm,
  ]);

  useEffect(() => {
    if (selectedCount > 0) return;
    setAssignDialogOpen(false);
    setMergeDialogOpen(false);
  }, [selectedCount]);

  return (
    <div>
      <MyEnquiriesBanner />
      <PageHeader
        title="Leads"
        // Subtitle "Manage and track your sales leads" removed — the
        // breadcrumb (`Home › Leads`) and the list itself already
        // communicate what this page is. The subtitle string was one
        // full row of decorative text pushing every operational row
        // down.
        wide
        actions={
          <div className="flex gap-x-2">
            {canImportLeads && (
              <Button variant="outline" size="sm" onClick={() => setImportLeadsOpen(true)}>
                <Upload className="h-4 w-4 mr-1.5" />
                Import Leads
              </Button>
            )}
            <Button size="sm" asChild>
              <Link to="/leads/new">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Lead
              </Link>
            </Button>
          </div>
        }
      />
      {/* Full-width content shell. `space-y-4` was creating 16px
          gaps between SLA alert / tabs / card / filter row / table —
          four of those in a row stacked up to ~64px of empty space
          circled by the user. Tightened to `space-y-2` (8px) and the
          redundant wrapping Card was removed below so the filters and
          table sit right under the tabs instead of inside a
          double-framed box with its own padding + title. */}
      <section className="space-y-2 px-3 md:px-4 pb-4 pt-1">
        {breachedCount > 0 && !showBreachedOnly && (
          <PulsingAlert
            icon={Flame}
            title="SLA Breach Alert"
            description={`${breachedCount} lead${breachedCount > 1 ? "s" : ""} have exceeded their SLA and require immediate attention`}
            actions={
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBreachedOnly(true)}
              >
                Show Breached Leads
              </Button>
            }
          />
        )}
        {/* Tabs for lead filters */}
        <Tabs
          value={leadFilter}
          defaultValue={leadFilter}
          onValueChange={(value) => setLeadFilter(value as LeadStatus | "all")}
        >
          <TabsList>
            {[{ color: "#676767", name: "all" }, ...leadStatuses].map(
              (status) => (
                <TabsTrigger
                  key={status.name}
                  value={status.name}
                  className={
                    status.name === leadFilter
                      ? `border-b-2 border-[var(${status.color})]`
                      : ""
                  }
                >
                  {status.name === "all" ? "All Leads" : status.name}
                </TabsTrigger>
              ),
            )}
          </TabsList>
        </Tabs>

        {/* Kim's flow: on the New filter, a manager can kick off
            auto-assign for the freshly imported (unassigned, unworked)
            leads. It proposes only — approvals happen in the queue. */}
        {canImportLeads && leadFilter === "New" && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
            <Button
              size="sm"
              onClick={runAutoAssignFromNew}
              disabled={runAutoAssign.isPending}
              data-testid="new-filter-auto-assign"
            >
              {runAutoAssign.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" />
              )}
              Run auto-assign
            </Button>
            <span className="text-xs text-muted-foreground">
              Distributes new, unassigned leads by territory and workload —
              suggestions land in the Approval Queue for you to approve.
            </span>
          </div>
        )}

        {/* Was a `<Card>` wrapper with its own `<CardHeader>` that
            duplicated the currently-selected tab label ("All Leads",
            "Contacted Leads" etc.) and echoed the row count already
            visible in the pagination strip. That entire header block
            + the Card's default `py-4 px-4` contributed the biggest
            chunk of the dead space circled by the user. Filters and
            table now render directly inside the page section. The
            `space-y-6` that used to live on CardContent is preserved
            as a tighter `space-y-3` below so the filter row and
            table still breathe visually. */}
        {/* Counts row — spec'd as part of the management-control
            pass. "Total" is every lead in the DB the rep is allowed
            to see (ignores active filters), "Showing" is the count
            after the current filter/search/tab combination, "Selected"
            only appears while a bulk-action row is active. Total comes
            from a separate unfiltered query so it remains stable as
            the rep narrows the view. */}
        <LeadsCountBar
          totalCount={unfilteredTotalCount}
          filteredCount={data?.meta?.totalItems ?? 0}
          selectedCount={selectedCount}
        />

        <div className="space-y-3">
            <ContentFilter
              search={{
                onChange: setSearchTerm,
                value: searchTerm,
              }}
              selectableFilters={{
                align: "left",
                selectors: [
                  {
                    label: "Province",
                    value: provinceFilter,
                    onValueChange: (value: string) =>
                      setProvinceFilter(value as Province | "all"),
                    options: [
                      {
                        label: "All Provinces",
                        value: "all",
                      },
                      ...PROVINCES.map((province) => ({
                        label: province,
                        value: province,
                      })),
                    ],
                  },
                  {
                    label: "Source",
                    value: sourceFilter,
                    onValueChange: (value: string) =>
                      setSourceFilter(value as LeadSource | "all"),
                    options: [
                      {
                        label: "All Sources",
                        value: "all",
                      },
                      ...LEAD_SOURCES.map((source) => ({
                        label: source,
                        value: source,
                      })),
                    ],
                  },
                  {
                    label: "Assignment",
                    value: assignmentStateFilter,
                    onValueChange: (value: string) => {
                      const nextValue = value as AssignmentStateFilter;
                      setAssignmentStateFilter(nextValue);
                      if (nextValue === "unassigned") {
                        setAssignedToFilter("all");
                      }
                    },
                    options: [
                      {
                        label: "All Assignments",
                        value: "all",
                      },
                      {
                        label: "Assigned Only",
                        value: "assigned",
                      },
                      {
                        label: "Unassigned",
                        value: "unassigned",
                      },
                    ],
                  },
                  {
                    label: "Assigned To",
                    value: assignedToFilter,
                    onValueChange: (value: string) =>
                      setAssignedToFilter(value as string | "all"),
                    disabled: assignmentStateFilter === "unassigned",
                    options: [
                      {
                        label: "All Assignees",
                        value: "all",
                      },
                      ...allStaff
                        .filter((staff) => staff.is_active)
                        .map((staff) => ({
                          label: `${staff.first_name} ${staff.last_name}`,
                          value: staff.id,
                        })),
                    ],
                  },
                  {
                    label: "Temperature",
                    value: temperatureFilter,
                    onValueChange: (value: string) =>
                      setTemperatureFilter(value as "all" | "hot" | "warm" | "cold"),
                    options: [
                      { label: "All Temps", value: "all" },
                      { label: "🔴 Hot", value: "hot" },
                      { label: "🟡 Warm", value: "warm" },
                      { label: "🔵 Cold", value: "cold" },
                    ],
                  },
                ],
              }}
              actions={[
                {
                  position: "end",
                  component: (
                    <Label
                      htmlFor="lead-breached-only"
                      className="rounded-md border px-3 py-2"
                    >
                      <Switch
                        id="lead-breached-only"
                        checked={showBreachedOnly}
                        onCheckedChange={(checked) =>
                          setShowBreachedOnly(checked === true)
                        }
                      />
                      Breached only
                    </Label>
                  ),
                },
              ]}
            />

            {/* Content */}
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-destructive">
                Failed to load leads. Please try again.
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center py-12">
                <Target className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <p className="text-muted-foreground mt-2">No leads found</p>
                <p className="text-sm text-muted-foreground">
                  Add your first lead to get started
                </p>
                <Button asChild>
                  <Link to="/leads/new">
                    <Plus className="h-4 w-4" />
                    Add Lead
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedCount > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
                    <p className="text-sm font-medium">
                      {selectedCount} lead{selectedCount === 1 ? "" : "s"}{" "}
                      selected
                    </p>

                    <div className="flex items-center gap-2">
                      {selectedCount > 1 && !mergeGuard.canMerge && (
                        <p className="text-xs text-muted-foreground">
                          {mergeGuard.reason}
                        </p>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            Bulk actions
                            <ChevronDown className="ml-2 h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={!mergeGuard.canMerge}
                            onSelect={() => setMergeDialogOpen(true)}
                          >
                            <GitMerge className="mr-2 h-4 w-4" />
                            Merge leads
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!canAssignLeads}
                            onSelect={() => setAssignDialogOpen(true)}
                          >
                            <UserRoundPlus className="mr-2 h-4 w-4" />
                            Assign to
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRowSelection({})}
                      >
                        Clear selection
                      </Button>
                    </div>
                  </div>
                )}

                <DataTable
                  columns={leadColumns}
                  data={leads}
                  manualPagination
                  enablePagination
                  pageCount={data?.meta?.totalPages}
                  pageIndex={pagination.pageIndex}
                  pageSize={pagination.pageSize}
                  onPaginationChange={setPagination}
                  renderPagination={(table) => (
                    <DataTablePagination table={table} />
                  )}
                  getRowId={(row) => row.id}
                  enableRowSelection
                  rowSelection={rowSelection}
                  onRowSelectionChange={setRowSelection}
                  rowClassName={(row) =>
                    cn(row.original.sla_breached && "animate-pulse-breach")
                  }
                  onRowClick={(row) => navigate(`/leads/${row.original.id}`)}
                  emptyState={
                    <div className="text-center py-12">
                      <p className="text-muted-foreground mb-4">
                        No leads found
                      </p>
                      <Button asChild variant="outline">
                        <Link to="/leads/new">
                          <Plus className="h-4 w-4 mr-2" />
                          Create Your First Lead
                        </Link>
                      </Button>
                    </div>
                  }
                />
              </div>
            )}
        </div>
      </section>
      <AssignLeadsDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        leadIds={selectedLeadIds}
        leadSummaryText={`Selected ${selectedCount} lead${selectedCount === 1 ? "" : "s"}`}
        onSuccess={() => setRowSelection({})}
      />
      <MergeSelectedLeadsDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        selectedLeads={selectedLeads}
        onSuccess={() => setRowSelection({})}
      />
      <LeadsCsvImportModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
      />
      <ImportLeadsDialog
        open={importLeadsOpen}
        onOpenChange={setImportLeadsOpen}
      />
    </div>
  );
}
