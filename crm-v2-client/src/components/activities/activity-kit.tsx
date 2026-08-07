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
} from "lucide-react";
import { Link } from "react-router";
import type { Activity, ActivityType } from "~/api/activities";
import { ACTIVITY_TYPES } from "~/api/activities";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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
import { ArrowRight, DollarSign, Loader2, RotateCcw } from "lucide-react";
import { getActivityVisual } from "~/lib/activity-visuals";
import type { TimelineChange } from "~/lib/activity-timeline";
import { isMissingNextAction } from "~/lib/activity-next-action";
import { cn } from "~/lib/utils";

// =====================================================================
// Pivotal-activity selection (shared by lead + deal "at a glance")
// =====================================================================

/**
 * From a record's activity list, pick the NEXT planned step and the LAST
 * touch — the two facts every "at a glance" panel shows.
 *
 * The last-touch rule is the important one: a touch is any activity that
 * has already HAPPENED, which is NOT the same as `status === "completed"`.
 * Logged calls, WhatsApps and notes are saved as status "scheduled" with
 * no due date, yet they are real touches. Restricting last-touch to
 * completed activities made leads/deals full of logged calls show
 * "No activity yet" (≈63% of all activity was affected). An open activity
 * counts as a past touch unless it is a genuinely future-dated step.
 */
export function pickPivotalActivities(activities: Activity[]): {
  nextActivity: Activity | null;
  lastActivity: Activity | null;
} {
  const time = (v?: string | null) => (v ? new Date(v).getTime() : 0);

  const nextActivity =
    activities
      .filter(
        (a) =>
          a.status !== "completed" &&
          a.status !== "cancelled" &&
          (a.scheduled_at || a.due_at),
      )
      .sort(
        (a, b) =>
          time(a.scheduled_at || a.due_at) - time(b.scheduled_at || b.due_at),
      )[0] ?? null;

  const now = Date.now();
  const touchTime = (a: Activity) =>
    time(a.completed_at ?? a.scheduled_at ?? a.created_at);
  const lastActivity =
    activities
      .filter((a) => {
        if (a.status === "cancelled") return false;
        if (a.status === "completed") return true;
        const when = a.scheduled_at || a.due_at;
        return !when || new Date(when).getTime() <= now;
      })
      .sort((a, b) => touchTime(b) - touchTime(a))[0] ?? null;

  return { nextActivity, lastActivity };
}

/** Effective "touch" date for an activity: completed → scheduled → created. */
export function activityTouchDate(a: Activity | null): Date | null {
  if (!a) return null;
  return new Date(a.completed_at ?? a.scheduled_at ?? a.created_at);
}

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
  /** Expands the full activity page beneath the card, in place. */
  expanded?: boolean;
}

