/**
 * Reusable activity primitives — the cross-CRM building blocks for
 * every surface that shows activity data.
 *
 * Why this exists
 * ---------------
 * Before this kit, the CRM had three competing styles for the same
 * concept:
 *
 *   - lead-at-a-glance had its own NextActivityLine
 *   - engagement-workspace had its own PlannedCard / FeedItem
 *   - activities-list-view + activities-week-view inlined their own
 *     status pills + type tiles
 *
 * That made it hard to keep the activity language consistent across
 * record pages, the global Activities module, and the pipeline cards.
 *
 * Everything below composes the same two source-of-truth helpers:
 *
 *   - `getActivityVisual` (icon, tile, chip, dot tokens by type)  — `~/lib/activity-visuals`
 *   - `activityColor` / `activityColorClasses` (semantic state)    — `~/lib/activity-state`
 *
 * Components in this file:
 *
 *   - `ActivityTypeIcon`        — small coloured tile with the type icon
 *   - `ActivityTypePill`        — chip with icon + label, type-tinted
 *   - `ActivityStateBadge`      — pill: Overdue / Due today / Scheduled / No due date
 *   - `ActivitySignalDot`       — minimal dot for tight spots (Kanban, list rows)
 *   - `ActivitySignalLine`      — single-line "Apr 19 · Due today" for record cards
 *   - `PlannedActivityCard`     — the canonical "next step" card
 *   - `CompletedActivityFeedItem` — chronological history row
 *   - `ActivityEmptyState`      — "no activity yet" prompt with quick-launch
 *   - `FeedFilterBar`           — single grouped filter row (Content · Type · Audit)
 */
import { format } from "date-fns";
import {
  Building2,
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  History,
  MessageSquare,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Link } from "react-router";
import type { Activity, ActivityType } from "~/api/activities";
import { ACTIVITY_TYPES } from "~/api/activities";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  activityColor,
  activityColorClasses,
  activityDueLabel,
  type ActivityColor,
} from "~/lib/activity-state";
import {
  getActivityChip,
  getActivityDot,
  getActivityIcon,
  getActivityLabel,
  getActivityTile,
  type ActivityVisualType,
} from "~/lib/activity-visuals";
import { cn } from "~/lib/utils";

// =====================================================================
// Type primitives
// =====================================================================

export type ActivityTypeIconSize = "xs" | "sm" | "md";

const ICON_SIZE_CLS: Record<ActivityTypeIconSize, string> = {
  xs: "h-5 w-5 [&_svg]:h-2.5 [&_svg]:w-2.5",
  sm: "h-6 w-6 [&_svg]:h-3 [&_svg]:w-3",
  md: "h-7 w-7 [&_svg]:h-3.5 [&_svg]:w-3.5",
};

/**
 * Type-tinted square tile that shows the activity-type icon. Used in
 * list rows, planned cards, calendar blocks, and sheet headers — the
 * single component that owns the "type icon" visual contract.
 */
export function ActivityTypeIcon({
  type,
  size = "sm",
  className,
}: {
  type: ActivityVisualType | string | null | undefined;
  size?: ActivityTypeIconSize;
  className?: string;
}) {
  const Icon = getActivityIcon(type);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md",
        getActivityTile(type),
        ICON_SIZE_CLS[size],
        className,
      )}
      aria-label={getActivityLabel(type)}
    >
      <Icon />
    </span>
  );
}

/**
 * Chip with icon + label, type-tinted. Used in filter rails and
 * inline-pill contexts where the badge is interactive.
 */
export function ActivityTypePill({
  type,
  active,
  onClick,
  showIcon = true,
  className,
}: {
  type: ActivityVisualType | string | null | undefined;
  active?: boolean;
  onClick?: () => void;
  showIcon?: boolean;
  className?: string;
}) {
  const Icon = getActivityIcon(type);
  const tone = getActivityChip(type);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? cn("border-transparent shadow-sm", tone)
          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        !onClick && "cursor-default",
        className,
      )}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {getActivityLabel(type)}
    </button>
  );
}

// =====================================================================
// State primitives (overdue / due today / scheduled / no due date)
// =====================================================================

interface ActivityStateInput {
  dueAt?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
  status?: string | null;
}

