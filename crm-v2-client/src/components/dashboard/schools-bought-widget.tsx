import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { School, Users } from "lucide-react";
import type { DashboardFilters } from "~/api/dashboard";
import { useSchoolsBought } from "~/api/dashboard";

interface SchoolsBoughtWidgetProps {
  filters: DashboardFilters;
}

export function SchoolsBoughtWidget({ filters }: SchoolsBoughtWidgetProps) {
  const { data: responseData, isLoading } = useSchoolsBought(filters);
  const data = responseData?.data;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const provinceEntries = Object.entries(data.byProvince || {}).sort(
    (a, b) => b[1] - a[1]
  );
  // const schoolTypeEntries = Object.entries(data.by || {});
  const totalSchools = data.total || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <School className="h-5 w-5 text-primary" />
          Schools That Have Bought
        </CardTitle>
        <CardDescription>Customer acquisition tracking</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Total Counter */}
        <div className="flex items-center justify-center py-4">
          <div className="text-center">
            <div className="text-5xl font-bold text-primary">
              {totalSchools}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Schools with Won Deals
            </div>
          </div>
        </div>

        {/* By School Type
        {schoolTypeEntries.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <School className="h-4 w-4 text-muted-foreground" />
              By School Type
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {schoolTypeEntries.map(([type, count]) => (
                <div
                  key={type}
                  className="flex items-center justify-between p-2 bg-muted rounded text-sm"
                >
                  <span className="truncate">{type}</span>
                  <span className="font-bold ml-2">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )} */}

        {/* By Province */}
        {provinceEntries.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              By Province
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {provinceEntries.slice(0, 6).map(([province, count]) => (
                <div
                  key={province}
                  className="flex items-center justify-between p-2 bg-muted rounded text-sm"
                >
                  <span className="truncate">{province}</span>
                  <span className="font-bold ml-2">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalSchools === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            No schools acquired in this period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
