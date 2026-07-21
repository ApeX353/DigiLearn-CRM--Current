/**
 * Date-context tabs for the Activities page (To-do / Overdue / Today /
 * Tomorrow / This week / Next week / Custom). Each preset resolves to
 * either an `{ open_only: true }` flag or an ISO `due_from` / `due_to`
 * window — both shapes the backend's QueryActivityDto already accepts.
 *
 * Centralising the math keeps the toolbar, the list view, and the
 * calendar view in lock-step: changing the tab shifts every panel
 * with no per-component date logic.
 */
import {
  addDays,
  addWeeks,
  endOfDay,
  endOfWeek,
  startOfDay,
  startOfWeek,
} from "date-fns";

export type ActivitiesPeriod =
  | "todo"
  | "overdue"
  | "today"
  | "tomorrow"
  | "this_week"
  | "next_week"
  | "all";

export interface ActivitiesPeriodOption {
  value: ActivitiesPeriod;
  label: string;
  /** Short helper text for an empty state — matches the tab semantics. */
  emptyHint: string;
}

export const ACTIVITIES_PERIODS: ActivitiesPeriodOption[] = [
  {
    value: "todo",
    label: "To-do",
    emptyHint: "No open activities — every task is closed out.",
  },
  {
    value: "overdue",
    label: "Overdue",
    emptyHint: "Nothing overdue. Keep it that way.",
  },
  { value: "today", label: "Today", emptyHint: "Nothing scheduled for today." },
  {
    value: "tomorrow",
    label: "Tomorrow",
    emptyHint: "No activities planned for tomorrow yet.",
  },
  {
    value: "this_week",
    label: "This week",
    emptyHint: "No activities scheduled for the rest of the week.",
  },
  {
    value: "next_week",
    label: "Next week",
    emptyHint: "Next week is wide open — schedule the next move.",
  },
  { value: "all", label: "All", emptyHint: "No activities yet." },
];

export interface ResolvedPeriod {
  due_from?: string;
  due_to?: string;
  open_only?: boolean;
  /** Range used by the calendar week-view (always defined). */
  visibleWindow: { from: Date; to: Date };
}

/**
 * `weekStartsOn: 1` — Monday-first matches Pipedrive and the local
 * education sales calendar (school weeks are Monday–Friday).
 */
const WEEK_OPTIONS = { weekStartsOn: 1 as const };

export function resolveActivitiesPeriod(
  period: ActivitiesPeriod,
  reference: Date = new Date(),
): ResolvedPeriod {
  switch (period) {
    case "todo": {
      // "Open" work irrespective of due date — the rep's working list.
      const weekStart = startOfWeek(reference, WEEK_OPTIONS);
      return {
        open_only: true,
        visibleWindow: {
          from: weekStart,
          to: endOfWeek(reference, WEEK_OPTIONS),
        },
      };
    }
    case "overdue": {
      // Anything still open whose due/scheduled time is before today's
      // start. We rely on `open_only` to drop completed/cancelled rows.
      const todayStart = startOfDay(reference);
      return {
        open_only: true,
        due_to: new Date(todayStart.getTime() - 1).toISOString(),
        visibleWindow: {
          from: addDays(todayStart, -7),
          to: endOfDay(reference),
        },
      };
    }
    case "today": {
      return {
        due_from: startOfDay(reference).toISOString(),
        due_to: endOfDay(reference).toISOString(),
        visibleWindow: {
          from: startOfWeek(reference, WEEK_OPTIONS),
          to: endOfWeek(reference, WEEK_OPTIONS),
        },
      };
    }
    case "tomorrow": {
      const tomorrow = addDays(reference, 1);
      return {
        due_from: startOfDay(tomorrow).toISOString(),
        due_to: endOfDay(tomorrow).toISOString(),
        visibleWindow: {
          from: startOfWeek(reference, WEEK_OPTIONS),
          to: endOfWeek(reference, WEEK_OPTIONS),
        },
      };
    }
    case "this_week": {
      return {
        due_from: startOfWeek(reference, WEEK_OPTIONS).toISOString(),
        due_to: endOfWeek(reference, WEEK_OPTIONS).toISOString(),
        visibleWindow: {
          from: startOfWeek(reference, WEEK_OPTIONS),
          to: endOfWeek(reference, WEEK_OPTIONS),
        },
      };
    }
    case "next_week": {
      const nextWeekRef = addWeeks(reference, 1);
      return {
        due_from: startOfWeek(nextWeekRef, WEEK_OPTIONS).toISOString(),
        due_to: endOfWeek(nextWeekRef, WEEK_OPTIONS).toISOString(),
        visibleWindow: {
          from: startOfWeek(nextWeekRef, WEEK_OPTIONS),
          to: endOfWeek(nextWeekRef, WEEK_OPTIONS),
        },
      };
    }
    case "all":
    default: {
      // Wide window so the calendar still has something to draw.
      return {
        visibleWindow: {
          from: startOfWeek(reference, WEEK_OPTIONS),
          to: endOfWeek(reference, WEEK_OPTIONS),
        },
      };
    }
  }
}

/**
 * Pure helper used to render the "scoped count" badge next to each tab.
 * The set of activities the page already has loaded for the current
 * window is a fine basis — we don't fire one query per tab.
 */
export function isInPeriod(
  period: ActivitiesPeriod,
  ref: Date,
  activity: { due_at?: string; scheduled_at?: string; status: string },
): boolean {
  const due = activity.due_at ?? activity.scheduled_at;
  if (period === "all") return true;
  const isOpen =
    activity.status !== "completed" && activity.status !== "cancelled";
  if (period === "todo") return isOpen;
  if (!due) return false;
  const dueDate = new Date(due);
  if (Number.isNaN(dueDate.getTime())) return false;
  switch (period) {
    case "overdue":
      return isOpen && dueDate < startOfDay(ref);
    case "today":
      return dueDate >= startOfDay(ref) && dueDate <= endOfDay(ref);
    case "tomorrow": {
      const t = addDays(ref, 1);
      return dueDate >= startOfDay(t) && dueDate <= endOfDay(t);
    }
    case "this_week":
      return (
        dueDate >= startOfWeek(ref, WEEK_OPTIONS) &&
        dueDate <= endOfWeek(ref, WEEK_OPTIONS)
      );
    case "next_week": {
      const t = addWeeks(ref, 1);
      return (
        dueDate >= startOfWeek(t, WEEK_OPTIONS) &&
        dueDate <= endOfWeek(t, WEEK_OPTIONS)
      );
    }
    default:
      return true;
  }
}
