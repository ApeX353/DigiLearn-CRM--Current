import { useState } from "react";
import { useInvoice, type Invoice } from "~/api/invoices";
import { invoiceRowTone } from "~/api/invoices/invoice-family";
import { useCurrency } from "~/hooks/use-currency";

function Children({ invoiceId }: { invoiceId: string }) {
  const { formatCurrency } = useCurrency();
  const { data, isLoading } = useInvoice(invoiceId);
  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading...</p>;
  }
  return (
    <ul className="mt-1 space-y-1 border-l pl-3 text-xs font-normal">
      {(data?.child_invoices ?? []).map((child) => (
        <li key={child.id} className={invoiceRowTone(child)}>
          {child.invoice_number} · {child.status} ·{" "}
          {formatCurrency(Number(child.total))}
        </li>
      ))}
    </ul>
  );
}

// Lists instalments under their parent on request. Their amounts are part of the
// parent's total, so they are never summed with it here.
export function InvoiceFamilyChildren({ invoice }: { invoice: Invoice }) {
  const [open, setOpen] = useState(false);
  const count = invoice.family_summary?.instalments ?? 0;
  if (count === 0) return null;
  return (
    <details
      className="mt-1"
      onClick={(event) => event.stopPropagation()}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-xs font-normal text-muted-foreground">
        {count} instalments
      </summary>
      {open && <Children invoiceId={invoice.id} />}
    </details>
  );
}
