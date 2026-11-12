import { differenceInCalendarDays, isPast, isToday } from "date-fns";

/**
 * Semantic colour tokens driven by the Section 1 spec:
 *
 *   red    = overdue (due date is in the past and not yet complete)
 *   green  = due today
 *   gray   = scheduled in the future
 *   yellow = has no due date at all — "ungrounded" task/activity
 *
 * Completed or cancelled items return `null`, which callers treat as
 * "neutral" (no dot, no highlight) so finished work doesn't pollute
 * the colour language with one more colour.
 */
export type ActivityColor = "red" | "green" | "gray" | "yellow";

export interface ActivityColorInput {
  /** Primary: an activity's due_at. */
  dueAt?: string | Date | null;
  /** Scheduled_at is used as a fallback for calendar-style items. */
  scheduledAt?: string | Date | null;
  /** If completed_at is present, we return null regardless of due state. */
  completedAt?: string | Date | null;
  /**
   * Accepts the backend activity status OR the narrower task status. We only
   * early-return on "completed" / "done" / "cancelled", everything else is
   * treated as active.
   */
  status?: string | null;
}

export function activityColor(
  input: ActivityColorInput,
): ActivityColor | null {
  const status = (input.status ?? "").toLowerCase();
  if (input.completedAt) return null;
  if (status === "completed" || status === "done" || status === "cancelled") {
    return null;
  }

  const due =
    input.dueAt != null
      ? toDate(input.dueAt)
      : input.scheduledAt != null
        ? toDate(input.scheduledAt)
        : null;

  if (!due) return "yellow";
  if (isToday(due)) return "green";
  if (isPast(due)) return "red";
  return "gray";
}

function toDate(v: string | Date): Date {
  return typeof v === "string" ? new Date(v) : v;
}

export interface ActivityColorClasses {
  /** Small coloured dot (used in timeline, calendar, row markers). */
  dot: string;
  /** Text token — matches the dot hue. */
  text: string;
  /** Tinted surface, good for chip / badge backgrounds. */
  bg: string;
  /** Border token for pills. */
  border: string;
  /**
   * One-stop pill — combines bg + text + border. Useful in tight spots
   * where you just want `className={activityColorPill(color)}`.
   */
  pill: string;
  /**
   * Left border accent for list rows. Renders as a thick coloured stripe
   * so the status is scannable even in dense tables.
   */
  rowAccent: string;
  /** Human-readable label. */
  label: string;
}

export const activityColorClasses: Record<ActivityColor, ActivityColorClasses> =
  {
    red: {
      dot: "bg-red-500",
      text: "text-red-700 dark:text-red-300",
      bg: "bg-red-50 dark:bg-red-950/40",
      border: "border-red-200 dark:border-red-900",
      pill: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
      rowAccent: "border-l-4 border-l-red-500",
      label: "Overdue",
    },
    green: {
      dot: "bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-300",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      border: "border-emerald-200 dark:border-emerald-900",
      pill: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
      rowAccent: "border-l-4 border-l-emerald-500",
      label: "Due today",
    },
    gray: {
      // Spec calls this "black / gray"; we lean gray so dark mode still reads.
      dot: "bg-slate-500 dark:bg-slate-400",
      text: "text-slate-700 dark:text-slate-300",
      bg: "bg-slate-50 dark:bg-slate-900/50",
      border: "border-slate-200 dark:border-slate-800",
      pill: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-800",
      rowAccent: "border-l-4 border-l-slate-400 dark:border-l-slate-500",
      label: "Scheduled",
    },
    yellow: {
      dot: "bg-amber-500",
      text: "text-amber-800 dark:text-amber-300",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      border: "border-amber-200 dark:border-amber-900",
      pill: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
      rowAccent: "border-l-4 border-l-amber-500",
      label: "No due date",
    },
  };

/**
 * Convenience: returns the ready-to-paste class list for a colour, or an
 * empty string when the activity is complete/cancelled (caller can safely
 * concatenate without extra null checks).
 */
export function activityColorPill(color: ActivityColor | null): string {
  if (!color) return "";
  return activityColorClasses[color].pill;
}

export function activityColorDot(color: ActivityColor | null): string {
  if (!color) return "bg-slate-300 dark:bg-slate-700";
  return activityColorClasses[color].dot;
}

export function activityColorRowAccent(color: ActivityColor | null): string {
  if (!color) return "border-l-4 border-l-transparent";
  return activityColorClasses[color].rowAccent;
}

/**
 * Human-readable status line. Prefers "Due in N days" / "N days overdue"
 * over a raw date so the meaning is obvious at a glance.
 */
export function activityDueLabel(input: ActivityColorInput): string | null {
  if (input.completedAt) return "Completed";
  const status = (input.status ?? "").toLowerCase();
  if (status === "cancelled") return "Cancelled";
  if (status === "completed" || status === "done") return "Completed";

  const due =
    input.dueAt != null
      ? toDate(input.dueAt)
      : input.scheduledAt != null
        ? toDate(input.scheduledAt)
        : null;
  if (!due) return "No due date";

  const days = differenceInCalendarDays(due, new Date());
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < -1) return `${Math.abs(days)} days overdue`;
  return `Due in ${days} days`;
}