export function PlannedActivityCard({
  activity,
  onComplete,
  onOpen,
  disabled,
  relatedOverride,
  compact,
  expanded = false,
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

  // Same de-duplication the log feed does: subjects were auto-generated
  // from the body at create time ("Call: I spoke to Mrs Ndlovu…"), so
  // printing both showed the same sentence twice — once clipped. When the
  // subject is only a clipped copy of the body, show the TYPE and let the
  // body below carry the words.
  const plannedTypeLabel = getActivityVisual(activity.type).label;

  // The planned item's own words, read from whichever field its type
  // uses — same resolver as the log feed.
  const plannedBody =
    (activity.type === "note" && activity.note?.content) ||
    (activity.type === "call" && activity.call?.summary) ||
    (activity.type === "whatsapp" && activity.whatsapp?.message) ||
    (activity.type === "email" && activity.email?.body) ||
    (activity.type === "meeting" &&
      (activity.meeting?.minutes_notes || activity.meeting?.agenda)) ||
    activity.description;

  const plannedStrippedSubject = (activity.subject ?? "")
    .replace(/^(call|whatsapp|note|email|meeting|task)\s*:\s*/i, "")
    .replace(/[.…]+$/, "")
    .trim();
  const plannedSubjectIsRedundant =
    !!plannedBody &&
    plannedStrippedSubject.length > 0 &&
    plannedBody
      .trim()
      .toLowerCase()
      .startsWith(
        plannedStrippedSubject
          .toLowerCase()
          .slice(0, Math.min(24, plannedStrippedSubject.length)),
      );

  return (
    <div
      className={cn(
        "rounded-md border bg-background shadow-sm transition-shadow hover:shadow",
        // Padding moves onto the inner header so the expanded document
        // can sit flush beneath it.
        expanded ? "p-0" : "p-4",
        color === "red" && "border-red-200 dark:border-red-900",
        color === "green" && "border-emerald-200 dark:border-emerald-900",
      )}
    >
      <div className={cn(expanded && "p-4")}>
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
                  {plannedSubjectIsRedundant
                    ? plannedTypeLabel
                    : activity.subject || "Untitled next step"}
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

      {plannedBody && (
        <div className="px-4 pb-4">
          {/* Same reading pattern as the log: the content is there, click
              to open the rest. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(activity)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(activity);
              }
            }}
            className={cn(
              "cursor-pointer whitespace-pre-wrap rounded-md bg-amber-50/70 px-3 py-2 text-sm leading-6 text-foreground transition-colors hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30",
              !expanded && "line-clamp-2",
            )}
            title={expanded ? "Click to collapse" : "Click to read all"}
          >
            {plannedBody}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// CompletedActivityFeedItem
// =====================================================================

/**
 * The activity's own words, wherever its type keeps them.
 */
export function activityBodyText(activity: Activity): string | undefined {
  return (
    (activity.type === "note" && activity.note?.content) ||
    (activity.type === "call" && activity.call?.summary) ||
    (activity.type === "whatsapp" && activity.whatsapp?.message) ||
    (activity.type === "email" && activity.email?.body) ||
    (activity.type === "meeting" &&
      (activity.meeting?.minutes_notes || activity.meeting?.agenda)) ||
    activity.description ||
    undefined
  );
}

/**
 * What to show as an activity's heading.
 *
 * Subjects were auto-generated from the body at create time — e.g. a
 * WhatsApp saved as `"WhatsApp: checking if they've had a chance to disc…"`
 * — so any surface showing subject AND body printed the same sentence
 * twice, the heading version clipped mid-word. When the subject is only a
 * clipped copy of the body we show the activity TYPE instead and let the
 * body carry the words. Genuine, rep-written subjects are untouched.
 */
export function activityHeading(activity: Activity): string {
  const body = activityBodyText(activity);
  const stripped = (activity.subject ?? "")
    .replace(/^(call|whatsapp|note|email|meeting|task)\s*:\s*/i, "")
    .replace(/[.…]+$/, "")
    .trim();
  const redundant =
    !!body &&
    stripped.length > 0 &&
    body
      .trim()
      .toLowerCase()
      .startsWith(stripped.toLowerCase().slice(0, Math.min(24, stripped.length)));
  return redundant
    ? getActivityVisual(activity.type).label
    : activity.subject || getActivityVisual(activity.type).label;
}

/**
 * A stage or value change, sitting on the same rail as the activity cards.
 *
 * Deliberately quiet: one line, muted, no card. A rep scanning the feed
 * should read these as punctuation between the things they actually did —
 * "I called them, the deal moved to Quote Submitted, then I emailed" —
 * not as competing entries. The `left-[30px]` rail position and `px-4`
 * gutter match CompletedActivityFeedItem exactly so the hairline stays
 * continuous through both kinds of row.
 */
export function TimelineChangeItem({
  change,
  formatValue,
}: {
  change: TimelineChange;
  formatValue: (c: TimelineChange) => { from: string | null; to: string };
}) {
  const { from, to } = formatValue(change);
  const Icon = change.field === "value" ? DollarSign : ArrowRight;
  return (
    <li className="group relative">
      <span
        aria-hidden
        className="absolute bottom-0 left-[30px] top-0 w-px bg-border"
      />
      <div className="relative flex items-center gap-3 px-4 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-4 ring-background">
          <Icon className="h-3 w-3" />
        </span>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">
            {change.label}
          </span>
          {": "}
          {from && (
            <>
              <span className="line-through">{from}</span>
              <span className="mx-1">→</span>
            </>
          )}
          <span className="font-medium text-foreground">{to}</span>
          <span className="ml-2 whitespace-nowrap">
            · {format(new Date(change.at), "MMM d, yyyy")}
            {change.actor ? ` · ${change.actor}` : ""}
          </span>
        </p>
      </div>
    </li>
  );
}

export function CompletedActivityFeedItem({
  activity,
  onOpen,
  onReopen,
  expanded = false,
  selected,
  onToggleSelect,
  onToggleComplete,
  pending = false,
}: {
  activity: Activity;
  onOpen: (a: Activity) => void;
  onReopen?: () => void;
  /** When true the entry's body text is shown in full rather than clipped. */
  expanded?: boolean;
  /**
   * Bulk-select checkbox. Only the global Activities module passes these —
   * it's a work queue where "mark 20 done" matters. Record pages omit them
   * and the row renders identically to before.
   */
  selected?: boolean;
  onToggleSelect?: () => void;
  /**
   * Inline "mark done" for an open entry, with its in-flight spinner.
   * Also module-only: on a record page completion runs through the
   * Planned card, but a queue needs to tick things off where they sit.
   */
  onToggleComplete?: () => void;
  pending?: boolean;
}) {
  const owner = fullName(activity.assigned_to ?? activity.created_by);
  const completedAt = activity.completed_at ?? activity.created_at;
  const completedClock = format(
    new Date(completedAt),
    "MMM d, yyyy · h:mm a",
  );
  const isNote = activity.type === "note";
  // eea1c4ae: a task completed through the outcome dialog stores its
  // note on the activity itself — keep it visible in the feed.
  const completionNote = (activity as { completion_note?: string })
    .completion_note;
  // Open (not-yet-completed) items live in this feed too, so mark them clearly
  // — a due/scheduled chip instead of a "logged at" timestamp — so a scheduled
  // task never reads as if it were already done.
  const isOpen =
    activity.status !== "completed" && activity.status !== "cancelled";
  const openWhen = activity.due_at
    ? `Due ${format(new Date(activity.due_at), "MMM d")}`
      : activity.scheduled_at
        ? `Scheduled ${format(new Date(activity.scheduled_at), "MMM d")}`
        : // Was "Open", which collided with the row's Open button.
          "Not scheduled";
  // Every type keeps its substance in a different field. The log used to
  // read only note.content / description, so a call's summary or a
  // meeting's minutes showed as a bare title with nothing under it — the
  // rep had to open each one to find out what happened. The feed now
  // shows the actual content, so it reads like a story you scroll.
  const note =
    (activity.type === "note" && activity.note?.content) ||
    (activity.type === "call" && activity.call?.summary) ||
    (activity.type === "whatsapp" && activity.whatsapp?.message) ||
    (activity.type === "email" && activity.email?.body) ||
    (activity.type === "meeting" &&
      (activity.meeting?.minutes_notes || activity.meeting?.agenda)) ||
    completionNote ||
    activity.description;

  const typeLabel = getActivityVisual(activity.type).label;
  // A subject is "redundant" when it is just the body clipped and
  // prefixed with the type — which is how the create modal generated it.
  const strippedSubject = (activity.subject ?? "")
    .replace(/^(call|whatsapp|note|email|meeting|task)\s*:\s*/i, "")
    .replace(/[.…]+$/, "")
    .trim();
  const subjectIsRedundant =
    !!note &&
    strippedSubject.length > 0 &&
    note
      .trim()
      .toLowerCase()
      .startsWith(
        strippedSubject.toLowerCase().slice(0, Math.min(24, strippedSubject.length)),
      );

  // Outcome surfacing — calls and meetings carry an outcome blob; we
  // pull whatever short label exists so the feed reads like a sales
  // log instead of a plain timeline. Falls back to the activity-level
  // `completion_outcome` (set by the outcome dialog on task/other
  // completions) so a recorded outcome always shows.
  const outcome =
    (activity.type === "call"
      ? activity.call?.outcome ??
        (activity.call as { outcome_label?: string } | undefined)?.outcome_label
      : activity.type === "meeting"
        ? (activity.meeting as { outcome?: string } | undefined)?.outcome
        : undefined) ??
    (activity as { completion_outcome?: string }).completion_outcome;

  // OUT-DUBE (Mr Dube, 5 Aug): a completed, non-note activity must read its
  // outcome inline — "Outcome: <text>" — not hide it behind a click. Prefer
  // the free-text note the rep typed, else the humanised outcome category.
  const outcomeText = isNote
    ? null
    : completionNote || (outcome ? String(outcome).replace(/_/g, " ") : null);

  return (
    <li className="group relative transition-colors hover:bg-muted/20">
      {/* Timeline rail — a continuous hairline behind the icons so the
          feed reads as one thread rather than a stack of rows. */}
      <span
        aria-hidden
        className="absolute bottom-0 left-[30px] top-0 w-px bg-border"
      />
      <div className="relative flex items-start gap-3 px-4 py-3">
      {onToggleSelect && (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${activity.subject}`}
          className="mt-2 shrink-0"
        />
      )}
      <ActivityTypeIcon
        type={activity.type}
        size="md"
        className="mt-0.5 shrink-0 rounded-full bg-background opacity-90 ring-4 ring-background"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          {/* Most subjects were auto-generated from the body when the
              activity was logged ("Call: I spoke to Mrs Ndlovu…"), so
              showing both printed the same sentence twice — once
              truncated. When the subject is just a clipped copy of the
              body we show the activity TYPE instead and let the body
              carry the words, the way a timeline should read. */}
          <button
            type="button"
            onClick={() => onOpen(activity)}
            className="truncate text-sm font-medium text-foreground hover:underline"
            aria-expanded={expanded}
          >
            {subjectIsRedundant ? typeLabel : activity.subject || typeLabel}
          </button>
          {/* Every activity except a note is meant to schedule the next
              action. The document view saves field-by-field so there is no
              submit to block on — instead the gap is surfaced here, where a
              manager scanning the log can actually see it. */}
          {/* Both chips live in ONE right-aligned cluster. Loose under
              `justify-between` they were pushed around by however long the
              subject happened to be, so the "No follow-up" badge landed at
              a different x-position on every row and the column read as
              ragged. Grouped, they anchor to the right edge and line up
              down the feed. */}
          <div className="flex shrink-0 items-center gap-1.5">
            {isMissingNextAction(activity) && (
              <span
                className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
                title="No follow-up date — nothing is scheduled after this"
              >
                No follow-up
              </span>
            )}
            {isOpen ? (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {openWhen}
              </span>
            ) : (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {completedClock}
              </span>
            )}
          </div>
        </div>

        {/* OUT-DUBE (Mr Dube, 5 Aug): a completed, non-note activity reads
            its outcome inline — never hidden behind a click. */}
        {outcomeText && (
          <p className="mt-1 text-sm font-medium text-foreground">
            Outcome: {outcomeText}
          </p>
        )}
        {note && note !== outcomeText && (
          // Collapsed shows the opening lines; clicking the entry opens
          // the rest in place. No separate button — the entry itself is
          // the control, so the feed stays quiet.
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(activity)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(activity);
              }
            }}
            className={cn(
              "mt-1.5 cursor-pointer whitespace-pre-wrap rounded-md bg-amber-50/70 px-3 py-2 text-sm leading-6 text-foreground transition-colors hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30",
              !expanded && "line-clamp-2",
            )}
            title={expanded ? "Click to collapse" : "Click to read all"}
          >
            {note}
          </div>
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
          {outcome && completionNote && (
            <Badge
              variant="outline"
              className="rounded-full px-1.5 py-0 text-[10px]"
            >
              {String(outcome).replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onToggleComplete && isOpen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={pending}
                onClick={onToggleComplete}
                aria-label="Mark done"
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border transition-colors",
                  pending
                    ? "text-muted-foreground"
                    : "text-muted-foreground hover:border-emerald-500 hover:text-emerald-600",
                )}
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {pending ? "Saving…" : "Mark done"}
            </TooltipContent>
          </Tooltip>
        )}
        {onReopen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={onReopen}
                aria-label="Reopen activity"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reopen</TooltipContent>
          </Tooltip>
        )}
      </div>
      </div>


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
