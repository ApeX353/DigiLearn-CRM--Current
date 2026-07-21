import { Link } from "react-router";
import { differenceInDays } from "date-fns";
import {
  Building2,
  User,
  Calendar,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { useCurrency } from "~/hooks/use-currency";
import type { Deal } from "~/api/deals";
import type { Stage } from "~/api/pipelines";
import { cn } from "~/lib/utils";

interface CompactDealCardProps {
  deal: Deal;
  stage: Stage;
  onEdit?: (deal: Deal) => void;
  onDelete?: (dealId: string) => void;
  isDragging?: boolean;
}

// TODO: Add risk badge based on deal.risk_score when available
// function getRiskBadge(riskScore?: number) {
//   if (riskScore === undefined || riskScore === null) return null;
//   if (riskScore >= 80) {
//     return (
//       <Badge variant="destructive" className="text-[10px] px-1 py-0">
//         High
//       </Badge>
//     );
//   }
//   if (riskScore >= 50) {
//     return (
//       <Badge className="text-[10px] px-1 py-0 bg-yellow-100 text-yellow-800 border-yellow-400">
//         Medium
//       </Badge>
//     );
//   }
//   return (
//     <Badge className="text-[10px] px-1 py-0 bg-green-100 text-green-800 border-green-400">
//       Low
//     </Badge>
//   );
// }

export default function CompactDealCard({
  deal,
  stage,
  isDragging,
}: CompactDealCardProps) {
  const { formatCurrency } = useCurrency();

  const daysInStage = deal.currentStageSince
    ? differenceInDays(new Date(), new Date(deal.currentStageSince))
    : 0;

  const overSLA = stage.sla_days > 0 && daysInStage > stage.sla_days;
  const atRisk =
    stage.sla_days > 0 && !overSLA && daysInStage >= stage.sla_days * 0.8;

  const dealValue = deal.value || 0;
  const backwardMoves = deal.stage_data?.backward_moves || 0;

  return (
    <Card
      className={cn(
        "gap-y-2 py-2 cursor-grab active:cursor-grabbing transition-all",
        isDragging && "shadow-lg ring-2 ring-primary rotate-2",
        overSLA &&
          "border-destructive ring-2 ring-destructive/50 animate-pulse",
        atRisk && !overSLA && "border-yellow-500 ring-2 ring-yellow-500/50",
      )}
    >
      <CardHeader className="p-3 pb-0">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm leading-tight">
            <Link
              to={`/deals/${deal.id}`}
              className="hover:text-primary transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {deal.deal_name || deal.title}
            </Link>
          </CardTitle>
          {/* {getRiskBadge(deal.risk_score)} */}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        <div className="text-lg font-bold text-primary">
          {formatCurrency(dealValue)}
        </div>

        {deal.school && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-light">
            <Building2 className="h-3 w-3" />
            <span className="truncate">{deal.school.name}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {deal.assigned_user && (
            <div className="flex items-center gap-1 font-light">
              <User className="h-3 w-3" />
              <span>
                {deal.assigned_user.first_name?.split(" ")[0] ||
                  deal.assigned_user.first_name}
              </span>
            </div>
          )}
          {deal.expectedCloseDate && (
            <div className="flex items-center gap-1 font-light">
              <Calendar className="h-3 w-3" />
              {new Date(deal.expectedCloseDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </div>
          )}
        </div>

        {/* Stage Age & SLA Warning */}
        <div
          className={cn(
            "flex items-center gap-1 text-xs",
            overSLA ? "text-destructive font-medium" : "text-muted-foreground",
          )}
        >
          {overSLA && <AlertTriangle className="h-3 w-3" />}
          <span>{daysInStage} days in stage</span>
          {overSLA && <span>(SLA breached)</span>}
        </div>

        {/* Backward Move Indicator */}
        {backwardMoves > 0 && (
          <Badge
            variant="outline"
            className="text-xs text-amber-600 border-amber-400 bg-amber-50 flex items-center gap-1 w-fit"
          >
            <RotateCcw className="h-3 w-3" />
            Shuffled {backwardMoves}x
          </Badge>
        )}

        {/* Last Contacted */}
        {deal.last_contacted_at && (
          <div className="text-xs text-muted-foreground">
            Last contact:{" "}
            {new Date(deal.last_contacted_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
