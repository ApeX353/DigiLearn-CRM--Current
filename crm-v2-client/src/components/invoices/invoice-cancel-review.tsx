import { Loader2 } from "lucide-react";
import type { InvoiceCancellationReview, InvoiceStatus } from "~/api/invoices";
import { InvoiceStatusBadge } from "./invoice-status-badge";

interface InvoiceCancelReviewProps {
  review?: InvoiceCancellationReview;
  isLoading: boolean;
  errorMessage?: string | null;
}

function FamilyRow({
  label,
  row,
  selected,
}: {
  label: string;
  row: InvoiceCancellationReview["invoice"];
  selected: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span>
        <span className="font-medium">{row.invoice_number}</span>{" "}
        <span className="text-xs text-muted-foreground">
          {label}
          {selected ? " (this invoice)" : ""}
        </span>
      </span>
      <InvoiceStatusBadge status={row.status as InvoiceStatus} />
    </li>
  );
}

// The server decides whether the cancellation may proceed, on the same check the
// write runs. This only shows the answer, so the two cannot disagree.
export function InvoiceCancelReview({
  review,
  isLoading,
  errorMessage,
}: InvoiceCancelReviewProps) {
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking this invoice...
      </p>
    );
  }
  if (errorMessage || !review) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {errorMessage ?? "This invoice could not be checked."}
      </p>
    );
  }

  const { invoice, parent, instalments, blocked } = review;
  const selected = invoice.invoice_number;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span>
          Current status of <span className="font-medium">{selected}</span>
        </span>
        <InvoiceStatusBadge status={invoice.status as InvoiceStatus} />
      </div>

      {parent && (
        <div className="rounded-md border px-3 py-1">
          <ul className="divide-y">
            <FamilyRow
              label="Parent"
              row={parent}
              selected={parent.id === invoice.id}
            />
            {instalments.map((row, index) => (
              <FamilyRow
                key={row.id}
                label={`Instalment ${index + 1}`}
                row={row}
                selected={row.id === invoice.id}
              />
            ))}
          </ul>
          <p className="border-t py-1.5 text-xs text-muted-foreground">
            {review.active_instalments} of {review.total_instalments}{" "}
            instalments still active
          </p>
        </div>
      )}

      {blocked ? (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3"
        >
          <p>{blocked.message}</p>
          {!!blocked.details?.instalments?.length && (
            <ul className="list-disc pl-5 text-xs">
              {blocked.details.instalments.map((row) => (
                <li key={row.invoice_number}>
                  {row.invoice_number}: {row.status}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p>
          Only <span className="font-medium">{selected}</span> will be
          cancelled. No other invoice changes. The amount stays on the invoice
          but no longer counts as owed by the customer, and nothing is recorded
          as a payment or a write-off. Only continue if the amount is genuinely
          not due.
        </p>
      )}
    </div>
  );
}
