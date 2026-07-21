import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  DollarSign,
  TrendingUp,
  Wallet,
  CheckCircle,
  Target,
} from "lucide-react";
import type { ExecutiveKPIs as ExecutiveKPIsType } from "~/api/dashboard";
import { cn } from "~/lib/utils";

interface ExecutiveKPIsProps {
  data?: ExecutiveKPIsType;
  isLoading: boolean;
}

export function ExecutiveKPIs({ data, isLoading }: ExecutiveKPIsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-[120px] mb-2" />
              <Skeleton className="h-3 w-[80px]" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  // Calculate progress toward monthly target
  const targetProgress =
    data.monthlyTarget > 0
      ? (data.cashCollected / data.monthlyTarget) * 100
      : 0;

  // Calculate qualification rate
  const qualificationRate =
    data.qualification.totalLeads > 0
      ? (data.qualification.qualifiedLeads / data.qualification.totalLeads) * 100
      : 0;

  const kpiCards = [
    {
      title: "Cash Collected",
      value: `$${data.cashCollected.toLocaleString()}`,
      subtitle: `Target: $${data.monthlyTarget.toLocaleString()}`,
      percentage: targetProgress,
      icon: DollarSign,
      iconColor: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-950",
    },
    {
      title: "Principal Sold",
      value: `$${data.principalSold.toLocaleString()}`,
      subtitle: `Overdue: $${data.overdueAmount.toLocaleString()}`,
      percentage: data.overdueAmount > 0 ? -10 : 0, // Negative indicator if overdue exists
      icon: Wallet,
      iconColor: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-950",
    },
    {
      title: "Pipeline Value",
      value: `$${data.pipelineValue.toLocaleString()}`,
      subtitle: `Coverage: ${data.pipelineCoverageRatio.toFixed(1)}x`,
      percentage: data.pipelineCoverageRatio * 10, // Show as percentage-like indicator
      icon: TrendingUp,
      iconColor: "text-purple-600",
      bgColor: "bg-purple-100 dark:bg-purple-950",
    },
    {
      title: "Lead Qualification",
      value: `${data.qualification.qualifiedLeads} / ${data.qualification.totalLeads}`,
      subtitle: `Avg Score: ${data.qualification.averageScore.toFixed(1)}%`,
      percentage: qualificationRate,
      icon: CheckCircle,
      iconColor: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-950",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpiCards.map((kpi, index) => {
        const Icon = kpi.icon;
        const isPositive = kpi.percentage >= 0;

        return (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {kpi.title}
              </CardTitle>
              <div className={cn("p-2 rounded-full", kpi.bgColor)}>
                <Icon className={cn("h-4 w-4", kpi.iconColor)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="flex items-center gap-2 mt-2">
                {kpi.percentage !== 0 && (
                  <div
                    className={cn(
                      "flex items-center text-xs font-medium",
                      isPositive ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {isPositive ? (
                      <Target className="h-3 w-3 mr-1" />
                    ) : (
                      <Target className="h-3 w-3 mr-1" />
                    )}
                    {Math.abs(kpi.percentage).toFixed(1)}%
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{kpi.subtitle}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
