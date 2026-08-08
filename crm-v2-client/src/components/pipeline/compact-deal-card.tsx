import { Link } from "react-router";
import { differenceInDays, formatDistanceToNowStrict } from "date-fns";
import {
  Building2,
  Calendar,
  AlertTriangle,
  RotateCcw,
  MessageCircleOff,
} from "lucide-react";
import { Card } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useCurrency } from "~/hooks/use-currency";
import type { Deal } from "~/api/deals";
import type { Activity } from "~/api/activities";
import type { Stage } from "~/api/pipelines";
import {
  ActivitySignalDot,
  ActivityTypeIcon,
} from "~/components/activities/activity-kit";
import {
  activityColor,
  activityColorClasses,
  activityDueLabel,
} from "~/lib/activity-state";
import { cn } from "~/lib/utils";

interface CompactDealCardProps {
  deal: Deal;
  stage: Stage;
  onEdit?: (deal: Deal) => void;
  onDelete?: (dealId: string) => void;
  isDragging?: boolean;
  /**
   * Soonest open activity for this deal — surfaced on the card so a
   * rep can see "next call Apr 19" or "overdue" at a glance. Resolved
   * by the parent Kanban via a single batched fetch so we don't hit
   * an N+1 problem when the board has dozens of deals.
   */
  nextActivity?: Activity | null;
}

const initials = (name?: string | null) => {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
};

/**
 * CompactDealCard — redesigned pipeline card.
 *
 * Optimized for fast visual scanning by sales reps:
 *   - headline deal name with hover→primary color affordance
 *   - large, tabular currency value for instant column totals
 *   - school name with building icon
 *   - owner initials in an avatar pill (rightmost) + expected close date
 *   - stage-age footer: green=fresh, amber=at-risk, red=SLA-breached
 *   - "cold" badge when a deal hasn't been contacted recently
 *   - shuffled-backward badge preserved from the original UX
 *   - subtle left accent bar uses the stage color for instant context
 */
