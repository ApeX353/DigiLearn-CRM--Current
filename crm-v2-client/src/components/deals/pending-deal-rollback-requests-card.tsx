import { format } from "date-fns";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { DealRollbackRequest } from "~/api/deal-rollback-requests";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

interface PendingDealRollbackRequestsCardProps {
  requests: DealRollbackRequest[];
  onReview: (request: DealRollbackRequest) => void;
}

const formatActorName = (actor?: {
  first_name?: string;
  last_name?: string;
  email?: string;
} | null) => {
  if (!actor) return "--";
  const fullName = `${actor.first_name || ""} ${actor.last_name || ""}`.trim();
  return fullName || actor.email || "--";
};

const formatDateTime = (value?: string) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return format(date, "MMM d, yyyy h:mm a");
};

export function PendingDealRollbackRequestsCard({
  requests,
  onReview,
}: PendingDealRollbackRequestsCardProps) {
  if (!requests.length) {
    return null;
  }

  return (
    <Card className="border-amber-300 bg-amber-50/70">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-5 w-5" />
              Rollback Breach Guard
            </CardTitle>
            <CardDescription className="text-amber-800">
              {requests.length} pending rollback request{requests.length === 1 ? "" : "s"} need approval before deals can move backward.
            </CardDescription>
          </div>
          <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-amber-900 border border-amber-200">
            {requests.length} pending
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.slice(0, 5).map((request) => (
          <div
            key={request.id}
            className="rounded-md border border-amber-200 bg-white p-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
          >
            <div className="space-y-1 text-sm">
              <p className="font-medium text-slate-900">
                {request.deal?.deal_name || request.deal?.title || request.deal_id}
              </p>
              <p className="text-muted-foreground">
                {request.from_stage?.name || request.from_stage_id} to {request.to_stage?.name || request.to_stage_id}
              </p>
              <p className="text-muted-foreground">
                Requested by {formatActorName(request.requested_by)} on {formatDateTime(request.requested_at)}
              </p>
              <p className="text-slate-700">{request.reason}</p>
            </div>
            <Button onClick={() => onReview(request)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Review
            </Button>
          </div>
        ))}
        {requests.length > 5 && (
          <p className="text-xs text-amber-800">
            Showing the 5 most recent pending requests.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
