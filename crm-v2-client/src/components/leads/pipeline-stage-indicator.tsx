import { AlertCircle, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { cn } from "~/lib/utils";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import type { Stage } from "~/api/pipelines";

interface PipelineStageIndicatorProps {
  stage: Stage;
  totalStages?: number;
  slaBreached: boolean;
  currentSlaDueDate: Date | null;
  slaBreachCount: number;
}

export function PipelineStageIndicator({
  stage,
  totalStages,
  slaBreached,
  currentSlaDueDate,
  slaBreachCount,
}: PipelineStageIndicatorProps) {
  // Calculate SLA status
  const daysUntilDue = currentSlaDueDate
    ? differenceInDays(new Date(currentSlaDueDate), new Date())
    : null;

  const slaStatus = slaBreached
    ? "breached"
    : daysUntilDue !== null && daysUntilDue <= 2
      ? "at-risk"
      : "on-track";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pipeline Stage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stage Info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: stage?.color || "#6b7280" }}
            />
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm truncate">{stage.name}</h4>
              {totalStages && (
                <p className="text-xs text-muted-foreground">
                  Stage {stage.order} of {totalStages}
                </p>
              )}
            </div>
          </div>

          {/* Win Probability */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Win Probability
              </span>
              <span className="font-medium">{stage.probability}%</span>
            </div>
            <Progress value={stage.probability} className="h-1.5" />
          </div>
        </div>

        {/* SLA Status */}
        <div
          className={cn(
            "rounded-lg p-3 space-y-2",
            slaStatus === "breached" && "bg-red-50 dark:bg-red-950/30",
            slaStatus === "at-risk" && "bg-orange-50 dark:bg-orange-950/30",
            slaStatus === "on-track" && "bg-green-50 dark:bg-green-950/30",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              SLA Status
            </span>
            <Badge
              variant={
                slaStatus === "breached"
                  ? "destructive"
                  : slaStatus === "at-risk"
                    ? "default"
                    : "secondary"
              }
              className={cn(
                slaStatus === "at-risk" && "bg-orange-600 hover:bg-orange-700",
                slaStatus === "on-track" &&
                  "bg-green-600 hover:bg-green-700 text-white",
              )}
            >
              {slaStatus === "breached"
                ? "Breached"
                : slaStatus === "at-risk"
                  ? "At Risk"
                  : "On Track"}
            </Badge>
          </div>

          {currentSlaDueDate && (
            <div className="text-xs space-y-0.5">
              {slaBreached ? (
                <>
                  <p className="text-red-700 dark:text-red-300 font-medium">
                    Overdue by {Math.abs(daysUntilDue!)} days
                  </p>
                  <p className="text-red-600 dark:text-red-400">
                    Was due {format(new Date(currentSlaDueDate), "MMM dd")}
                  </p>
                </>
              ) : (
                <>
                  <p
                    className={cn(
                      "font-medium",
                      slaStatus === "at-risk"
                        ? "text-orange-700 dark:text-orange-300"
                        : "text-green-700 dark:text-green-300",
                    )}
                  >
                    Due{" "}
                    {formatDistanceToNow(new Date(currentSlaDueDate), {
                      addSuffix: true,
                    })}
                  </p>
                  <p
                    className={cn(
                      slaStatus === "at-risk"
                        ? "text-orange-600 dark:text-orange-400"
                        : "text-green-600 dark:text-green-400",
                    )}
                  >
                    {format(new Date(currentSlaDueDate), "MMM dd, yyyy")}
                  </p>
                </>
              )}
            </div>
          )}

          {slaBreachCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-current/10">
              <AlertCircle className="h-3 w-3" />
              <span>
                {slaBreachCount} {slaBreachCount === 1 ? "breach" : "breaches"}{" "}
                total
              </span>
            </div>
          )}

          {!currentSlaDueDate && (
            <p className="text-xs text-muted-foreground">No active SLA</p>
          )}
        </div>

        {/* Stage SLA Days */}
        <div className="text-xs text-muted-foreground text-center">
          Standard SLA: {stage.sla_days} {stage.sla_days === 1 ? "day" : "days"}
        </div>
      </CardContent>
    </Card>
  );
}
