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
  Target,
  Upload,
  UserRoundPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { format } from "date-fns";
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
import Container from "~/components/container";
import ContentFilter from "~/components/content-filter";
import { DataTable } from "~/components/data-table";
import { DataTablePagination } from "~/components/data-table-pagination";
import { AssignLeadsDialog } from "~/components/leads/assign-leads-dialog";
import { LeadsCsvImportModal } from "~/components/leads/leads-csv-import-modal";
import { MergeSelectedLeadsDialog } from "~/components/leads/merge-selected-leads-dialog";
import PageHeader from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
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

const baseLeadColumns: ColumnDef<Lead>[] = [
  {
    accessorKey: "lead_name",
    header: "Lead Name",
    cell: ({ row }) => (
      <>
        <Link
          to={`/leads/${row.original.id}`}
          className="font-medium hover:underline text-primary"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.lead_name}
        </Link>
        <p className="text-xs text-muted-foreground">
          Added&nbsp;{format(row.original.created_at, "MMM, dd")}
        </p>
      </>
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
      <div className="text-sm">
        <Link
          to={`/schools/${row.original.school?.id}`}
          className="font-medium hover:underline text-primary"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.school?.name || "-"}
        </Link>
        <p>{row.original.school?.province || "-"}</p>
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
        <div className="text-sm">
          <div className="font-medium">
            {contact.first_name} {contact.last_name}
          </div>
          <div className="text-muted-foreground">{contact.phone}</div>
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
  const [searchTerm, setSearchTerm] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const debouncedSearchTerm = useDebounce(searchTerm, 700);

  const navigate = useNavigate();
  const canAssignLeads = useAnyRole(["admin", "sales_manager"]);
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
    assigned_to: assignedToFilter === "all" ? undefined : assignedToFilter,
    search: debouncedSearchTerm,
  });
  const { data: staff } = useAllStaff({
    page: 1,
    limit: 15,
    search: "",
    status: "all",
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
      <PageHeader
        title="Leads"
        subtitle="Manage and track your sales leads"
        actions={
          <div className="flex gap-x-2">
            <Button variant="outline" onClick={() => setImportModalOpen(true)}>
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <Button asChild>
              <Link to="/leads/new">
                <Plus className="h-4 w-4" />
                Add Lead
              </Link>
            </Button>
          </div>
        }
      />
      <Container className="space-y-6 p-4">
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

        <Card>
          <CardHeader>
            <CardTitle>
              {leadFilter === "New"
                ? "Open Leads"
                : leadFilter === "Contacted"
                  ? "Contacted Leads"
                  : leadFilter === "Qualified"
                    ? "Qualified Leads"
                    : leadFilter === "Nurture"
                      ? "Nurtured Leads"
                      : leadFilter === "Disqualified"
                        ? "Disqualified Leads"
                        : leadFilter === "Converted"
                          ? "Converted Leads"
                          : "All Leads"}
            </CardTitle>
            <CardDescription>{leads.length} leads found</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
                      ...allStaff.map((staff) => ({
                        label: `${staff.first_name} ${staff.last_name}`,
                        value: staff.id,
                      })),
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
          </CardContent>
        </Card>
      </Container>
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
    </div>
  );
}
