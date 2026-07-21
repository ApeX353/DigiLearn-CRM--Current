import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { useLeadConversion } from "~/api/dashboard";
import type { DashboardFilters } from "~/api/dashboard";

interface LeadConversionWidgetProps {
  filters: DashboardFilters;
}

export function LeadConversionWidget({ filters }: LeadConversionWidgetProps) {
  const { data: leadConversionData, isLoading } = useLeadConversion(filters);
  const data = leadConversionData?.data;
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Lead Conversion
        </CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {(data?.conversionRate || 0).toFixed(1)}%
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {data?.converted || 0} of {data?.totalLeads || 0} leads converted
        </p>
        <div className="mt-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Active</span>
            <span className="font-medium">{data?.active || 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Disqualified</span>
            <span className="font-medium text-red-600">
              {data?.disqualified || 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Avg. Days to Convert</span>
            <span className="font-medium">
              {data?.avgDaysToConvert || 0} days
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
