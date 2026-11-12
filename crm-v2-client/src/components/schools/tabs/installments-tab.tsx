import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CreditCard, Loader2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { useAgingReport } from "~/api/collections";
import type { Invoice } from "~/api/invoices";
import { AddPaymentModal } from "~/components/invoices/add-payment-modal";
import { useCurrency } from "~/hooks/use-currency";

interface SchoolInstallmentsTabProps {
  invoices: Invoice[];
  onPreviewInvoice: (invoiceId: string) => void;
}

const formatDate = (value?: string, fallback = "--") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return format(date, "MMM d, yyyy");
};

const getInvoiceOutstanding = (invoice: Invoice) =>
  Math.max(Number(invoice.total || 0) - Number(invoice.amount_paid || 0), 0);

const getStatusBadge = (status: string) => {
  switch (status) {
    case "paid":
      return <Badge className="bg-green-100 text-green-700">Paid</Badge>;
    case "overdue":
      return <Badge variant="destructive">Overdue</Badge>;
    case "partially_paid":
      return <Badge className="bg-orange-100 text-orange-700">Partial</Badge>;
    default:
      return <Badge variant="secondary">{status.replace("_", " ")}</Badge>;
  }
};

export function SchoolInstallmentsTab({
  invoices,
  onPreviewInvoice,
}: SchoolInstallmentsTabProps) {
  const { formatCurrency } = useCurrency();
  const { data: agingReportData, isLoading } = useAgingReport();

  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentDefaultAmount, setPaymentDefaultAmount] = useState<
    number | undefined
  >(undefined);
  const [paymentDescription, setPaymentDescription] = useState<
    string | undefined
  >(undefined);

  const invoiceById = useMemo(
    () => new Map(invoices.map((inv) => [inv.id, inv] as const)),
    [invoices],
  );

  const invoiceIdSet = useMemo(
    () => new Set(invoices.map((inv) => inv.id)),
    [invoices],
  );

  const installments = useMemo(
    () =>
      (agingReportData?.installments || []).filter((inst) =>
        invoiceIdSet.has(inst.invoice_id),
      ),
    [agingReportData, invoiceIdSet],
  );

  const totalOutstanding = useMemo(
    () =>
      installments.reduce((sum, inst) => sum + Number(inst.balance || 0), 0),
    [installments],
  );

  const openPaymentModal = (
    invoice: Invoice,
    defaultAmount?: number,
    description?: string,
  ) => {
    setPaymentInvoice(invoice);
    setPaymentDefaultAmount(defaultAmount);
    setPaymentDescription(description);
  };

  const closePaymentModal = () => {
    setPaymentInvoice(null);
    setPaymentDefaultAmount(undefined);
    setPaymentDescription(undefined);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Installments</CardTitle>
          <CardDescription>
            Outstanding installments linked to this school&apos;s invoices
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Payments are applied using FIFO, starting with the oldest
                overdue installment first.
              </p>
              <p className="text-sm font-semibold">
                Outstanding: {formatCurrency(totalOutstanding)}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : installments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No outstanding installments found for this school.
            </p>
          ) : (
            <div className="space-y-3">
              {installments.map((installment) => {
                const linkedInvoice = invoiceById.get(
                  installment.invoice_id,
                );
                const installmentBalance = Number(
                  installment.balance || 0,
                );
                const invoiceOutstanding = linkedInvoice
                  ? getInvoiceOutstanding(linkedInvoice)
                  : 0;
                const canAddPayment =
                  !!linkedInvoice &&
                  installmentBalance > 0 &&
                  invoiceOutstanding > 0;
                const suggestedAmount = Math.min(
                  installmentBalance,
                  invoiceOutstanding,
                );

                return (
                  <div
                    key={installment.installment_id}
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">
                        {installment.invoice_number} — Installment #
                        {installment.installment_number}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Due: {formatDate(installment.due_date)}
                      </p>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(installment.status)}
                        {installment.days_overdue > 0 && (
                          <span className="text-xs text-red-600">
                            {installment.days_overdue} days overdue
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <span className="font-semibold">
                        Balance: {formatCurrency(installmentBalance)}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {linkedInvoice && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              onPreviewInvoice(linkedInvoice.id)
                            }
                          >
                            View Invoice
                          </Button>
                        )}
                        {canAddPayment && linkedInvoice && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              openPaymentModal(
                                linkedInvoice,
                                suggestedAmount,
                                `Record payment for installment #${installment.installment_number} (${installment.invoice_number}). Allocation follows FIFO.`,
                              )
                            }
                          >
                            <CreditCard className="mr-2 h-4 w-4" />
                            Add Payment
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {paymentInvoice && (
        <AddPaymentModal
          isOpen={!!paymentInvoice}
          onClose={closePaymentModal}
          invoice={paymentInvoice}
          defaultAmount={paymentDefaultAmount}
          description={paymentDescription}
        />
      )}
    </>
  );
}
