import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  DollarSign,
  TrendingUp,
  Wallet,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import type { ExecutiveKPIs as ExecutiveKPIsType } from "~/api/dashboard";
import { cn } from "~/lib/utils";
import { Progress } from "~/components/ui/progress";

interface ExecutiveKPIsProps {
  data?: ExecutiveKPIsType;
  isLoading: boolean;
}

/**
 * ExecutiveKPIs — redesigned to read like a manager's cockpit.
 *
 * Key upgrades:
 *   - tabular number alignment for at-a-glance comparison across cards
 *   - dedicated label-overline style for titles
 *   - progress bar on the Cash Collected card (vs. monthly target)
 *   - trend chip uses explicit up/down semantics and status color tokens
 *   - consistent iconography using the semantic color tokens (success/info/primary/warning)
 *     instead of raw tailwind palette classes — plays nicely with dark mode
 */
export function ExecutiveKPIs({ data, isLoading }: ExecutiveKPIsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-3 w-[120px]" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-[140px] mb-2" />
              <Skeleton className="h-3 w-[90px]" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Executive metrics are not available for the selected filters.
        </CardContent>
      </Card>
    );
  }

  // Compare cash against the target for the SELECTED window, not the whole
  // month. On the Today filter the old form put one day's cash over a monthly
  // target, so the card read "0% of target" every morning regardless of how
  // the day went. Falls back to the monthly figure if the server is older.
  const effectiveTarget = data.windowTarget ?? data.monthlyTarget;
  const targetProgress =
    effectiveTarget > 0
      ? Math.min((data.cashCollected / effectiveTarget) * 100, 100)
      : 0;

  const qualificationRate =
    data.qualification.totalLeads > 0
      ? (data.qualification.qualifiedLeads / data.qualification.totalLeads) * 100
      : 0;

  const nf = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const kpiCards = [
    {
      title: "Cash Collected",
      value: nf(data.cashCollected),
      subtitle: `Target ${nf(effectiveTarget)}`,
      trend: {
        value: targetProgress,
        label: `${targetProgress.toFixed(0)}% of target`,
        positive: true,
      },
      progress: targetProgress,
      icon: DollarSign,
      tone: "success" as const,
    },
    {
      title: "Principal Sold",
      value: nf(data.principalSold),
      subtitle:
        data.overdueAmount > 0
          ? `Overdue ${nf(data.overdueAmount)}`
          : "No overdue",
      trend:
        data.overdueAmount > 0
          ? {
              value: -10,
              label: "Overdue exposure",
              positive: false,
            }
          : null,
      icon: Wallet,
      tone: "info" as const,
    },
    {
      title: "Pipeline Value",
      value: nf(data.pipelineValue),
      subtitle: `Coverage ${data.pipelineCoverageRatio.toFixed(1)}×`,
      trend: {
        value: data.pipelineCoverageRatio,
        label: `${data.pipelineCoverageRatio.toFixed(1)}× coverage`,
        positive: data.pipelineCoverageRatio >= 3,
      },
      icon: TrendingUp,
      tone: "primary" as const,
    },
    {
      title: "Lead Qualification",
      value: `${data.qualification.qualifiedLeads} / ${data.qualification.totalLeads}`,
      subtitle: `Avg score ${data.qualification.averageScore.toFixed(1)}%`,
      trend: {
        value: qualificationRate,
        label: `${qualificationRate.toFixed(0)}% qualified`,
        positive: qualificationRate >= 40,
      },
      icon: CheckCircle,
      tone: "warning" as const,
    },
  ];

  const toneClasses: Record<string, { bg: string; text: string }> = {
    success: {
      bg: "bg-[oklch(0.64_0.17_150_/_0.12)]",
      text: "text-[oklch(0.5_0.16_150)] dark:text-[oklch(0.72_0.17_150)]",
    },
    info: {
      bg: "bg-[oklch(0.62_0.15_230_/_0.12)]",
      text: "text-[oklch(0.5_0.15_230)] dark:text-[oklch(0.72_0.15_230)]",
    },
    primary: {
      bg: "bg-primary/10",
      text: "text-primary",
    },
    warning: {
      bg: "bg-[oklch(0.78_0.15_67_/_0.15)]",
      text: "text-[oklch(0.55_0.15_60)] dark:text-[oklch(0.82_0.15_67)]",
    },
  };

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      {kpiCards.map((kpi, index) => {
        const Icon = kpi.icon;
        const tone = toneClasses[kpi.tone];
        const TrendIcon =
          kpi.trend?.positive === false ? ArrowDownRight : ArrowUpRight;
        return (
          <Card
            key={index}
            className="hover-lift overflow-hidden"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="label-overline">{kpi.title}</CardTitle>
              <div
                className={cn(
                  "flex size-9 items-center justify-center rounded-md",
                  tone.bg,
                )}
              >
                <Icon className={cn("h-4 w-4", tone.text)} />
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="text-[22px] font-semibold tabular leading-tight">
                {kpi.value}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground truncate">
                  {kpi.subtitle}
                </p>
                {kpi.trend && (
                  <div
                    className={cn(
                      "flex items-center gap-0.5 text-[11px] font-medium tabular shrink-0",
                      kpi.trend.positive
                        ? "text-[oklch(0.5_0.16_150)] dark:text-[oklch(0.72_0.17_150)]"
                        : "text-destructive",
                    )}
                  >
                    <TrendIcon className="h-3 w-3" />
                    {kpi.trend.label}
                  </div>
                )}
              </div>
              {typeof kpi.progress === "number" && (
                <Progress
                  value={kpi.progress}
                  className="mt-3 h-1.5"
                  aria-label={`${kpi.title} progress`}
                />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