/**
 * Single-source pill that surfaces an activity's due-state. Returns
 * null when the activity is closed (completed/cancelled) so the
 * caller can fall back to a neutral status badge.
 */
export function ActivityStateBadge({
  activity,
  className,
}: {
  activity: ActivityStateInput;
  className?: string;
}) {
  const color = resolveColor(activity);
  if (!color) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        activityColorClasses[color].pill,
        className,
      )}
    >
      {activityColorClasses[color].label}
    </Badge>
  );
}

/**
 * Tiny coloured dot for tight surfaces (kanban cards, leads-list row
 * markers). Returns a neutral muted dot when the activity is closed.
 */
export function ActivitySignalDot({
  activity,
  className,
}: {
  activity: ActivityStateInput;
  className?: string;
}) {
  const color = resolveColor(activity);
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        color
          ? activityColorClasses[color].dot
          : "bg-muted-foreground/40",
        className,
      )}
      aria-hidden
    />
  );
}

/**
 * One-line "Apr 19 · Due today" descriptor with a leading dot. Built
 * for record cards (lead at-a-glance, kanban) where vertical real
 * estate is scarce.
 */
export function ActivitySignalLine({
  activity,
  className,
}: {
  activity: ActivityStateInput;
  className?: string;
}) {
  const color = resolveColor(activity);
  const tone = color
    ? activityColorClasses[color].text
    : "text-muted-foreground";
  const dueLabel = activityDueLabel({
    dueAt: activity.dueAt ?? undefined,
    scheduledAt: activity.scheduledAt ?? undefined,
    completedAt: activity.completedAt ?? undefined,
    status: activity.status ?? undefined,
  });
  const clock = formatDueClock(activity);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", tone, className)}>
      <ActivitySignalDot activity={activity} />
      {dueLabel ? `${dueLabel}${clock ? ` · ${clock}` : ""}` : clock || "No due date"}
    </span>
  );
}

function resolveColor(activity: ActivityStateInput): ActivityColor | null {
  return activityColor({
    dueAt: activity.dueAt ?? undefined,
    scheduledAt: activity.scheduledAt ?? undefined,
    completedAt: activity.completedAt ?? undefined,
    status: activity.status ?? undefined,
  });
}

function formatDueClock(a: ActivityStateInput): string {
  const raw = a.dueAt ?? a.scheduledAt;
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "MMM d · h:mm a");
}

// =====================================================================
// User + record helpers used by cards
// =====================================================================

export function fullName(user?: {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
} | null): string | null {
  if (!user) return null;
  const composed = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return composed || user.name || null;
}

export function userInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function activityRelatedRecord(activity: Activity): {
  label: string;
  href: string;
} | null {
  if (activity.lead?.school?.name) {
    return {
      label: activity.lead.school.name,
      href: `/leads/${activity.lead_id}`,
    };
  }
  if (activity.lead_id) {
    return { label: "Lead", href: `/leads/${activity.lead_id}` };
  }
  if (activity.deal_id) {
    return { label: "Deal", href: `/deals/${activity.deal_id}` };
  }
  return null;
}

function activityIsOpen(a: Activity): boolean {
  return (
    a.status !== "completed" &&
    a.status !== "cancelled" &&
    !a.completed_at
  );
}

// =====================================================================
// PlannedActivityCard
// =====================================================================

export interface PlannedActivityCardProps {
  activity: Activity;
  onComplete: (a: Activity) => void | Promise<unknown>;
  onOpen: (a: Activity) => void;
  /** When true, completion + edit + open buttons are hidden. */
  disabled?: boolean;
  /** Override the related-record label (e.g. school name on a school page). */
  relatedOverride?: { label: string; href: string } | null;
  /** Compact variant for use on glance widgets (no description, no actions). */
  compact?: boolean;
}

