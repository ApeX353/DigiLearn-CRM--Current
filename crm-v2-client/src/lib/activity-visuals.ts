import {
  Phone,
  MessageSquare,
  Mail,
  Calendar,
  FileText,
  CheckSquare,
  Video,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { ActivityType } from "~/api/activities";

/**
 * Extended "visual" type space used for UI rendering. The core
 * backing ActivityType has 6 values; "demo" is surfaced as a
 * meeting-derived variant, and "follow_up" represents scheduled
 * reminders we derive from due_at without a real backend type yet.
 */
export type ActivityVisualType =
  | ActivityType
  | "demo"
  | "follow_up";

export interface ActivityVisual {
  /** Human-readable label used for badges, chips, and tooltips. */
  label: string;
  /** Short label for tight UI (kanban cards, row markers). */
  shortLabel: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Tailwind token combo for the icon tile (bg + text). */
  tile: string;
  /** Tailwind token combo for an inline text chip (bg + text + border). */
  chip: string;
  /** Semantic dot token for timeline markers. */
  dot: string;
}

/**
 * Central registry. Keep colors inside this file so every view
 * (activities tab, timeline, tasks hub, lead rows, kanban cards,
 * composer) picks up the same visual language.
 */
const visuals: Record<ActivityVisualType, ActivityVisual> = {
  call: {
    label: "Call",
    shortLabel: "Call",
    icon: Phone,
    tile:
      "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    chip:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900",
    dot: "bg-sky-500",
  },
  whatsapp: {
    label: "WhatsApp",
    shortLabel: "WA",
    icon: MessageSquare,
    tile:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    chip:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
    dot: "bg-emerald-500",
  },
  email: {
    label: "Email",
    shortLabel: "Email",
    icon: Mail,
    tile:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    chip:
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900",
    dot: "bg-indigo-500",
  },
  meeting: {
    label: "Meeting",
    shortLabel: "Mtg",
    icon: Calendar,
    tile:
      "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    chip:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900",
    dot: "bg-violet-500",
  },
  demo: {
    label: "Demo",
    shortLabel: "Demo",
    icon: Video,
    tile:
      "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
    chip:
      "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/30 dark:text-fuchsia-300 dark:border-fuchsia-900",
    dot: "bg-fuchsia-500",
  },
  demo_booking: {
    label: "Demo booking",
    shortLabel: "Demo",
    icon: Calendar,
    tile:
      "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
    chip:
      "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/30 dark:text-fuchsia-300 dark:border-fuchsia-900",
    dot: "bg-fuchsia-500",
  },
  demo_delivery: {
    label: "Demo delivery",
    shortLabel: "Demo",
    icon: Video,
    tile:
      "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
    chip:
      "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/30 dark:text-fuchsia-300 dark:border-fuchsia-900",
    dot: "bg-fuchsia-500",
  },
  demo_followup: {
    label: "Demo follow-up",
    shortLabel: "Follow-up",
    icon: Sparkles,
    tile:
      "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
    chip:
      "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/30 dark:text-fuchsia-300 dark:border-fuchsia-900",
    dot: "bg-fuchsia-500",
  },
  note: {
    label: "Note",
    shortLabel: "Note",
    icon: FileText,
    tile:
      "bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300",
    chip:
      "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800",
    dot: "bg-slate-400",
  },
  task: {
    label: "Task",
    shortLabel: "Task",
    icon: CheckSquare,
    tile:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    chip:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
    dot: "bg-amber-500",
  },
  follow_up: {
    label: "Follow-up",
    shortLabel: "Follow-up",
    icon: Sparkles,
    tile:
      "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    chip:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
    dot: "bg-rose-500",
  },
};

export function getActivityVisual(
  type: ActivityVisualType | string | null | undefined,
): ActivityVisual {
  if (!type) return visuals.task;
  const key = type as ActivityVisualType;
  return visuals[key] ?? visuals.task;
}

export function getActivityIcon(
  type: ActivityVisualType | string | null | undefined,
): LucideIcon {
  return getActivityVisual(type).icon;
}

export function getActivityLabel(
  type: ActivityVisualType | string | null | undefined,
): string {
  return getActivityVisual(type).label;
}

export function getActivityTile(
  type: ActivityVisualType | string | null | undefined,
): string {
  return getActivityVisual(type).tile;
}

export function getActivityChip(
  type: ActivityVisualType | string | null | undefined,
): string {
  return getActivityVisual(type).chip;
}

export function getActivityDot(
  type: ActivityVisualType | string | null | undefined,
): string {
  return getActivityVisual(type).dot;
}
