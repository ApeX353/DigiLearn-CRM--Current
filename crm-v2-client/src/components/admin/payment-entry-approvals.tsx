import { useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  usePaymentEntryRequests,
  useReviewPaymentEntryRequest,
} from "~/api/payment-entry-requests";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useCurrency } from "~/hooks/use-currency";

export function PaymentEntryApprovals() {
  const { formatCurrency } = useCurrency();
  const requests = usePaymentEntryRequests("pending");
  const review = useReviewPaymentEntryRequest();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const decide = (id: string, decision: "approved" | "rejected") => {
    const note = notes[id]?.trim();
    if (decision === "rejected" && !note) {
      toast.error("Enter a reason before rejecting this payment");
      return;
    }
    review.mutate(
      { id, data: { decision, review_note: note || undefined } },
      {
        onSuccess: () =>
          toast.success(
            decision === "approved"
              ? "Payment approved and posted"
              : "Payment entry rejected",
          ),
        onError: (error: any) =>
          toast.error(
            error?.response?.data?.message || "Could not review payment entry",
          ),
      },
    );
  };

  if (requests.isLoading) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const rows = requests.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        No payment entries are waiting for review.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm" data-testid="payment-entry-queue">
        <thead className="bg-muted/50 text-left text-xs uppercase">
          <tr>
            <th className="p-3">Invoice</th>
            <th className="p-3">Entered by</th>
            <th className="p-3">Payment</th>
            <th className="p-3">Outstanding when entered</th>
            <th className="p-3">Review note</th>
            <th className="p-3">Decision</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((request) => {
            const requester = request.requested_by
              ? `${request.requested_by.first_name} ${request.requested_by.last_name}`.trim()
              : "Unknown user";
            return (
              <tr key={request.id}>
                <td className="p-3 align-top">
                  <p className="font-medium">
                    {request.invoice?.invoice_number ?? request.invoice_id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {request.invoice?.school?.name ?? "No school"}
                  </p>
                </td>
                <td className="p-3 align-top">
                  <p>{requester}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(request.requested_at), "MMM d, yyyy h:mm a")}
                  </p>
                </td>
                <td className="p-3 align-top">
                  <p className="font-semibold">{formatCurrency(Number(request.amount))}</p>
                  <p className="text-xs text-muted-foreground">
                    {request.method || "Method not supplied"} · {format(new Date(request.payment_date), "MMM d, yyyy")}
                  </p>
                </td>
                <td className="p-3 align-top font-medium">
                  {formatCurrency(Number(request.outstanding_snapshot))}
                </td>
                <td className="p-3 align-top">
                  <Input
                    value={notes[request.id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                    placeholder="Required when rejecting"
                    disabled={review.isPending}
                  />
                </td>
                <td className="p-3 align-top">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => decide(request.id, "approved")}
                      disabled={review.isPending}
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => decide(request.id, "rejected")}
                      disabled={review.isPending}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
