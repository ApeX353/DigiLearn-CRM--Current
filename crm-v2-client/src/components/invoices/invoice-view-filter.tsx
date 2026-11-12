import {
  INVOICE_VIEW_LABELS,
  INVOICE_VIEWS,
  type InvoiceView,
} from "~/api/invoices/invoice-family";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";

export function InvoiceViewFilter({
  value,
  onChange,
}: {
  value: InvoiceView;
  onChange: (view: InvoiceView) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as InvoiceView)}>
      <TabsList>
        {INVOICE_VIEWS.map((view) => (
          <TabsTrigger key={view} value={view}>
            {INVOICE_VIEW_LABELS[view]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
