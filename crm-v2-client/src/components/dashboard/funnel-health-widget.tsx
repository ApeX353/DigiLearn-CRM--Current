import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Progress } from "~/components/ui/progress";
import { Filter, Target, TrendingUp, AlertCircle } from "lucide-react";
import type { DashboardFilters } from "~/api/dashboard";
import { useFunnelHealth } from "~/api/dashboard";
import { cn } from "~/lib/utils";

interface FunnelHealthWidgetProps {
  filters: DashboardFilters;
}

const formatCurrency = (value: number) => {
  return `$${value.toLocaleString()}`;
};

export function FunnelHealthWidget({ filters }: FunnelHealthWidgetProps) {
  const { data: funnelHealthData, isLoading } = useFunnelHealth(filters);
  const data = funnelHealthData?.data;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const coverageHealthy = (data.coverageRatio || 0) >= 100;
  const coverageWarning =
    (data.coverageRatio || 0) >= 75 && (data.coverageRatio || 0) < 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-primary" />
          Funnel Health vs Target
        </CardTitle>
        <CardDescription>
          Pipeline coverage analysis with stage breakdown
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Coverage Overview */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              Monthly Target
            </div>
            <div className="text-lg font-bold">
              {formatCurrency(data.monthlyTarget || 0)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Required Pipeline
            </div>
            <div className="text-lg font-bold">
              {formatCurrency(data.requiredPipeline || 0)}
            </div>
            <div className="text-xs text-muted-foreground">
              @ {data.expectedWinRate || 0}% win rate
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Actual Pipeline</div>
            <div
              className={cn(
                "text-lg font-bold",
                coverageHealthy && "text-green-600",
                coverageWarning && "text-orange-600",
                !coverageHealthy && !coverageWarning && "text-destructive"
              )}
            >
              {formatCurrency(data.actualPipeline || 0)}
            </div>
          </div>
        </div>

        {/* Coverage Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pipeline Coverage</span>
            <span
              className={cn(
                "font-medium",
                coverageHealthy && "text-green-600",
                coverageWarning && "text-orange-600",
                !coverageHealthy && !coverageWarning && "text-destructive"
              )}
            >
              {data.coverageRatio || 0}%
            </span>
          </div>
          <div className="relative">
            <Progress
              value={Math.min(100, data.coverageRatio || 0)}
              className={cn(
                "h-4",
                coverageHealthy && "[&>div]:bg-green-600",
                coverageWarning && "[&>div]:bg-orange-600",
                !coverageHealthy && !coverageWarning && "[&>div]:bg-destructive"
              )}
            />
            {/* Target Line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-foreground"
              style={{ left: "100%", transform: "translateX(-50%)" }}
            />
          </div>
          {!coverageHealthy && (
            <div className="flex items-center gap-1 text-xs text-orange-600">
              <AlertCircle className="h-3 w-3" />
              Need{" "}
              {formatCurrency(
                (data.requiredPipeline || 0) - (data.actualPipeline || 0)
              )}{" "}
              more in pipeline
            </div>
          )}
        </div>

        {/* Stage Breakdown */}
        {data.stageBreakdown && data.stageBreakdown.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Stage Breakdown</h4>
            <div className="space-y-2">
              {data.stageBreakdown.map((stage) => (
                <div key={stage.stageName} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: stage.stageColor }}
                      />
                      <span>{stage.stageName}</span>
                      <span className="text-muted-foreground">
                        ({stage.dealCount} deals)
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">
                        {formatCurrency(stage.value)}
                      </span>
                      {stage.lostCount > 0 && (
                        <span className="text-xs text-destructive">
                          -{formatCurrency(stage.lostValue)} lost
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (stage.value / (data.actualPipeline || 1)) * 100)}%`,
                        backgroundColor: stage.stageColor,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
