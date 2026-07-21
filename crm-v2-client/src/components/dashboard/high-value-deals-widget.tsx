import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
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
import { Star, AlertTriangle, Clock } from "lucide-react";
import type { DashboardFilters, HighValueDeal } from "~/api/dashboard";
import { useHighValueDeals } from "~/api/dashboard";
import { cn } from "~/lib/utils";
import { Link } from "react-router";

interface HighValueDealsWidgetProps {
  filters: DashboardFilters;
}

const formatCurrency = (value: number) => {
  return `$${value.toLocaleString()}`;
};

export function HighValueDealsWidget({ filters }: HighValueDealsWidgetProps) {
  const { data: responseData, isLoading } = useHighValueDeals(filters);

  // Extract the array from the response
  const deals: HighValueDeal[] = Array.isArray(responseData)
    ? responseData
    : responseData?.data || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Calculate risk level based on SLA breach status
  const getRiskLevel = (deal: HighValueDeal) => {
    if (deal.isBreached) {
      return {
        label: "SLA Breach",
        variant: "destructive" as const,
        icon: AlertTriangle,
      };
    } else if (deal.daysInStage > deal.slaDays * 0.8) {
      return {
        label: "At Risk",
        variant: "warning" as const,
        icon: Clock,
      };
    }
    return {
      label: "On Track",
      variant: "success" as const,
      icon: null,
    };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-orange-600" />
          High-Value Deals
        </CardTitle>
        <CardDescription>
          Top deals tracked by value and stage progression
        </CardDescription>
      </CardHeader>
      <CardContent>
        {deals && deals.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead className="text-right">Deal Value</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-center">Days in Stage</TableHead>
                  <TableHead className="text-right">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.slice(0, 10).map((deal) => {
                  const risk = getRiskLevel(deal);
                  return (
                    <TableRow key={deal.id}>
                      <TableCell>
                        <Link
                          to={`/deals/${deal.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {deal.schoolName}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {deal.dealName}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(deal.totalContractValue)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{deal.stageName}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {deal.ownerName}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Clock
                            className={cn(
                              "h-3 w-3",
                              deal.isBreached
                                ? "text-destructive"
                                : deal.daysInStage > deal.slaDays * 0.8
                                  ? "text-orange-600"
                                  : "text-muted-foreground"
                            )}
                          />
                          <span
                            className={cn(
                              deal.isBreached && "text-destructive font-medium"
                            )}
                          >
                            {deal.daysInStage}d
                          </span>
                          <span className="text-xs text-muted-foreground">
                            / {deal.slaDays}d
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {risk.variant === "destructive" ? (
                          <Badge
                            variant="outline"
                            className="text-destructive border-destructive bg-destructive/10"
                          >
                            {risk.icon && <risk.icon className="h-3 w-3 mr-1" />}
                            {risk.label}
                          </Badge>
                        ) : risk.variant === "warning" ? (
                          <Badge
                            variant="outline"
                            className="text-orange-600 border-orange-600 bg-orange-600/10"
                          >
                            {risk.icon && <risk.icon className="h-3 w-3 mr-1" />}
                            {risk.label}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-green-600 border-green-600 bg-green-600/10"
                          >
                            {risk.label}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No high-value deals found
          </div>
        )}
      </CardContent>
    </Card>
  );
}
