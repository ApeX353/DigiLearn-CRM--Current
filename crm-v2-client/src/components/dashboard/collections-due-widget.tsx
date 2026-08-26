import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { DollarSign } from "lucide-react";
import type { DashboardFilters } from "~/api/dashboard";
import { useCollectionsDue } from "~/api/dashboard";

interface CollectionsDueWidgetProps {
  filters: DashboardFilters;
}

export function CollectionsDueWidget({ filters }: CollectionsDueWidgetProps) {
  const { data: collectionDueData, isLoading } = useCollectionsDue(filters);
  const data = collectionDueData?.data;
  
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
        <CardTitle className="text-sm font-medium">Collections Due</CardTitle>
        <DollarSign className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          ${data.overdue.toLocaleString()}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Overdue collections
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Due Today</span>
            <span className="font-medium">${data.dueToday.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Due in 7 Days</span>
            <span className="font-medium">${data.dueIn7Days.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Due in 30 Days</span>
            <span className="font-medium">${data.dueIn30Days.toLocaleString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
