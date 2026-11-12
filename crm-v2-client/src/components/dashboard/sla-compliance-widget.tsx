import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { useSLACompliance } from "~/api/dashboard";
import type { DashboardFilters } from "~/api/dashboard";
import { cn } from "~/lib/utils";
import { Progress } from "~/components/ui/progress";

interface SLAComplianceWidgetProps {
  filters: DashboardFilters;
}

export function SLAComplianceWidget({ filters }: SLAComplianceWidgetProps) {
  const { data: slaComplianceData, isLoading, error } = useSLACompliance(filters);
  const data = slaComplianceData?.data;
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

  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">SLA Compliance</CardTitle>
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm font-medium text-destructive">
            SLA data unavailable
          </p>
          <p className="text-xs text-muted-foreground">
            The widget could not load lead SLA status. Refresh after the API is
            reachable.
          </p>
        </CardContent>
      </Card>
    );
  }

  const complianceRate = data?.complianceRate || 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">SLA Compliance</CardTitle>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{complianceRate.toFixed(1)}%</div>
        <p className="text-xs text-muted-foreground mt-1">
          {data?.total || 0} active leads checked
        </p>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-3 w-3" />
              <span>On Track</span>
            </div>
            <span className="font-medium">{data?.onTrack || 0}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-3 w-3" />
              <span>At Risk</span>
            </div>
            <span className="font-medium">{data?.atRisk || 0}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-3 w-3" />
              <span>Breached</span>
            </div>
            <span className="font-medium">{data?.breached || 0}</span>
          </div>
        </div>

        {(data?.total || 0) === 0 && (
          <p className="mt-3 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
            No active leads match the selected filters.
          </p>
        )}

        {(data?.breached || 0) > 0 && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
            Breaches stay open until the required SLA obligation is satisfied.
            A recent note or touch alone does not clear this count.
          </p>
        )}

        <Progress
          value={complianceRate}
          className={cn(
            "h-2 mt-4",
            complianceRate >= 80
              ? "[&>div]:bg-green-500"
              : complianceRate >= 60
                ? "[&>div]:bg-orange-500"
                : "[&>div]:bg-red-500",
          )}
        />
      </CardContent>
    </Card>
  );
}