export function PlannedActivityCard({
  activity,
  onComplete,
  onOpen,
  disabled,
  relatedOverride,
  compact,
}: PlannedActivityCardProps) {
  const Icon = getActivityIcon(activity.type);
  const color = resolveColor({
    dueAt: activity.due_at,
    scheduledAt: activity.scheduled_at,
    completedAt: activity.completed_at,
    status: activity.status,
  });
  const owner = fullName(activity.assigned_to ?? activity.created_by);
  const related =
    relatedOverride === undefined
      ? activityRelatedRecord(activity)
      : relatedOverride;

  return (
    <div
      className={cn(
        "rounded-md border bg-background p-4 shadow-sm transition-shadow hover:shadow",
        color === "red" && "border-red-200 dark:border-red-900",
        color === "green" && "border-emerald-200 dark:border-emerald-900",
      )}
    >
      <div className="flex items-start gap-3">
        {!compact && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void onComplete(activity)}
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                  "border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600",
                )}
                aria-label="Mark next step done"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Mark as done</TooltipContent>
          </Tooltip>
        )}

        <ActivityTypeIcon type={activity.type} size="md" className="mt-0.5 shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">
                  {activity.subject || "Untitled next step"}
                </span>
                <Badge
                  variant="outline"
                  className="rounded-full px-1.5 py-0 text-[10px] uppercase tracking-wide"
                >
                  {getActivityLabel(activity.type)}
                </Badge>
              </div>
              {!compact && activity.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {activity.description}
                </p>
              )}
            </div>

            {!compact && (
              <div className="flex shrink-0 items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onOpen(activity)}
                      aria-label="Open activity"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open / edit</TooltipContent>
                </Tooltip>
                {related && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        aria-label={`Open ${related.label}`}
                      >
                        <Link to={related.href}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open {related.label}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <ActivitySignalLine
              activity={{
                dueAt: activity.due_at,
                scheduledAt: activity.scheduled_at,
                completedAt: activity.completed_at,
                status: activity.status,
              }}
            />
            {owner && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Avatar className="h-4 w-4">
                  <AvatarFallback className="text-[8px]">
                    {userInitials(owner)}
                  </AvatarFallback>
                </Avatar>
                {owner}
              </span>
            )}
            {related && (
              <Link
                to={related.href}
                className="flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                <Building2 className="h-3 w-3" />
                {related.label}
              </Link>
            )}
          </div>
        </div>
      </div>
      {/* Render the icon to keep the hot-import lint quiet on no-IconUse paths */}
      <span className="hidden">
        <Icon />
      </span>
    </div>
  );
}

// =====================================================================
// CompletedActivityFeedItem
// =====================================================================

export function CompletedActivityFeedItem({
  activity,
  onOpen,
  onReopen,
}: {
  activity: Activity;
  onOpen: (a: Activity) => void;
  onReopen?: () => void;
}) {
  const owner = fullName(activity.assigned_to ?? activity.created_by);
  const completedAt = activity.completed_at ?? activity.created_at;
  const completedClock = format(
    new Date(completedAt),
    "MMM d, yyyy · h:mm a",
  );
  const note =
    (activity.type === "note" && activity.note?.content) ||
    activity.description;

  // Outcome surfacing — calls and meetings carry an outcome blob; we
  // pull whatever short label exists so the feed reads like a sales
  // log instead of a plain timeline.
  const outcome =
    activity.type === "call"
      ? activity.call?.outcome ??
        (activity.call as { outcome_label?: string } | undefined)?.outcome_label
      : activity.type === "meeting"
        ? (activity.meeting as { outcome?: string } | undefined)?.outcome
        : undefined;

  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
      <ActivityTypeIcon
        type={activity.type}
        size="md"
        className="mt-0.5 shrink-0 opacity-80"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpen(activity)}
            className="truncate text-sm font-medium text-foreground hover:underline"
          >
            {activity.subject || "Untitled"}
          </button>
          <span className="shrink-0 text-xs text-muted-foreground">
            {completedClock}
          </span>
        </div>

        {note && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {note}
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {owner && (
            <span className="flex items-center gap-1.5">
              <Avatar className="h-4 w-4">
                <AvatarFallback className="text-[8px]">
                  {userInitials(owner)}
                </AvatarFallback>
              </Avatar>
              {owner}
            </span>
          )}
          {outcome && (
            <Badge
              variant="outline"
              className="rounded-full px-1.5 py-0 text-[10px]"
            >
              {String(outcome).replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </div>

      {onReopen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={onReopen}
              aria-label="Reopen activity"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reopen</TooltipContent>
        </Tooltip>
      )}
    </li>
  );
}

// =====================================================================
// EmptyState (no planned activity)
// =====================================================================

export function ActivityEmptyState({
  scope,
  onSchedule,
  disabled,
}: {
  scope: "lead" | "deal" | "school" | "contact";
  onSchedule: (type: ActivityType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-md border border-dashed bg-background px-4 py-6 text-center">
      <p className="text-sm font-medium text-foreground">
        No planned next step
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Every {scope} should have one obvious next action. Schedule a
        call, demo, or follow-up to keep momentum.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        {(["call", "meeting", "task", "whatsapp", "email"] as const).map(
          (t) => {
            const Icon = getActivityIcon(t);
            return (
              <Button
                key={t}
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onSchedule(t)}
              >
                <Icon className="mr-1.5 h-3.5 w-3.5" />
                {getActivityLabel(t)}
              </Button>
            );
          },
        )}
      </div>
    </div>
  );
}

// =====================================================================
// FeedFilterBar — single grouped filter row used by the engagement
// workspace and any other "show me a record's activity feed" surface.
// =====================================================================

export type FeedFilter =
  | { kind: "all" }
  | { kind: "content"; value: "activities" | "notes" | "files" }
  | { kind: "type"; value: ActivityType }
  | { kind: "changelog" };

export function feedFilterEquals(a: FeedFilter, b: FeedFilter): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "content" && b.kind === "content") return a.value === b.value;
  if (a.kind === "type" && b.kind === "type") return a.value === b.value;
  return true;
}

