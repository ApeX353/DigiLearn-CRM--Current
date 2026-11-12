import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { DashboardFilters } from "~/api/dashboard";
import { useSalesMetrics } from "~/api/dashboard";
import { cn } from "~/lib/utils";

interface SalesMetricsWidgetProps {
  filters: DashboardFilters;
}

export function SalesMetricsWidget({ filters }: SalesMetricsWidgetProps) {
  const { data: salesMetricsData, isLoading } = useSalesMetrics(filters);
  const data = salesMetricsData?.data;
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  // Calculate growth percentages
  const principalGrowth =
    data.previousPeriod.principalSold > 0
      ? ((data.principalSold - data.previousPeriod.principalSold) /
          data.previousPeriod.principalSold) *
        100
      : 0;

  const totalContractGrowth =
    data.previousPeriod.totalContractValue > 0
      ? ((data.totalContractValue - data.previousPeriod.totalContractValue) /
          data.previousPeriod.totalContractValue) *
        100
      : 0;

  const cashGrowth =
    data.previousPeriod.cashCollected > 0
      ? ((data.cashCollected - data.previousPeriod.cashCollected) /
          data.previousPeriod.cashCollected) *
        100
      : 0;

  const principalGrowthPositive = principalGrowth >= 0;
  const contractGrowthPositive = totalContractGrowth >= 0;
  const cashGrowthPositive = cashGrowth >= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Sales Performance</CardTitle>
        {principalGrowthPositive ? (
          <TrendingUp className="h-4 w-4 text-green-600" />
        ) : (
          <TrendingDown className="h-4 w-4 text-destructive" />
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          ${data.principalSold.toLocaleString()}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Principal sold this period
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Principal Growth</span>
            <span
              className={cn(
                "font-medium",
                principalGrowthPositive ? "text-green-600" : "text-destructive"
              )}
            >
              {principalGrowthPositive ? "+" : ""}
              {principalGrowth.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total Contract Value</span>
            <span className="font-medium">
              ${data.totalContractValue.toLocaleString()}
              <span
                className={cn(
                  "ml-1",
                  contractGrowthPositive ? "text-green-600" : "text-destructive"
                )}
              >
                ({contractGrowthPositive ? "+" : ""}
                {totalContractGrowth.toFixed(1)}%)
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Cash Collected</span>
            <span className="font-medium">
              ${data.cashCollected.toLocaleString()}
              <span
                className={cn(
                  "ml-1",
                  cashGrowthPositive ? "text-green-600" : "text-destructive"
                )}
              >
                ({cashGrowthPositive ? "+" : ""}
                {cashGrowth.toFixed(1)}%)
              </span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
