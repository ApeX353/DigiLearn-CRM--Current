import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Plus,
  Search,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "~/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";
import {
  ACTIVITY_TYPES,
  type Activity,
  type ActivityType,
  useActivityList,
} from "~/api/activities";
import ActivityItem from "~/components/activity-item";
import { ActivityCalendarView } from "~/components/activities/activity-calendar-view";
import { ActivityInspectorSheet } from "~/components/activities/activity-inspector-sheet";
import { TYPE_CONFIG } from "~/data";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/components/ui/tabs";

interface DealActivitiesTabProps {
  dealId: string;
  leadId?: string;
  onLogActivity: () => void;
  isReadonly?: boolean;
}


const getPages = (current: number, total: number) => {
  if (total <= 6) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push("ellipsis");
  for (let i = start; i <= end; i += 1) {
    pages.push(i);
  }
  if (end < total - 1) pages.push("ellipsis");
  pages.push(total);
  return pages;
};

export function DealActivitiesTab({
  dealId,
  leadId,
  onLogActivity,
  isReadonly = false,
}: DealActivitiesTabProps) {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [includeLead, setIncludeLead] = useState(Boolean(leadId));
  const [viewMode, setViewMode] = useState<"timeline" | "calendar">("timeline");
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, searchQuery, includeLead, dealId]);

  const { data, isLoading } = useActivityList({
    page,
    limit: 10,
    deal_id: dealId,
    lead_id: includeLead ? leadId : undefined,
    type: typeFilter !== "all" ? (typeFilter as ActivityType) : undefined,
    search: searchQuery.trim() || undefined,
  });

  const activities = data?.data || [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const pageItems = useMemo(
    () => getPages(page, totalPages),
    [page, totalPages],
  );

  const handleActivityClick = (activity: Activity) => {
    setSelectedActivity(activity);
    setDetailsOpen(true);
  };


  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Activities</CardTitle>
            <CardDescription>
              {meta?.totalItems ?? activities.length} total activities
            </CardDescription>
          </div>
          <Button size="sm" onClick={onLogActivity} disabled={isReadonly}>
            <Plus className="mr-2 h-4 w-4" />
            Log Activity
          </Button>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search activities..."
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44">
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
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch
                checked={includeLead}
                onCheckedChange={setIncludeLead}
                disabled={!leadId}
              />
              Include lead activities
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            Loading activities...
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
              {activities.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  No activities yet.
                </div>
              ) : (
                <div className="relative space-y-4">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  {activities.map((activity) => {
                    return (
                      <ActivityItem
                        key={activity.id}
                        activity={activity}
                        dealId={dealId}
                        onClick={handleActivityClick}
                      />
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="calendar">
              {activities.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No activities found</p>
                  <p className="text-sm mt-1">
                    Meetings and tasks with schedules will appear here.
                  </p>
                </div>
              ) : (
                <ActivityCalendarView
                  activities={activities}
                  onActivityClick={handleActivityClick}
                />
              )}
            </TabsContent>
          </Tabs>
        )}

        {totalPages > 1 && (
          <Pagination className="mt-6">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    setPage((prev) => Math.max(1, prev - 1));
                  }}
                  className={cn(page === 1 && "pointer-events-none opacity-50")}
                />
              </PaginationItem>
              {pageItems.map((item, index) => (
                <PaginationItem key={`${item}-${index}`}>
                  {item === "ellipsis" ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      isActive={item === page}
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setPage(item);
                      }}
                    >
                      {item}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    setPage((prev) => Math.min(totalPages, prev + 1));
                  }}
                  className={cn(
                    page === totalPages && "pointer-events-none opacity-50",
                  )}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </CardContent>

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
    </Card>
  );
}
