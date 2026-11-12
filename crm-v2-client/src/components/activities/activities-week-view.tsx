/**
 * Week-grid scheduler for the Activities page.
 *
 * Layout:
 *   - 7-column day grid (Mon → Sun) with a fixed time gutter on the
 *     left, hours 7am → 7pm. Pipedrive-style; gives reps a working
 *     day at-a-glance without scrolling.
 *   - "All-day / no-time" lane sits above the grid for activities
 *     whose due_at is midnight or whose only timestamp is a date.
 *   - Activity blocks are coloured by type and tinted by due-state
 *     (overdue red ring / today emerald ring) so a missed slot is
 *     instantly visible.
 *   - Today's column gets a subtle accent + a horizontal "now" line.
 *
 * The grid does NOT own date-range filters — it just renders whatever
 * activities the parent page resolved for the current visible window.
 * That keeps the type-chip / assignee / period filters working
 * identically across the list and the calendar.
 */
import { useMemo } from "react";
import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Activity } from "~/api/activities";
import { Button } from "~/components/ui/button";
import {
  activityColor,
  activityColorClasses,
} from "~/lib/activity-state";
import {
  getActivityChip,
  getActivityIcon,
} from "~/lib/activity-visuals";
import { cn } from "~/lib/utils";

const WEEK_OPTIONS = { weekStartsOn: 1 as const }; // Monday-first
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;
const ROW_PIXELS = 28; // height of one half-hour row
const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i,
);

interface ActivitiesWeekViewProps {
  weekAnchor: Date;
  onWeekAnchorChange: (date: Date) => void;
  activities: Activity[];
  onActivityClick: (activity: Activity) => void;
}

interface PlacedActivity {
  activity: Activity;
  dayIndex: number;
  /** Pixel offset from the top of the time grid. */
  topPx: number;
  /** Pixel height — capped so very long blocks stop at end of grid. */
  heightPx: number;
}