export default function CompactDealCard({
  deal,
  stage,
  isDragging,
  nextActivity,
}: CompactDealCardProps) {
  const { formatCurrency } = useCurrency();

  const daysInStage = deal.currentStageSince
    ? differenceInDays(new Date(), new Date(deal.currentStageSince))
    : 0;

  const overSLA = stage.sla_days > 0 && daysInStage > stage.sla_days;
  const atRisk =
    stage.sla_days > 0 && !overSLA && daysInStage >= stage.sla_days * 0.8;

  const dealValue = deal.value || 0;
  const backwardMoves = deal.stage_data?.backward_moves || 0;

  const owner = deal.assigned_user;
  const ownerName =
    [owner?.first_name, owner?.last_name].filter(Boolean).join(" ") ||
    owner?.first_name ||
    undefined;

  // "Cold" when last contacted was > 7 days ago (defensive fallback).
  const daysSinceContact = deal.last_contacted_at
    ? differenceInDays(new Date(), new Date(deal.last_contacted_at))
    : null;
  const isCold =
    daysSinceContact === null ? false : daysSinceContact > 7;

  const stageColor = stage.color || "oklch(0.55 0.2 262)";

  return (
    <Card
      className={cn(
        "group relative py-0 cursor-grab active:cursor-grabbing",
        "transition-all duration-150 hover:shadow-md hover:border-border-strong",
        isDragging &&
          "shadow-xl ring-2 ring-primary/60 rotate-1 scale-[1.02]",
        overSLA && "border-destructive/70",
        atRisk && !overSLA && "border-[oklch(0.78_0.15_67)]",
      )}
    >
      {/* Left-side stage accent */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md"
        style={{ backgroundColor: stageColor }}
        aria-hidden="true"
      />

      {/* Three rows, matching the column summary card's height:
            1. title …………………… value
            2. school ………… badges · age chip
            3. activity signal …… owner · date
          Everything that used to have its own row (value, last-contact
          line) now shares one; detail lives in tooltips and the deal
          page, scanning speed lives here. */}
      <div className="pl-3 pr-3 py-2 space-y-1">
        {/* Row 1: title + value */}
        <div className="flex items-baseline justify-between gap-2">
          <Link
            to={`/deals/${deal.id}`}
            className="min-w-0 truncate text-sm font-medium leading-snug text-foreground hover:text-primary transition-colors"
            title={deal.deal_name || deal.title}
            onClick={(e) => e.stopPropagation()}
          >
            {deal.deal_name || deal.title}
          </Link>
          <span className="shrink-0 text-[13px] font-semibold text-foreground tabular">
            {formatCurrency(dealValue)}
          </span>
        </div>

        {/* Row 2: school + status chips */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={deal.school?.name}>
              {deal.school?.name ?? "No school"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {backwardMoves > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="flex h-4 items-center gap-0.5 border-amber-300 bg-amber-50 px-1 py-0 text-[10px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    {backwardMoves}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Shuffled back {backwardMoves}× in the pipeline
                </TooltipContent>
              </Tooltip>
            )}
            {isCold && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="flex h-4 items-center gap-0.5 border-dashed px-1 py-0 text-[10px] text-muted-foreground"
                  >
                    <MessageCircleOff className="h-2.5 w-2.5" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Cold — last contact {daysSinceContact} days ago
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[10px] font-medium tabular whitespace-nowrap",
                    overSLA &&
                      "bg-destructive/10 text-destructive border border-destructive/20",
                    atRisk &&
                      !overSLA &&
                      "bg-[oklch(0.78_0.15_67_/_0.12)] text-[oklch(0.45_0.15_60)] border border-[oklch(0.78_0.15_67_/_0.3)]",
                    !overSLA &&
                      !atRisk &&
                      "bg-muted text-muted-foreground border border-border",
                  )}
                >
                  {overSLA && <AlertTriangle className="h-2.5 w-2.5" />}
                  {daysInStage}d
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {daysInStage} days in {stage.name}
                {overSLA && " — SLA breached"}
                {atRisk && !overSLA && " — approaching SLA"}
                {deal.last_contacted_at &&
                  !isCold &&
                  ` · last contact ${formatDistanceToNowStrict(
                    new Date(deal.last_contacted_at),
                    { addSuffix: true },
                  )}`}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Row 3: activity signal + owner/date */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <DealActivitySignal nextActivity={nextActivity} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {deal.expectedCloseDate && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground tabular">
                <Calendar className="h-3 w-3" />
                {new Date(deal.expectedCloseDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            {owner && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex size-4.5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                    {initials(ownerName)}
                  </div>
                </TooltipTrigger>
                <TooltipContent>{ownerName || "Owner"}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * One-line activity hint shown on every Kanban deal card. Three states:
 *
 *   - planned + future:       "Next call · Apr 19"   (gray dot)
 *   - planned + due today:    "Due today · 2:00 PM"  (green dot + bold)
 *   - planned + overdue:      "Overdue · 3 days"     (red dot + bold)
 *   - no planned activity:    "No next step"          (amber, subtle)
 */
function DealActivitySignal({
  nextActivity,
}: {
  nextActivity?: Activity | null;
}) {
  if (!nextActivity) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
        No next step
      </div>
    );
  }

  const color = activityColor({
    dueAt: nextActivity.due_at,
    scheduledAt: nextActivity.scheduled_at,
    completedAt: nextActivity.completed_at,
    status: nextActivity.status,
  });
  const label = activityDueLabel({
    dueAt: nextActivity.due_at,
    scheduledAt: nextActivity.scheduled_at,
    completedAt: nextActivity.completed_at,
    status: nextActivity.status,
  });
  const tone = color
    ? activityColorClasses[color].text
    : "text-muted-foreground";
  const isStrong = color === "red" || color === "green";

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[11px]",
        tone,
        isStrong && "font-medium",
      )}
    >
      <ActivitySignalDot
        activity={{
          dueAt: nextActivity.due_at,
          scheduledAt: nextActivity.scheduled_at,
          completedAt: nextActivity.completed_at,
          status: nextActivity.status,
        }}
      />
      <ActivityTypeIcon
        type={nextActivity.type}
        size="xs"
        className="shrink-0"
      />
      <span className="truncate" title={nextActivity.subject || label || undefined}>
        {label || "Scheduled"}
        {nextActivity.subject ? ` · ${nextActivity.subject}` : ""}
      </span>
    </div>
  );
}
