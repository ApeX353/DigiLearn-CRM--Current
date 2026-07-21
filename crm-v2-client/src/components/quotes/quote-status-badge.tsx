import { Badge } from "~/components/ui/badge";
import type { QuoteStatus } from "~/api/quotes";

const statusVariantMap: Record<QuoteStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Draft: "secondary",
  Sent: "outline",
  Accepted: "default",
  Rejected: "destructive",
  Expired: "secondary",
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <Badge variant={statusVariantMap[status]}>{status}</Badge>;
}
