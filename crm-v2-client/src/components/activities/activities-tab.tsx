import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Calendar,
  Plus,
  Search,
  Loader2,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import {
  useActivityList,
  useLeadActivityStats,
  type Activity,
  type ActivityType,
  ACTIVITY_TYPES,
} from "~/api/activities";
import { CreateActivityModal } from "~/components/activities/create-activity-modal";
import ActivityItem from "../activity-item";
import { ActivityCalendarView } from "~/components/activities/activity-calendar-view";
import { ActivityInspectorSheet } from "~/components/activities/activity-inspector-sheet";
import { TYPE_CONFIG } from "~/data";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/components/ui/tabs";

interface ActivitiesTabProps {
  leadId?: string;
  dealId?: string;
  leadIdFromDeal?: string; // The original lead ID if this is a deal
  isReadonly?: boolean;
}


export function ActivitiesTab({
  leadId,
  dealId,
  leadIdFromDeal,
  isReadonly = false,
}: ActivitiesTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [defaultActivityType, setDefaultActivityType] =
    useState<ActivityType>("note");
  const [viewMode, setViewMode] = useState<"timeline" | "calendar">("timeline");
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Fetch activities for the current entity (lead or deal)
  const {
    data: currentActivitiesData,
    isLoading: isLoadingCurrent,
    refetch: refetchCurrent,
  } = useActivityList({
    page: 1,
    lead_id: leadId,
    deal_id: dealId,
    limit: 50,
    type: typeFilter !== "all" ? (typeFilter as ActivityType) : undefined,
  });

  // Fetch activities from the original lead if this is a deal
  const {
    data: inheritedActivitiesData,
    isLoading: isLoadingInherited,
    refetch: refetchInherited,
  } = useActivityList({
    page: 1,
    lead_id: leadIdFromDeal,
    limit: 50,
    type: typeFilter !== "all" ? (typeFilter as ActivityType) : undefined,
    enabled: !!leadIdFromDeal,
  });

  // Fetch stats (only for leads)
  const { data: stats } = useLeadActivityStats(leadId || "");

  const isLoading = isLoadingCurrent || isLoadingInherited;

  // Combine and mark activities
  const allActivities = useMemo(() => {
    const current = (currentActivitiesData?.data || []).map((activity) => ({
      ...activity,
      isFromLead: false,
    }));

    const inherited = (inheritedActivitiesData?.data || []).map((activity) => ({
      ...activity,
      isFromLead: true,
    }));

    return [...current, ...inherited].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [currentActivitiesData, inheritedActivitiesData]);

  const filteredActivities = allActivities.filter((activity) => {
    const matchesSearch = activity.subject
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const openCreateModal = (type: ActivityType) => {
    if (isReadonly) return;
    setDefaultActivityType(type);
    setCreateModalOpen(true);
  };

  const handleActivityClick = (activity: Activity) => {
    setSelectedActivity(activity);
    setDetailsOpen(true);
  };

  const handleRefetch = () => {
    refetchCurrent();
    if (leadIdFromDeal) {
      refetchInherited();
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: Manager Glance KPIs (only for leads) */}
      {leadId && !dealId && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Manager Glance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stale Badge */}
              {stats?.isStale && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Stale - No activity in 7 days
                  </span>
                </div>
              )}

              {/* KPI Grid */}
              <div className="grid gap-3">
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">
                    Touches (7d)
                  </span>
                  <span className="text-lg font-semibold">
                    {stats?.touchesLast7Days ?? 0}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">
                    Time to 1st Touch
                  </span>
                  <span className="text-lg font-semibold">
                    {stats?.timeToFirstTouch != null
                      ? `${stats.timeToFirstTouch}h`
                      : "—"}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">
                    Meetings Booked
                  </span>
                  <span className="text-lg font-semibold">
                    {stats?.meetingsBookedCount ?? 0}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">
                    Incomplete Logs
                  </span>
                  <span
                    className={`text-lg font-semibold ${(stats?.incompleteLogsCount ?? 0) > 0 ? "text-amber-600" : ""}`}
                  >
                    {stats?.incompleteLogsCount ?? 0}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Guardrails Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Guardrails</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>• New → Contacted requires ≥1 activity</p>
              <p>• All activities (except Note) require Next Step + Due Date</p>
              <p>• "Stale" shows after 7 days of inactivity</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Right: Activity Feed */}
      <div
        className={
          leadId && !dealId
            ? "lg:col-span-2 space-y-4"
            : "lg:col-span-3 space-y-4"
        }
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Activity Timeline</CardTitle>
                <CardDescription>
                  {filteredActivities.length} activities
                  {leadIdFromDeal &&
                    ` (${allActivities.filter((a) => a.isFromLead).length} from original lead)`}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={handleRefetch}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => openCreateModal("note")}
                  disabled={isReadonly}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Log Activity
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
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

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
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
                    <div className="text-center py-12">
                      <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground mb-2">
                        No activities recorded yet
                      </p>
                      <p className="text-sm text-muted-foreground mb-4">
                        Activities such as calls, emails, and meetings will
                        appear here
                      </p>
                      <Button
                        onClick={() => openCreateModal("note")}
                        disabled={isReadonly}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Log First Activity
                      </Button>
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
            )}
          </CardContent>
        </Card>

        <CreateActivityModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          leadId={leadId}
          dealId={dealId}
          defaultType={defaultActivityType}
          isReadonly={isReadonly}
        />

        <ActivityInspectorSheet
          activity={selectedActivity}
          open={detailsOpen}
          isReadonly={isReadonly}
          onOpenChange={(open) => {
            setDetailsOpen(open);
            if (!open) {
              setSelectedActivity(null);
            }
          }}
        />
      </div>
    </div>
  );
}
