import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { Phone, AlertCircle } from "lucide-react";
import { cn } from "~/lib/utils";
import type { DashboardFilters } from "~/api/dashboard";
import { useLeadsContactedStats } from "~/api/dashboard";

interface LeadsContactedWidgetProps {
  filters: DashboardFilters;
}

export function LeadsContactedWidget({ filters }: LeadsContactedWidgetProps) {
  const { data: response, isLoading } = useLeadsContactedStats(filters);
  const data = response?.data;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const progressPercent = data.target
    ? Math.min(100, (data.today / data.target) * 100)
    : 0;
  const isOnTarget = progressPercent >= 100;
  const isBehind = progressPercent < 50;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Leads Contacted vs Target
            </CardTitle>
            <CardDescription>
              Daily activity discipline tracking (Target: {data.target}{" "}
              leads/rep/day)
            </CardDescription>
          </div>
          {data.missedDays > 0 && (
            <Badge
              variant="outline"
              className="text-warning border-warning"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              {data.missedDays} missed days this month
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Today's Progress</span>
            <span
              className={cn(
                "font-medium",
                isOnTarget && "text-success",
                isBehind && "text-destructive",
                !isOnTarget && !isBehind && "text-warning"
              )}
            >
              {data.today} / {data.target} leads
            </span>
          </div>
          <Progress
            value={progressPercent}
            className={cn(
              "h-3",
              isOnTarget && "[&>div]:bg-success",
              isBehind && "[&>div]:bg-destructive",
              !isOnTarget && !isBehind && "[&>div]:bg-warning"
            )}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>MTD Average: {data.mtdAverage} leads/day</span>
            <span>{Math.round(progressPercent)}% of target</span>
          </div>
        </div>

        {/* Per Rep Table */}
        {data.byRep.length > 0 ? (
          <div className="border rounded-lg max-h-50 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales Rep</TableHead>
                  <TableHead className="text-center">Today</TableHead>
                  <TableHead className="text-center">Target</TableHead>
                  <TableHead className="text-center">MTD Avg</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byRep.map((rep) => {
                  const repPercent = rep.target
                    ? (rep.today / rep.target) * 100
                    : 0;
                  const repOnTarget = repPercent >= 100;
                  const repBehind = repPercent < 50;

                  return (
                    <TableRow key={rep.repId}>
                      <TableCell className="font-medium">
                        {rep.repName}
                      </TableCell>
                      <TableCell className="text-center">
                        {rep.today}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {rep.target}
                      </TableCell>
                      <TableCell className="text-center">
                        {rep.mtdAverage}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={cn(
                            repOnTarget &&
                              "text-success border-success bg-success/10",
                            repBehind &&
                              "text-destructive border-destructive bg-destructive/10",
                            !repOnTarget &&
                              !repBehind &&
                              "text-warning border-warning bg-warning/10"
                          )}
                        >
                          {repOnTarget
                            ? "On Target"
                            : repBehind
                              ? "Behind"
                              : "In Progress"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No sales reps found
          </div>
        )}
      </CardContent>
    </Card>
  );
}
