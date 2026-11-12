import {
  invoiceFamilyNote,
  type InvoiceFamilyFacts,
} from "~/api/invoices/invoice-family";

export function InvoiceFamilyNote({ invoice }: { invoice: InvoiceFamilyFacts }) {
  const note = invoiceFamilyNote(invoice);
  if (!note) return null;
  return (
    <span className="block text-xs font-normal text-muted-foreground">
      {note}
    </span>
  );
}
