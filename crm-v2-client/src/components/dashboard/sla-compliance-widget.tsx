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
  const { data: slaComplianceData, isLoading } = useSLACompliance(filters);
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
          {data?.total || 0} total leads
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
