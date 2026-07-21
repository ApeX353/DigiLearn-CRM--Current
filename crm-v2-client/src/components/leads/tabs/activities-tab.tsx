import { useState } from "react";
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
import type { Lead } from "~/api/leads";
import {
  useActivityList,
  useLeadActivityStats,
  type ActivityType,
  ACTIVITY_TYPES,
} from "~/api/activities";
import { CreateActivityModal } from "~/components/activities/create-activity-modal";
import ActivityItem from "~/components/activity-item";
import { TYPE_CONFIG } from "~/data";

interface ActivitiesTabProps {
  lead: Lead;
}


export function ActivitiesTab({ lead }: ActivitiesTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [defaultActivityType, setDefaultActivityType] =
    useState<ActivityType>("note");

  const {
    data: activitiesData,
    isLoading,
    refetch,
  } = useActivityList({
    page: 1,
    lead_id: lead.id,
    limit: 50,
    type: typeFilter !== "all" ? (typeFilter as ActivityType) : undefined,
  });

  const { data: stats } = useLeadActivityStats(lead.id);

  const activities = activitiesData?.data || [];

  const filteredActivities = activities.filter((activity) => {
    const matchesSearch = activity.subject
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const openCreateModal = (type: ActivityType) => {
    setDefaultActivityType(type);
    setCreateModalOpen(true);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: Manager Glance KPIs */}
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

      {/* Right: Log Activity Form + Feed */}
      <div className="lg:col-span-2 space-y-4">
        {/* Quick Stats */}
    

        {/* Activity Timeline */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Activity Timeline</CardTitle>
                <CardDescription>
                  {filteredActivities.length} activities
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button onClick={() => openCreateModal("note")}>
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
            ) : filteredActivities.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">
                  No activities recorded yet
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Activities such as calls, emails, and meetings will appear
                  here
                </p>
                <Button onClick={() => openCreateModal("note")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Log First Activity
                </Button>
              </div>
            ) : (
              <div className="relative space-y-4">
                <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />

                {filteredActivities.map((activity) => {
                  return <ActivityItem key={activity.id} activity={activity} />;
                  // return (
                  //   <div
                  //     key={activity.id}
                  //     className="relative flex gap-4 pl-12"
                  //   >
                  //     <div
                  //       className={`absolute left-3 flex h-6 w-6 items-center justify-center rounded-full ${config?.className || "bg-muted"}`}
                  //     >
                  //       <Icon className="h-3 w-3" />
                  //     </div>

                  //     <Card className="flex-1">
                  //       <CardContent className="p-4">
                  //         <div className="flex items-start justify-between gap-4">
                  //           <div className="flex-1">
                  //             <div className="flex items-center gap-2 mb-1">
                  //               <span className="font-medium">
                  //                 {activity.subject}
                  //               </span>
                  //               <Badge variant="secondary" className="text-xs">
                  //                 {config?.label || activity.type}
                  //               </Badge>
                  //               {activity.is_pinned && (
                  //                 <Badge variant="outline" className="text-xs">
                  //                   Pinned
                  //                 </Badge>
                  //               )}
                  //               {activity.status && (
                  //                 <Badge
                  //                   variant={
                  //                     activity.status === "completed"
                  //                       ? "default"
                  //                       : "secondary"
                  //                   }
                  //                   className="text-xs"
                  //                 >
                  //                   {activity.status}
                  //                 </Badge>
                  //               )}
                  //             </div>
                  //             {activity.description && (
                  //               <p className="text-sm text-muted-foreground mb-2">
                  //                 {activity.description}
                  //               </p>
                  //             )}
                  //             {/* Type-specific details */}
                  //             {activity.type === "call" && activity.call && (
                  //               <div className="text-xs text-muted-foreground mb-2">
                  //                 <span className="font-medium">
                  //                   {activity.call.phone_number}
                  //                 </span>
                  //                 {activity.call.outcome && (
                  //                   <span className="ml-2">
                  //                     - {activity.call.outcome.replace("_", " ")}
                  //                   </span>
                  //                 )}
                  //                 {activity.call.duration && (
                  //                   <span className="ml-2">
                  //                     ({activity.call.duration} min)
                  //                   </span>
                  //                 )}
                  //               </div>
                  //             )}
                  //             {activity.type === "meeting" && activity.meeting && (
                  //               <div className="text-xs text-muted-foreground mb-2">
                  //                 <span className="font-medium">
                  //                   {activity.meeting.title}
                  //                 </span>
                  //                 <span className="ml-2">
                  //                   - {activity.meeting.platform}
                  //                 </span>
                  //                 {activity.meeting.location && (
                  //                   <span className="ml-2">
                  //                     @ {activity.meeting.location}
                  //                   </span>
                  //                 )}
                  //               </div>
                  //             )}
                  //             {activity.type === "note" && activity.note && (
                  //               <p className="text-sm text-muted-foreground mb-2 whitespace-pre-wrap">
                  //                 {activity.note.content}
                  //               </p>
                  //             )}
                  //             <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  //               <span>
                  //                 {format(
                  //                   new Date(activity.created_at),
                  //                   "MMM dd, yyyy h:mm a",
                  //                 )}
                  //               </span>
                  //               {activity.assigned_to && (
                  //                 <span>
                  //                   by {activity.assigned_to.first_name}{" "}
                  //                   {activity.assigned_to.last_name}
                  //                 </span>
                  //               )}
                  //             </div>
                  //           </div>
                  //         </div>
                  //       </CardContent>
                  //     </Card>
                  //   </div>
                  // );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <CreateActivityModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          leadId={lead.id}
          defaultType={defaultActivityType}
        />
      </div>
    </div>
  );
}
