import { Link, useNavigate } from "react-router";
import { format } from "date-fns";
import { Activity, Briefcase, Loader2, ExternalLink } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { useDeals } from "~/api/deals";
import { useCurrency } from "~/hooks/use-currency";

interface SchoolDealsTabProps {
  schoolId: string;
  /**
   * When provided, clicking a deal calls this instead of navigating to the
   * deal page — lets the school page show the deal's activities in-place.
   * Falls back to navigation when omitted.
   */
  onSelectDeal?: (dealId: string, dealName: string) => void;
}

const formatDate = (value?: string, fallback = "--") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return format(date, "MMM d, yyyy");
};

const getStatusBadge = (closeStatus?: string) => {
  switch (closeStatus) {
    case "won":
      return <Badge className="bg-green-100 text-green-700">Won</Badge>;
    case "lost":
      return <Badge className="bg-red-100 text-red-700">Lost</Badge>;
    default:
      return <Badge className="bg-blue-100 text-blue-700">Ongoing</Badge>;
  }
};

export function SchoolDealsTab({
  schoolId,
  onSelectDeal,
}: SchoolDealsTabProps) {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();
  const openDeal = (dealId: string, dealName: string) =>
    onSelectDeal ? onSelectDeal(dealId, dealName) : navigate(`/deals/${dealId}`);
  const { data: dealsData, isLoading } = useDeals({
    school_id: schoolId,
    page: 1,
    limit: 100,
  });

  const deals = dealsData?.data || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deals</CardTitle>
        <CardDescription>
          {deals.length} deal{deals.length !== 1 ? "s" : ""} linked to this
          school
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : deals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No deals yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deals.map((deal) => {
              const dealTitle = deal.deal_name || deal.title || "Deal";
              const stageName = deal.current_stage?.name || "—";
              const stageColor = deal.current_stage?.color;
              const expectedClose =
                deal.expected_close_date || deal.expectedCloseDate;

              return (
                // Card body is a MOUSE convenience: clicking anywhere
                // (except the title link + "View activities" button below)
                // peeks the deal's activities in place. Intentionally NOT a
                // role=button/tabIndex/keydown target — that made the card an
                // ARIA button wrapping the title link + button and hijacked
                // Enter/Space on them (title link stopped navigating for
                // keyboard users). Keyboard/AT users use the real controls:
                // the title link navigates, "View activities" peeks in place.
                <div
                  key={deal.id}
                  onClick={() => openDeal(deal.id, dealTitle)}
                  className="flex cursor-pointer flex-col gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    {/* Title is a real link to the deal detail page —
                        clicking the name navigates away. stopPropagation
                        keeps it from also triggering the card's in-place
                        activity focus. Card body + "View activities"
                        button still open the deal's activities in place. */}
                    <Link
                      to={`/deals/${deal.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex w-fit items-center gap-1 font-medium text-primary hover:underline"
                    >
                      {dealTitle}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      {getStatusBadge(deal.closeStatus)}
                      <Badge
                        variant="outline"
                        style={
                          stageColor
                            ? { borderColor: stageColor, color: stageColor }
                            : undefined
                        }
                      >
                        {stageName}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Expected close: {formatDate(expectedClose)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <span className="font-semibold">
                      {formatCurrency(Number(deal.value || 0))}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeal(deal.id, dealTitle);
                      }}
                    >
                      <Activity className="mr-2 h-4 w-4" />
                      View activities
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
