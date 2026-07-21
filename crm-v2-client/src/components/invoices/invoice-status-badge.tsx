import { Badge } from "~/components/ui/badge";
import type { InvoiceStatus } from "~/api/invoices";

const statusVariantMap: Record<InvoiceStatus, "default" | "secondary" | "destructive" | "outline"> = {
  Draft: "secondary",
  Sent: "outline",
  Paid: "default",
  "Partially-Paid": "outline",
  Overdue: "destructive",
  Cancelled: "secondary",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={statusVariantMap[status]}>{status}</Badge>;
}
