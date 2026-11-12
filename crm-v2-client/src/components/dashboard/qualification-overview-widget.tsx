import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { CheckSquare, Check } from "lucide-react";
import type { DashboardFilters } from "~/api/dashboard";
import { useQualificationOverview } from "~/api/dashboard";

interface QualificationOverviewWidgetProps {
  filters: DashboardFilters;
}

export function QualificationOverviewWidget({
  filters,
}: QualificationOverviewWidgetProps) {
  const { data: responseData, isLoading } = useQualificationOverview(filters);
  const data = responseData?.data;

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

  // Calculate qualification rate
  const qualificationRate =
    data.total > 0 ? (data.qualified / data.total) * 100 : 0;
  const notQualified = data.total - data.qualified;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Qualification Status
        </CardTitle>
        <CheckSquare className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {qualificationRate.toFixed(1)}%
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {data.qualified} of {data.total} leads qualified
        </p>
        <p className="text-xs text-muted-foreground">
          Avg Score: {data.averageScore.toFixed(1)}%
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Qualified</span>
            <span className="font-medium text-green-600">
              {data.qualified}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Not Qualified</span>
            <span className="font-medium text-orange-600">{notQualified}</span>
          </div>
          <div className="border-t pt-2 mt-3">
            <p className="text-xs font-medium mb-2">Criteria Breakdown</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-600" />
                <span className="text-muted-foreground">Needs:</span>
                <span className="font-medium">
                  {data.criteriaBreakdown.withNeeds}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-600" />
                <span className="text-muted-foreground">Budget:</span>
                <span className="font-medium">
                  {data.criteriaBreakdown.withBudget}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-600" />
                <span className="text-muted-foreground">Timeline:</span>
                <span className="font-medium">
                  {data.criteriaBreakdown.withTimeline}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-600" />
                <span className="text-muted-foreground">Plan Type:</span>
                <span className="font-medium">
                  {data.criteriaBreakdown.withPlanType}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-600" />
                <span className="text-muted-foreground">Contact:</span>
                <span className="font-medium">
                  {data.criteriaBreakdown.withContact}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
