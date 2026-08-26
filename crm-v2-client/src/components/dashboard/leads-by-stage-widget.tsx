import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "~/components/ui/chart";
import { Pie, PieChart } from "recharts";
import { useLeadsByStage } from "~/api/dashboard";
import type { DashboardFilters } from "~/api/dashboard";
import type { LeadStatus } from "~/api/leads";
import { AlertTriangle } from "lucide-react";

interface LeadsByStageWidgetProps {
  filters: DashboardFilters;
}

const COLORS: Record<LeadStatus, string> = {
  New: "hsl(210, 100%, 50%)",
  Contacted: "hsl(190, 100%, 40%)",
  Qualified: "hsl(140, 70%, 45%)",
  Nurture: "hsl(270, 70%, 50%)",
  Disqualified: "hsl(0, 0%, 50%)",
  Converted: "hsl(160, 70%, 40%)",
};

export function LeadsByStageWidget({ filters }: LeadsByStageWidgetProps) {
  const { data: stageData, isLoading, error } = useLeadsByStage(filters);
  const data = stageData?.data || [];

  const { chartData, chartConfig, total } = useMemo(() => {
    const config: ChartConfig = {};
    const items = data.map((stage) => {
      const key = stage.stage;
      config[key] = {
        label: stage.stage,
        color: COLORS[key] || "#6b7280",
      };
      return {
        name: key,
        value: stage.count,
        fill: `var(--color-${key})`,
      };
    });

    return {
      chartData: items,
      chartConfig: config,
      total: data.reduce((acc, cur) => acc + cur.count, 0),
    };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Leads by Stage</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-50 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Leads by Stage</CardTitle>
        </CardHeader>
        <CardContent className="flex h-50 flex-col items-center justify-center gap-2 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <p className="text-sm font-medium text-destructive">
            Lead stage data unavailable
          </p>
          <p className="text-xs text-muted-foreground">
            Could not load the live lead distribution for these filters.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leads by Stage</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="h-50 flex flex-col items-center justify-center gap-1 text-center text-muted-foreground">
            <p className="text-sm font-medium">No leads match this view</p>
            <p className="text-xs">
              Create leads or widen the selected filters to see stage mix.
            </p>
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square max-h-50"
          >
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
              />
              <ChartTooltip
                content={<ChartTooltipContent hideLabel nameKey="name" />}
              />
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
            </PieChart>
          </ChartContainer>
        )}
        <div className="text-center mt-2">
          <p className="text-2xl font-bold">{total}</p>
          <p className="text-sm text-muted-foreground">Total Leads</p>
        </div>
      </CardContent>
    </Card>
  );
}
