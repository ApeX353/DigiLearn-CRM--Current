/**
 * Dense, Pipedrive-inspired activities table.
 *
 * Columns: bulk-checkbox, completion toggle, type icon, subject + related,
 * due date/time, duration, assignee, status pill. Sticky header, subtle
 * row separators, left accent stripe driven by the existing
 * activity-state colour system (red overdue / green today / gray
 * scheduled / amber undated). Clicking the row opens the inspector;
 * the completion toggle and the bulk checkbox short-circuit the row
 * click so reps can act without losing context.
 */
import { useMemo } from "react";
import {
  Building2,
  CheckCircle2,
  Loader2,
  Pin,
} from "lucide-react";
import { Link } from "react-router";
import type { Activity, ActivityStatus } from "~/api/activities";
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
  ActivityStateBadge,
  ActivityTypeIcon,
  activityBodyText,
  activityHeading,
  fullName,
  userInitials,
} from "~/components/activities/activity-kit";
import {
  activityColor,
  activityColorClasses,
  activityColorRowAccent,
  activityDueLabel,
} from "~/lib/activity-state";
import { cn } from "~/lib/utils";

interface ActivitiesListViewProps {
  activities: Activity[];
  /** Currently selected ids (drives the bulk-checkbox column). */
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  /** Returns a promise so the row can show a small spinner mid-toggle. */
  onToggleComplete: (activity: Activity) => Promise<unknown>;
  /** Fired by clicking the row (excluding the controls). */
  onActivityClick: (activity: Activity) => void;
  /** Set of ids currently mid-mutation (spinner). */
  pendingIds: Set<string>;
}