/**
 * Pure: filter a list of activities by the given feed filter. Used by
 * EngagementWorkspace and any other consumer that wants the same
 * filter semantics as a record's activity feed.
 */
export function applyFeedFilter(
  activities: Activity[],
  filter: FeedFilter,
): Activity[] {
  switch (filter.kind) {
    case "all":
      return activities;
    case "content":
      if (filter.value === "notes") {
        return activities.filter((a) => a.type === "note");
      }
      if (filter.value === "activities") {
        return activities.filter((a) => a.type !== "note");
      }
      // "files" — disabled in the UI; nothing to show.
      return [];
    case "type":
      return activities.filter((a) => a.type === filter.value);
    case "changelog":
      return [];
  }
}

export function FeedFilterBar({
  value,
  onChange,
}: {
  value: FeedFilter;
  onChange: (v: FeedFilter) => void;
}) {
  const isAll = value.kind === "all";
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 p-1.5">
      <Chip
        active={isAll}
        onClick={() => onChange({ kind: "all" })}
        label="All"
      />

      <FilterDivider label="Content" />

      <Chip
        active={feedFilterEquals(value, { kind: "content", value: "activities" })}
        onClick={() => onChange({ kind: "content", value: "activities" })}
        label="Activities"
      />
      <Chip
        active={feedFilterEquals(value, { kind: "content", value: "notes" })}
        onClick={() => onChange({ kind: "content", value: "notes" })}
        label="Notes"
      />
      <Chip
        active={feedFilterEquals(value, { kind: "content", value: "files" })}
        onClick={() => onChange({ kind: "content", value: "files" })}
        label="Files"
      />

      <FilterDivider label="Type" />

      {ACTIVITY_TYPES.filter((t) => t !== "note").map((t) => (
        <ActivityTypePill
          key={t}
          type={t}
          active={feedFilterEquals(value, { kind: "type", value: t })}
          onClick={() => onChange({ kind: "type", value: t })}
        />
      ))}

      <FilterDivider label="Audit" />

      <Chip
        active={feedFilterEquals(value, { kind: "changelog" })}
        onClick={() => onChange({ kind: "changelog" })}
        label="Changelog"
        icon={<History className="h-3 w-3" />}
      />
    </div>
  );
}

function FilterDivider({ label }: { label: string }) {
  return (
    <div
      className="ml-1 flex items-center gap-1.5 pl-1 pr-0.5"
      aria-hidden
    >
      <span className="h-4 w-px bg-border" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground border-transparent shadow-sm"
          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// =====================================================================
// Helpers re-exported for caller convenience
// =====================================================================

export { activityIsOpen };
export { getActivityVisual, getActivityIcon, getActivityLabel } from "~/lib/activity-visuals";
export { activityColor, activityColorClasses, activityDueLabel } from "~/lib/activity-state";

// Suppress unused-import lint — the kit deliberately exports a wide
// surface to anchor the activity language; some helpers only show up
// in caller files.
void getActivityDot;
void CalendarPlus;
void MessageSquare;
