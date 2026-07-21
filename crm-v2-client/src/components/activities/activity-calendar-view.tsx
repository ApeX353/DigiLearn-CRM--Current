import { useMemo, useState } from "react";
import { format, isSameDay, startOfDay } from "date-fns";
import { CalendarClock } from "lucide-react";
import type { Activity } from "~/api/activities";
import { Badge } from "~/components/ui/badge";
import { Calendar } from "~/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { TYPE_CONFIG } from "~/data";
import { cn } from "~/lib/utils";

interface ActivityCalendarViewProps {
  activities: Activity[];
  onActivityClick?: (activity: Activity) => void;
}

interface CalendarActivityItem {
  activity: Activity;
  eventDate: Date;
}

const schedulableTypes = new Set<Activity["type"]>(["meeting", "task"]);

function resolveActivityDate(activity: Activity): Date | null {
  const rawDate =
    activity.type === "meeting"
      ? activity.meeting?.start_time || activity.scheduled_at || activity.due_at
      : activity.due_at || activity.scheduled_at;

  if (!rawDate) {
    return null;
  }

  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function ActivityCalendarView({
  activities,
  onActivityClick,
}: ActivityCalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [month, setMonth] = useState<Date>(new Date());

  const schedulableActivities = useMemo<CalendarActivityItem[]>(() => {
    return activities
      .filter((activity) => schedulableTypes.has(activity.type))
      .map((activity) => {
        const eventDate = resolveActivityDate(activity);
        return eventDate ? { activity, eventDate } : null;
      })
      .filter((value): value is CalendarActivityItem => Boolean(value))
      .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
  }, [activities]);

  const scheduledDates = useMemo(() => {
    const dedupedTimestamps = new Set(
      schedulableActivities.map((item) => startOfDay(item.eventDate).getTime()),
    );

    return Array.from(dedupedTimestamps).map((timestamp) => new Date(timestamp));
  }, [schedulableActivities]);

  const selectedDayActivities = useMemo(
    () =>
      schedulableActivities.filter((item) =>
        isSameDay(item.eventDate, selectedDate),
      ),
    [schedulableActivities, selectedDate],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calendar</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Calendar
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={selectedDate}
            onSelect={(date) => {
              if (date) {
                setSelectedDate(date);
              }
            }}
            modifiers={{ hasEvents: scheduledDates }}
            modifiersClassNames={{
              hasEvents:
                "bg-primary/10 text-primary font-semibold hover:bg-primary/15",
            }}
            className="w-full"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Meetings and tasks with a scheduled or due date are highlighted.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {format(selectedDate, "EEEE, MMM d")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {selectedDayActivities.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No scheduled meetings or tasks on this day.
            </div>
          ) : (
            selectedDayActivities.map(({ activity, eventDate }) => {
              const typeConfig = TYPE_CONFIG[activity.type];
              const Icon = typeConfig.icon;

              return (
                <button
                  key={activity.id}
                  type="button"
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/30",
                    onActivityClick ? "cursor-pointer" : "cursor-default",
                  )}
                  onClick={() => onActivityClick?.(activity)}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{activity.subject}</p>
                    </div>
                    <Badge variant="outline">{typeConfig.label}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    <span>{format(eventDate, "h:mm a")}</span>
                    <span>•</span>
                    <span>{activity.status.replace(/_/g, " ")}</span>
                  </div>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