function relatedRecord(activity: Activity): {
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

function dueParts(activity: Activity): { date: string | null; time: string | null } {
  const raw = activity.due_at ?? activity.scheduled_at;
  if (!raw) return { date: null, time: null };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { date: null, time: null };
  // "Apr 17" / "9:30 AM" — short and consistently aligned, ditches
  // year + seconds noise.
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  // If the time is exactly midnight we treat the activity as undated.
  const isMidnight = d.getHours() === 0 && d.getMinutes() === 0;
  const time = isMidnight
    ? null
    : d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
  return { date, time };
}

// ACT-DATE: a row with no due/scheduled date is not "undated" — it is either
// a timeless note or a past interaction logged after the fact. Both carry a
// real date (completed_at for done rows, else the day it was logged), so show
// that with a soft label instead of an alarming "No due date". No data is
// invented — created_at is always present.
function loggedParts(
  activity: Activity,
): { label: string; date: string } | null {
  const isDone =
    activity.status === "completed" || !!activity.completed_at;
  const raw = isDone
    ? activity.completed_at ?? activity.created_at
    : activity.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return { label: isDone ? "Done" : "Logged", date };
}

function durationLabel(mins?: number): string {
  if (!mins || mins <= 0) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// `overdue` is a derived/display state (scheduled + past due) — NOT a
// real ActivityStatus enum value on the backend. It used to be listed
// here and broke the build as soon as the enum was tightened. Keep
// this map keyed to the real enum; the overdue badge is painted by
// the row itself based on `due_at < now`.
const STATUS_LABELS: Record<ActivityStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Done",
  cancelled: "Cancelled",
};

export function ActivitiesListView({
  activities,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onToggleComplete,
  onActivityClick,
  pendingIds,
}: ActivitiesListViewProps) {
  const allIds = useMemo(() => activities.map((a) => a.id), [activities]);
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="max-h-[calc(100vh-280px)] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur supports-[backdrop-filter]:bg-muted/50">
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-3 py-2.5">
                <Checkbox
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onCheckedChange={() => onToggleAll(allIds)}
                  aria-label="Select all activities on this page"
                />
              </th>
              <th className="w-10 px-1 py-2.5" aria-label="Done" />
              <th className="w-9 px-1 py-2.5" aria-label="Type" />
              <th className="px-2 py-2.5">Subject</th>
              <th className="w-36 px-2 py-2.5">Due</th>
              <th className="w-20 px-2 py-2.5">Duration</th>
              <th className="w-44 px-2 py-2.5">Assignee</th>
              <th className="w-32 px-2 py-2.5 pr-3 text-right">Status</th>
            </tr>
          </thead>

          <tbody>
            {activities.map((activity) => {
              const dueColor = activityColor({
                dueAt: activity.due_at,
                scheduledAt: activity.scheduled_at,
                completedAt: activity.completed_at,
                status: activity.status,
              });
              const due = dueParts(activity);
              const loggedFallback = due.date ? null : loggedParts(activity);
              const related = relatedRecord(activity);
              const isPending = pendingIds.has(activity.id);
              const isDone =
                activity.status === "completed" || !!activity.completed_at;
              const isSelected = selectedIds.includes(activity.id);
              // ACT-OWNER: the list showed only an explicit assignee, so the
              // ~488 activities that carry no assigned_to (but always a
              // creator) read as "Unassigned". Fall back to the creator — the
              // rep the activity actually belongs to — matching the owner
              // idiom already used in activity-kit (assigned_to ?? created_by).
              const explicitAssignee = activity.assigned_to ?? undefined;
              const owner = explicitAssignee ?? activity.created_by ?? undefined;
              const assigneeName = fullName(owner);
              const ownerFromCreator = !explicitAssignee && !!activity.created_by;
              const dueText = activityDueLabel({
                dueAt: activity.due_at,
                scheduledAt: activity.scheduled_at,
                completedAt: activity.completed_at,
                status: activity.status,
              });

              return (
                <tr
                  key={activity.id}
                  className={cn(
                    "group cursor-pointer border-t bg-background transition-colors",
                    "hover:bg-muted/40",
                    isSelected && "bg-primary/[0.04]",
                    isDone && "opacity-70",
                  )}
                  onClick={() => onActivityClick(activity)}
                >
                  <td
                    className="px-3 py-2 align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect(activity.id)}
                      aria-label={`Select ${activity.subject}`}
                    />
                  </td>

                  {/* Completion toggle: a circular check that reads as
                      both a status indicator AND an action button. */}
                  <td
                    className="px-1 py-2 align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => void onToggleComplete(activity)}
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full border transition-colors",
                            isDone
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600",
                          )}
                          aria-label={isDone ? "Reopen activity" : "Mark as done"}
                        >
                          {isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isDone ? "Reopen activity" : "Mark as done"}
                      </TooltipContent>
                    </Tooltip>
                  </td>

                  {/* Left accent stripe + type icon. The stripe is
                      drawn as a coloured border on this cell so the
                      whole row is visually anchored without an extra
                      column. */}
                  <td
                    className={cn(
                      "px-1 py-2 align-middle",
                      activityColorRowAccent(dueColor),
                    )}
                  >
                    <ActivityTypeIcon type={activity.type} size="md" />
                  </td>

                  {(() => {
                    // Apply the due-state colour as text colour to the
                    // subject + due + assignee cells. Matches the
                    // Pipedrive list pattern where overdue rows read in
                    // red and today's rows read in green at a glance.
                    const stateText =
                      !isDone && dueColor && dueColor !== "gray"
                        ? activityColorClasses[dueColor].text
                        : "";
                    return (
                      <>
                        <td className="px-2 py-2 align-middle">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "truncate font-medium",
                                stateText || "text-foreground",
                                isDone &&
                                  "line-through text-muted-foreground",
                              )}
                              title={activityBodyText(activity) || activity.subject}
                            >
                              {activityHeading(activity)}
                            </span>
                            {activity.is_pinned && (
                              <Pin className="h-3 w-3 text-amber-500" />
                            )}
                          </div>
                          {related && (
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3 shrink-0" />
                              <Link
                                to={related.href}
                                className="truncate underline-offset-2 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {related.label}
                              </Link>
                            </div>
                          )}
                        </td>

                        <td className="px-2 py-2 align-middle">
                          {due.date ? (
                            <div className="leading-tight">
                              <div
                                className={cn(
                                  "font-medium",
                                  stateText || "text-foreground",
                                )}
                              >
                                {due.date}
                                {due.time && (
                                  <span className="ml-1 text-xs font-normal opacity-80">
                                    {due.time}
                                  </span>
                                )}
                              </div>
                              {dueText && stateText && (
                                <div className={cn("text-[11px]", stateText)}>
                                  {dueText}
                                </div>
                              )}
                            </div>
                          ) : loggedFallback ? (
                            <div className="leading-tight text-muted-foreground">
                              <div className="font-medium">
                                {loggedFallback.date}
                              </div>
                              <div className="text-[11px] opacity-80">
                                {loggedFallback.label}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs italic text-muted-foreground">
                              No due date
                            </span>
                          )}
                        </td>

                        <td
                          className={cn(
                            "px-2 py-2 align-middle",
                            stateText || "text-muted-foreground",
                          )}
                        >
                          {durationLabel(activity.duration)}
                        </td>

                        <td className="px-2 py-2 align-middle">
                          {assigneeName ? (
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6 shrink-0">
                                <AvatarFallback className="text-[10px]">
                                  {userInitials(assigneeName)}
                                </AvatarFallback>
                              </Avatar>
                              <span
                                className={cn(
                                  "truncate",
                                  stateText || "text-foreground",
                                )}
                              >
                                {assigneeName}
                                {ownerFromCreator && (
                                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                    · logged
                                  </span>
                                )}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs italic text-muted-foreground">
                              Unassigned
                            </span>
                          )}
                        </td>
                      </>
                    );
                  })()}

                  <td className="px-2 py-2 pr-3 text-right align-middle">
                    {!isDone ? (
                      <ActivityStateBadge
                        activity={{
                          dueAt: activity.due_at,
                          scheduledAt: activity.scheduled_at,
                          completedAt: activity.completed_at,
                          status: activity.status,
                        }}
                      />
                    ) : (
                      <Badge
                        variant="secondary"
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      >
                        {STATUS_LABELS[activity.status]}
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}

            {activities.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No activities match the current filters.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Sticky bulk-action bar shown above the table when at least one row
 * is selected. Single primary action — "Mark done" — matching the
 * canonical sales-tool pattern. Anything else lives in the inspector.
 */
export function ActivitiesBulkBar({
  count,
  onMarkDone,
  onClear,
  pending,
}: {
  count: number;
  onMarkDone: () => void;
  onClear: () => void;
  pending: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky top-0 z-20 mb-3 flex items-center justify-between rounded-md border bg-primary/5 px-3 py-2 text-sm shadow-sm">
      <span className="font-medium">
        {count} selected
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
        <Button size="sm" onClick={onMarkDone} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Marking…
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Mark done
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
