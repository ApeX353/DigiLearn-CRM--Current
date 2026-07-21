import { Clock } from "lucide-react";
import type { Deal } from "~/api/deals";
import { useCurrency } from "~/hooks/use-currency";
import { Badge } from "../ui/badge";

interface KanbanHeaderProps {
  deals: Deal[];
  stage: {
    name: string;
    description?: string;
    color: string;
    sla_days: number;
    probability: number;
  };
}

export function KanbanHeader({ deals, stage }: KanbanHeaderProps) {
  const { formatCurrency } = useCurrency();
  const totalValue =
    deals?.reduce((sum, d) => sum + (Number(d.value) || 0), 0) ?? 0;

  return (
    <div className="p-3 border-b space-y-4">
      <div className="flex items-center gap-2">
        <div
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: stage.color || "#94a3b8" }}
        />
        <h3 className="text-sm font-semibold truncate">{stage.name}</h3>
        <Badge variant="secondary" className="ml-auto text-xs text-muted-foreground shrink-0">
          {deals?.length ?? 0}
        </Badge>
        <span>{stage.probability}%</span>
      </div>
      <div className="flex items-center gap-2">
        {totalValue > 0 ? (
          <p className="text-xs text-muted-foreground">
            {formatCurrency(totalValue)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{formatCurrency(0)}</p>
        )}
        <div className="ml-auto flex items-center gap-x-2">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            SLA: {stage.sla_days}d
          </span>
        </div>
      </div>
      {stage.description && (
        <p className="text-xs text-muted-foreground pl-5 truncate mt-0.5">
          {stage.description}
        </p>
      )}
    </div>
  );
}
