import { Clock, AlertTriangle, Flame } from "lucide-react";
import { differenceInDays } from "date-fns";
import type { Deal } from "~/api/deals";
import { useCurrency } from "~/hooks/use-currency";
import { cn } from "~/lib/utils";

interface KanbanHeaderProps {
  deals: Deal[];
  stage: {
    name: string;
    description?: string;
    color: string;
    sla_days: number;
    probability: number;
    /** false for a retired stage that still holds deals — see the board. */
    is_active?: boolean;
  };
}

/**
 * KanbanHeader — stage column header.
 *
 * Hierarchy (scan order):
 *   1. 3px colored accent bar for instant stage recognition
 *   2. Stage name + deal count
 *   3. Large tabular stage total + weighted value pill
 *   4. Metadata strip: win prob. · SLA · overdue count
 *   5. Optional description
 *
 * The overdue count is the single most important signal for a
 * manager — it shows at a glance which stages are draining reps'
 * time without progress.
 */
export function KanbanHeader({ deals, stage }: KanbanHeaderProps) {
  const { formatCurrency } = useCurrency();

  const count = deals?.length ?? 0;
  const stageColor = stage.color || "oklch(0.55 0.2 262)";

  let totalValue = 0;
  let overdueCount = 0;
  let hotCount = 0;

  for (const d of deals ?? []) {
    totalValue += Number(d.value) || 0;

    if (stage.sla_days > 0 && d.currentStageSince) {
      const days = differenceInDays(
        new Date(),
        new Date(d.currentStageSince),
      );
      if (days > stage.sla_days) overdueCount += 1;
    }

    if ((d as unknown as { temperature?: string }).temperature === "hot") {
      hotCount += 1;
    }
  }

  const weightedValue = Math.round((totalValue * stage.probability) / 100);

  return (
    <div
      className="relative px-3 pt-3 pb-2 border-b bg-background rounded-t-md"
      style={{ ["--stage-color" as string]: stageColor }}
    >
      {/* top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px] rounded-t-md"
        style={{ backgroundColor: stageColor }}
        aria-hidden="true"
      />

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h3
          className="text-sm font-semibold tracking-tight truncate"
          title={
            stage.is_active === false
              ? `${stage.name} — this stage was retired while these deals were still in it`
              : stage.name
          }
        >
          {stage.name}
          {/* A retired stage still holding deals: the column exists only
              so the work inside it is visible and can be moved out. */}
          {stage.is_active === false && (
            <span className="ml-1.5 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
              Retired — move these
            </span>
          )}
        </h3>
        <span className="text-xs font-medium text-muted-foreground tabular shrink-0">
          {count} {count === 1 ? "deal" : "deals"}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <div className="text-[15px] font-semibold text-foreground tabular leading-none">
          {formatCurrency(totalValue)}
        </div>
        {totalValue > 0 && stage.probability > 0 && stage.probability < 100 && (
          <span
            className="text-[10px] text-muted-foreground tabular"
            title={`Weighted by ${stage.probability}% win probability`}
          >
            ≈ {formatCurrency(weightedValue)}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ backgroundColor: stageColor }}
          />
          {stage.probability}% win
        </span>

        {stage.sla_days > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            SLA {stage.sla_days}d
          </span>
        )}

        {overdueCount > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 h-[18px]",
              "bg-red-50 text-red-700 border border-red-200",
              "dark:bg-red-950/30 dark:text-red-400 dark:border-red-900",
            )}
            title={`${overdueCount} deal${
              overdueCount === 1 ? "" : "s"
            } past SLA in this stage`}
          >
            <AlertTriangle className="h-3 w-3" />
            {overdueCount} overdue
          </span>
        )}

        {hotCount > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 h-[18px]",
              "bg-orange-50 text-orange-700 border border-orange-200",
              "dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900",
            )}
            title={`${hotCount} hot lead${hotCount === 1 ? "" : "s"}`}
          >
            <Flame className="h-3 w-3" />
            {hotCount} hot
          </span>
        )}
      </div>

      {stage.description && (
        <p
          className="mt-1.5 text-[11px] text-muted-foreground truncate"
          title={stage.description}
        >
          {stage.description}
        </p>
      )}
    </div>
  );
}
