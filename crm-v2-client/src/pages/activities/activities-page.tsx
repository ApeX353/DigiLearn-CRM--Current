import { useState } from "react";
import {
  Calendar,
  Plus,
  Search,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  useActivityList,
  type Activity,
  type ActivityType,
  ACTIVITY_TYPES,
} from "~/api/activities";
import { CreateActivityModal } from "~/components/activities/create-activity-modal";
import ActivityItem from "~/components/activity-item";
import { ActivityCalendarView } from "~/components/activities/activity-calendar-view";
import { ActivityInspectorSheet } from "~/components/activities/activity-inspector-sheet";
import { TYPE_CONFIG } from "~/data";
import { isDealReadonly, isLeadReadonly } from "~/stores/use-is-readonly";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useStaff } from "~/api/users";
import { useDebounce } from "~/hooks/use-debounce";
import { Autocomplete } from "~/components/ui/autocomplete";
import { usePermission } from "~/hooks/use-permission";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "~/components/ui/pagination";
import { cn } from "~/lib/utils";

export default function ActivitiesPage() {
  const canManageActivities = usePermission("Activity", "manage");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [repFilter, setRepFilter] = useState<string>("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"timeline" | "calendar">("timeline");
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");
  const [page, setPage] = useState(1);

  const debouncedStaffSearch = useDebounce(staffSearch, 700);

  const {
    data: activitiesData,
    isLoading,
    refetch,
  } = useActivityList({
    limit: 50,
    page,
    type: typeFilter !== "all" ? (typeFilter as ActivityType) : undefined,
    include_details: true,
    assigned_to_id: repFilter === "all" ? undefined : repFilter,
  });

  const { data: staffData, isLoading: isLoadingStaff } = useStaff({
    page: 1,
    limit: 15,
    search: debouncedStaffSearch,
    status: "active",
  });

  const activities = activitiesData?.data || [];
  const staff = staffData?.data || [];
    const meta = activitiesData?.meta;
  const totalPages = meta?.totalPages ?? 1;

   const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("ellipsis");
      for (
        let i = Math.max(2, page - 1);
        i <= Math.min(totalPages - 1, page + 1);
        i++
      ) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };

  const filteredActivities = activities.filter((activity) => {
    const matchesSearch = activity.subject
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesSearch;
  });
  const selectedActivityReadonly =
    isLeadReadonly(selectedActivity?.lead?.status) ||
    isDealReadonly(
      selectedActivity?.deal?.closeStatus ||
        (selectedActivity?.deal as { close_status?: string } | undefined)
          ?.close_status ||
        (selectedActivity?.deal as { status?: string } | undefined)?.status,
    );

  const handleActivityClick = (activity: Activity) => {
    setSelectedActivity(activity);
    setDetailsOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Activities"
        subtitle="Track all interactions and activities"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Log Activity
            </Button>
          </div>
        }
      />

      <Container className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Activity Timeline</CardTitle>
              <CardDescription>
                {filteredActivities.length} activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center mb-6">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search activities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {canManageActivities && (
                  <div>
                    <Autocomplete
                      value={repFilter}
                      options={[
                        { label: "All Sales Rep", value: "all" },
                        ...staff.map((rep) => ({
                          label: `${rep.first_name} ${rep.last_name}`,
                          value: rep.id,
                        })),
                      ]}
                      onValueChange={setRepFilter}
                      onSearchChange={setStaffSearch}
                      searchValue={staffSearch}
                      isLoading={isLoadingStaff}
                      emptyText="No Sale Rep of Staff found"
                      placeholder="All Staff/ Reps"
                    />
                  </div>
                )}
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-45">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {ACTIVITY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {TYPE_CONFIG[type].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Tabs
                value={viewMode}
                onValueChange={(value) =>
                  setViewMode(value as "timeline" | "calendar")
                }
                className="w-full"
              >
                <TabsList className="mb-4">
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="calendar">Calendar</TabsTrigger>
                </TabsList>

                <TabsContent value="timeline">
                  {filteredActivities.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No activities found</p>
                      <p className="text-sm mt-1">
                        Log your first activity to get started
                      </p>
                    </div>
                  ) : (
                    <div className="relative space-y-4">
                      <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />

                      {filteredActivities.map((activity) => {
                        return (
                          <ActivityItem
                            key={activity.id}
                            activity={activity}
                            dealId={activity.deal_id}
                            onClick={handleActivityClick}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="mt-6 w-full flex items-center gap-x-4">
                      <div>
                        <p className="text-center text-sm text-muted-foreground mt-2">
                          Page {page} of {totalPages} ({meta?.totalItems} tasks)
                        </p>
                      </div>
                      <div className="ml-auto">
                        <Pagination>
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious
                                onClick={() =>
                                  setPage((p) => Math.max(1, p - 1))
                                }
                                className={cn(
                                  "cursor-pointer",
                                  page === 1 &&
                                    "pointer-events-none opacity-50",
                                )}
                              />
                            </PaginationItem>
                            {getPageNumbers().map((p, i) =>
                              p === "ellipsis" ? (
                                <PaginationItem key={`ellipsis-${i}`}>
                                  <PaginationEllipsis />
                                </PaginationItem>
                              ) : (
                                <PaginationItem key={p}>
                                  <PaginationLink
                                    isActive={page === p}
                                    onClick={() => setPage(p)}
                                    className="cursor-pointer"
                                  >
                                    {p}
                                  </PaginationLink>
                                </PaginationItem>
                              ),
                            )}
                            <PaginationItem>
                              <PaginationNext
                                onClick={() =>
                                  setPage((p) => Math.min(totalPages, p + 1))
                                }
                                className={cn(
                                  "cursor-pointer",
                                  page === totalPages &&
                                    "pointer-events-none opacity-50",
                                )}
                              />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="calendar">
                  {filteredActivities.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No activities found</p>
                      <p className="text-sm mt-1">
                        Meetings and tasks with schedules will appear here.
                      </p>
                    </div>
                  ) : (
                    <ActivityCalendarView
                      activities={filteredActivities}
                      onActivityClick={handleActivityClick}
                    />
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </Container>

      <CreateActivityModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />

      <ActivityInspectorSheet
        activity={selectedActivity}
        open={detailsOpen}
        isReadonly={selectedActivityReadonly}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setSelectedActivity(null);
          }
        }}
      />
    </div>
  );
}
