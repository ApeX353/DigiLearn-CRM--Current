import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Calendar } from "lucide-react";
import type { DashboardFilters } from "~/api/dashboard";
import { useDemoStats } from "~/api/dashboard";

interface DemoStatsWidgetProps {
  filters: DashboardFilters;
}

export function DemoStatsWidget({ filters }: DemoStatsWidgetProps) {
  const { data: demoStatsData, isLoading } = useDemoStats(filters);
const data = demoStatsData?.data;
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Demo Activity</CardTitle>
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{data.demoToProposalRate.toFixed(1)}%</div>
        <p className="text-xs text-muted-foreground mt-1">
          Demo conversion rate
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Scheduled</span>
            <span className="font-medium">{data.upcomingDemos}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Completed</span>
            <span className="font-medium text-green-600">{data.completedDemos}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Pending</span>
            <span className="font-medium text-orange-600">{data.upcomingDemos - data.completedDemos}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
