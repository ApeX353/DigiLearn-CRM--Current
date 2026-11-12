import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { AlertTriangle, Calendar, Clock, ArrowRight } from "lucide-react";
import { useNurtureFollowUps } from "~/api/dashboard";
import type { DashboardFilters } from "~/api/dashboard";
import { useNavigate } from "react-router";
import { format, isPast, isToday, isTomorrow, differenceInDays } from "date-fns";

interface NurtureFollowUpsWidgetProps {
  filters: DashboardFilters;
}

export function NurtureFollowUpsWidget({
  filters,
}: NurtureFollowUpsWidgetProps) {
  const navigate = useNavigate();
  const { data: responseData, isLoading, error } = useNurtureFollowUps(filters);
  const data = responseData?.data;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Nurture Follow-ups
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm font-medium text-destructive">
            Follow-up data unavailable
          </p>
          <p className="text-xs text-muted-foreground">
            Could not load upcoming actionable follow-ups for the selected
            filters.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Nurture Follow-ups
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No follow-up data returned for the selected filters.
        </CardContent>
      </Card>
    );
  }

  const activities = Array.isArray(data?.overdueActivities) ? data.overdueActivities : [];
  const totalOverdue = data?.overdueCount || 0;
  const totalDueToday = data?.dueToday || 0;
  const totalDueIn7Days = data?.dueIn7Days || 0;

  const getFollowUpBadge = (dateStr: string | null) => {
    if (!dateStr) return <Badge variant="outline">No date</Badge>;

    const date = new Date(dateStr);
    if (isPast(date) && !isToday(date)) {
      return <Badge variant="destructive">Overdue</Badge>;
    }
    if (isToday(date)) {
      return <Badge variant="default">Today</Badge>;
    }
    if (isTomorrow(date)) {
      return <Badge variant="secondary">Tomorrow</Badge>;
    }
    const days = differenceInDays(date, new Date());
    return <Badge variant="outline">{days} days</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Nurture Follow-ups
          </div>
          <Badge variant="secondary">
            {totalOverdue + totalDueToday + totalDueIn7Days} pending
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No overdue follow-ups</p>
            <p className="mt-1 text-xs">
              This list only includes actionable tasks, calls, emails,
              meetings, or WhatsApp follow-ups. Notes do not count as next
              actions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.slice(0, 5).map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between p-2 rounded-lg"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {activity.leadName || activity.subject}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {activity.dueAt && format(new Date(activity.dueAt), 'MMM d, yyyy')}
                    {activity.assigneeName && ` • ${activity.assigneeName}`}
                  </div>
                </div>
                {activity.dueAt && getFollowUpBadge(activity.dueAt)}
              </div>
            ))}

            {/* FU2: link to the overdue follow-up WORK QUEUE (Activities),
                not the Nurture leads list, and show the true server total
                (which FU1 now reports uncapped) rather than the ≤5 preview
                length. */}
            {totalOverdue > 5 && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate('/activities?period=overdue')}
              >
                View all {totalOverdue} follow-ups
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