function activityDate(activity: Activity): Date | null {
  const raw =
    activity.type === "meeting"
      ? activity.meeting?.start_time ??
        activity.scheduled_at ??
        activity.due_at
      : activity.due_at ?? activity.scheduled_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isAllDay(d: Date): boolean {
  // Midnight-on-the-dot stands in for "all day / no time" — matches
  // the convention the rest of the app uses (date-only inputs land
  // on T00:00:00).
  return d.getHours() === 0 && d.getMinutes() === 0;
}

export function ActivitiesWeekView({
  weekAnchor,
  onWeekAnchorChange,
  activities,
  onActivityClick,
}: ActivitiesWeekViewProps) {
  const weekStart = useMemo(
    () => startOfWeek(weekAnchor, WEEK_OPTIONS),
    [weekAnchor],
  );
  const weekEnd = useMemo(
    () => endOfWeek(weekAnchor, WEEK_OPTIONS),
    [weekAnchor],
  );
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const inWeek = useMemo(
    () =>
      activities.filter((a) => {
        const d = activityDate(a);
        if (!d) return false;
        return d >= weekStart && d <= weekEnd;
      }),
    [activities, weekStart, weekEnd],
  );

  // Split into all-day vs timed.
  const { allDayByDay, timedPlaced } = useMemo(() => {
    const allDayMap = new Map<number, Activity[]>();
    const timed: PlacedActivity[] = [];
    for (const activity of inWeek) {
      const d = activityDate(activity)!;
      const dayIndex = days.findIndex((day) => isSameDay(day, d));
      if (dayIndex < 0) continue;
      if (isAllDay(d)) {
        const list = allDayMap.get(dayIndex) ?? [];
        list.push(activity);
        allDayMap.set(dayIndex, list);
      } else {
        const minutesFromGridStart =
          (d.getHours() - DAY_START_HOUR) * 60 + d.getMinutes();
        const topPx = Math.max(0, (minutesFromGridStart / 30) * ROW_PIXELS);
        const durationMins = activity.duration && activity.duration > 0
          ? activity.duration
          : 30;
        const heightPx = Math.max(20, (durationMins / 30) * ROW_PIXELS);
        timed.push({ activity, dayIndex, topPx, heightPx });
      }
    }
    return { allDayByDay: allDayMap, timedPlaced: timed };
  }, [inWeek, days]);

  const now = new Date();
  const todayIndex = days.findIndex((d) => isSameDay(d, now));
  const nowOffsetPx =
    todayIndex >= 0
      ? ((now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes()) / 30 *
        ROW_PIXELS
      : null;

  const goPrev = () => onWeekAnchorChange(addWeeks(weekAnchor, -1));
  const goNext = () => onWeekAnchorChange(addWeeks(weekAnchor, 1));
  const goToday = () => onWeekAnchorChange(new Date());

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      {/* Calendar toolbar */}
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={goPrev} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={goToday}>
            Today
          </Button>
          <Button size="icon" variant="ghost" onClick={goNext} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-sm font-semibold">
          {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
        </div>
        <div className="text-xs text-muted-foreground">
          {inWeek.length} {inWeek.length === 1 ? "activity" : "activities"} this week
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b bg-background text-xs">
        <div className="border-r" />
        {days.map((d, i) => {
          const isToday = isSameDay(d, now);
          return (
            <div
              key={i}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 border-r px-1 py-2 last:border-r-0",
                isToday && "bg-primary/5 text-primary",
              )}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {format(d, "EEE")}
              </div>
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold",
                  isToday && "bg-primary text-primary-foreground",
                )}
              >
                {format(d, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day lane */}
      {Array.from(allDayByDay.values()).some((arr) => arr.length > 0) && (
        <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b bg-background">
          <div className="border-r px-1 py-1 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
            All-day
          </div>
          {days.map((_, i) => (
            <div
              key={i}
              className={cn(
                "min-h-[36px] border-r p-1 last:border-r-0 space-y-1",
              )}
            >
              {(allDayByDay.get(i) ?? []).map((a) => (
                <ActivityBlock
                  key={a.id}
                  activity={a}
                  onClick={onActivityClick}
                  variant="allday"
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Time grid */}
      <div className="relative grid grid-cols-[60px_repeat(7,minmax(0,1fr))] bg-background">
        {/* Time gutter */}
        <div>
          {HOURS.map((h) => (
            <div
              key={h}
              className="flex h-14 items-start justify-end border-r border-t pr-2 pt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
            >
              {format(new Date().setHours(h, 0, 0, 0), "h a")}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d, dayIdx) => {
          const isToday = isSameDay(d, now);
          return (
            <div
              key={dayIdx}
              className={cn(
                "relative border-r last:border-r-0",
                isToday && "bg-primary/[0.03]",
              )}
              style={{ height: HOURS.length * 2 * ROW_PIXELS }}
            >
              {/* Half-hour grid lines */}
              {HOURS.map((h, idx) => (
                <div key={h} className="border-t" style={{ height: ROW_PIXELS * 2 }}>
                  <div
                    className={cn(
                      "h-1/2 border-b border-dashed border-muted/40",
                      idx === HOURS.length - 1 && "border-b-0",
                    )}
                  />
                </div>
              ))}

              {/* Now-line (only on today's column) */}
              {isToday && nowOffsetPx !== null && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
                  style={{ top: nowOffsetPx }}
                >
                  <div className="h-2 w-2 rounded-full bg-red-500 -ml-1" />
                  <div className="h-px flex-1 bg-red-500" />
                </div>
              )}

              {/* Timed activities for this day */}
              {timedPlaced
                .filter((p) => p.dayIndex === dayIdx)
                .map((p) => (
                  <div
                    key={p.activity.id}
                    className="absolute left-1 right-1"
                    style={{
                      top: p.topPx,
                      height: p.heightPx,
                    }}
                  >
                    <ActivityBlock
                      activity={p.activity}
                      onClick={onActivityClick}
                      variant="timed"
                    />
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityBlock({
  activity,
  onClick,
  variant,
}: {
  activity: Activity;
  onClick: (a: Activity) => void;
  variant: "timed" | "allday";
}) {
  const Icon = getActivityIcon(activity.type);
  const typeChip = getActivityChip(activity.type);
  const dueColor = activityColor({
    dueAt: activity.due_at,
    scheduledAt: activity.scheduled_at,
    completedAt: activity.completed_at,
    status: activity.status,
  });
  const isDone =
    activity.status === "completed" || !!activity.completed_at;

  return (
    <button
      type="button"
      onClick={() => onClick(activity)}
      className={cn(
        "group flex h-full w-full items-start gap-1.5 overflow-hidden rounded border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-transform hover:translate-y-[-1px] hover:shadow",
        typeChip,
        // The pill's coloured ring acts as the overdue / today signal.
        dueColor && !isDone &&
          dueColor === "red" &&
          "ring-1 ring-red-400 dark:ring-red-700",
        dueColor && !isDone &&
          dueColor === "green" &&
          "ring-1 ring-emerald-400 dark:ring-emerald-700",
        isDone && "opacity-60",
        variant === "allday" && "py-0.5",
      )}
      title={activity.subject}
    >
      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate font-medium",
            isDone && "line-through",
          )}
        >
          {activity.subject || "Untitled"}
        </div>
        {variant === "timed" &&
          (activity.due_at || activity.scheduled_at) && (
            <div className="truncate text-[10px] opacity-80">
              {format(
                new Date(activity.due_at ?? activity.scheduled_at!),
                "h:mm a",
              )}
              {activity.duration ? ` · ${activity.duration}m` : ""}
            </div>
          )}
        {dueColor && !isDone && (
          <div
            className={cn(
              "mt-0.5 hidden text-[10px] font-medium uppercase tracking-wide group-hover:inline",
              activityColorClasses[dueColor].text,
            )}
          >
            {activityColorClasses[dueColor].label}
          </div>
        )}
      </div>
    </button>
  );
}
