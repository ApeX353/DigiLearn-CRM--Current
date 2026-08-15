import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ListOrdered, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import {
  useInvoice,
  useUpdateInvoiceStatus,
  type InvoiceStatus,
} from "~/api/invoices";
import { useCurrency } from "~/hooks/use-currency";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "../ui/separator";
import { Badge } from "~/components/ui/badge";
import { AddPaymentModal } from "./add-payment-modal";

interface InvoicePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
}

type ItemLike = {
  quantity?: number | string;
  unit_price?: number | string;
  discount?: number | string;
  tax_rate?: number | string;
};

const toNum = (value: number | string | undefined) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculateItemAmounts = (item?: ItemLike) => {
  const quantity = toNum(item?.quantity);
  const unitPrice = toNum(item?.unit_price);
  const discountRate = toNum(item?.discount);
  const taxRate = toNum(item?.tax_rate);

  const subtotal = quantity * unitPrice;
  const discount = (subtotal * discountRate) / 100;
  const taxableAmount = subtotal - discount;
  const tax = (taxableAmount * taxRate) / 100;

  return {
    subtotal,
    discount,
    tax,
    total: taxableAmount + tax,
  };
};

export function InvoicePreviewModal({
  open,
  onOpenChange,
  invoiceId,
}: InvoicePreviewModalProps) {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();
  const { data: invoice, isLoading } = useInvoice(invoiceId || "");
  const updateInvoiceStatus = useUpdateInvoiceStatus();

  const [nextStatus, setNextStatus] = useState<InvoiceStatus | "">("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState<
    "Paid" | "Partially-Paid" | null
  >(null);

  useEffect(() => {
    if (!invoice) return;
    setNextStatus("");
  }, [invoice]);

  const hasStatusChange =
    !!invoice && !!nextStatus && nextStatus !== invoice.status;

  const availableStatuses = useMemo(() => {
    if (!invoice) return [] as InvoiceStatus[];
    return (["Draft", "Sent", "Cancelled"] as InvoiceStatus[]).filter(
      (status) => status !== invoice.status,
    );
  }, [invoice]);

  const handleStatusSelection = (status: InvoiceStatus) => {
    if (status === "Paid" || status === "Partially-Paid") {
      setNextStatus("");
      setPaymentIntent(status);
      return;
    }
    setNextStatus(status);
  };

  const handleConfirmStatusUpdate = async () => {
    if (!invoice || !nextStatus || nextStatus === invoice.status) {
      setConfirmOpen(false);
      return;
    }

    try {
      await updateInvoiceStatus.mutateAsync({
        id: invoice.id,
        status: nextStatus,
      });
      toast.success("Invoice status updated");
      setConfirmOpen(false);
    } catch {
      toast.error("Failed to update invoice status");
    }
  };

  const items = invoice?.items || [];
  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          const amounts = calculateItemAmounts(item);
          acc.subtotal += amounts.subtotal;
          acc.totalDiscount += amounts.discount;
          acc.totalTax += amounts.tax;
          acc.total += amounts.total;
          return acc;
        },
        { subtotal: 0, totalDiscount: 0, totalTax: 0, total: 0 },
      ),
    [items],
  );
  const invoiceTotal = invoice ? toNum(invoice.total) : totals.total;
  const amountPaid = invoice ? toNum(invoice.amount_paid) : 0;
  const outstanding = Math.max(invoiceTotal - amountPaid, 0);
  // Invoices do not persist their own currency. The CRM currency setting is
  // therefore authoritative; inheriting a linked deal/quote currency can
  // mislabel a USD invoice (for example, Wanezi was shown as ZAR).
  const formatInvoiceCurrency = (amount: number) => formatCurrency(amount);
  const paymentState =
    amountPaid <= 0 ? "Unpaid" : outstanding <= 0 ? "Paid" : "Partial";
  const documentState =
    invoice && ["Draft", "Sent", "Cancelled"].includes(invoice.status)
      ? invoice.status
      : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="h-[100dvh] w-[100vw] max-w-[100vw] rounded-none p-0 sm:max-w-[100vw]">
          <div className="flex h-full flex-col">
            <DialogHeader className="flex flex-row items-center border-b px-6 py-4">
              <DialogTitle>
                <span className="mr-2">Invoice Preview</span>
                {documentState && (
                  <InvoiceStatusBadge status={documentState as InvoiceStatus} />
                )}
                {invoice && (
                  <Badge variant="outline" className="ml-2">
                    Payment: {paymentState}
                  </Badge>
                )}
              </DialogTitle>
              <div className="ml-auto mr-8">
                <Select
                  value={nextStatus}
                  onValueChange={(value) =>
                    handleStatusSelection(value as InvoiceStatus)
                  }
                  disabled={!invoice}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {outstanding > 0 && (
                      <>
                        <SelectItem value="Partially-Paid">
                          Record partial payment...
                        </SelectItem>
                        <SelectItem value="Paid">
                          Record full payment...
                        </SelectItem>
                      </>
                    )}
                    {availableStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </DialogHeader>

            <div className="mx-auto w-full max-w-6xl border-b px-6 py-4">
              {invoice && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Invoice Number
                    </p>
                    <p className="font-medium">{invoice.invoice_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Client</p>
                    <p className="font-medium">{invoice.client_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">School</p>
                    <p className="font-medium">{invoice.school?.name || "--"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="font-medium">
                      {format(new Date(invoice.created_at), "MMM dd, yyyy")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className="font-medium">
                      {invoice.due_date
                        ? format(new Date(invoice.due_date), "MMM dd, yyyy")
                        : "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-semibold">{formatInvoiceCurrency(invoiceTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Amount Paid</p>
                    <p className="font-semibold">{formatInvoiceCurrency(amountPaid)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                    <p className="font-semibold">{formatInvoiceCurrency(outstanding)}</p>
                  </div>
                </div>
              )}
            </div>

            <ScrollArea className="mx-auto w-full max-w-6xl flex-1 px-6 py-4">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !invoice ? (
                <p className="text-sm text-muted-foreground">
                  Invoice details are unavailable.
                </p>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Unit Price</TableHead>
                          <TableHead>Discount</TableHead>
                          <TableHead>Tax</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-center text-muted-foreground"
                            >
                              No line items
                            </TableCell>
                          </TableRow>
                        ) : (
                          items.map((item) => {
                            const amounts = calculateItemAmounts(item);

                            return (
                              <TableRow key={item.id}>
                                <TableCell>{item.description}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell>
                                  {formatInvoiceCurrency(toNum(item.unit_price))}
                                </TableCell>
                                <TableCell>
                                  {toNum(item.discount).toFixed(2)}%
                                </TableCell>
                                <TableCell>
                                  {toNum(item.tax_rate).toFixed(2)}%
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatInvoiceCurrency(amounts.total)}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-start">
                    <div className="ml-auto w-72 space-y-2 rounded-lg bg-muted/50 p-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">
                          {formatInvoiceCurrency(totals.subtotal)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Discount</span>
                        <span className="font-medium text-green-600">
                          -{formatInvoiceCurrency(totals.totalDiscount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tax</span>
                        <span className="font-medium">
                          {formatInvoiceCurrency(totals.totalTax)}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="font-semibold">Total</span>
                        <span className="text-xl font-bold text-primary">
                          {formatInvoiceCurrency(invoiceTotal)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Amount Paid
                        </span>
                        <span className="font-medium text-green-600">
                          {formatInvoiceCurrency(amountPaid)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Balance Due
                        </span>
                        <span className="font-semibold">
                          {formatInvoiceCurrency(outstanding)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {invoice.notes && (
                    <div>
                      <p className="text-sm font-medium">Notes</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {invoice.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            <div className="border-t px-6 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <Button
                  variant="outline"
                  disabled={!invoice}
                  onClick={() => {
                    if (!invoice) return;
                    onOpenChange(false);
                    navigate(`/invoices/${invoice.id}/schedule`);
                  }}
                >
                  <ListOrdered className="mr-2 h-4 w-4" />
                  Open Schedule
                </Button>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!hasStatusChange || updateInvoiceStatus.isPending}
                >
                  {updateInvoiceStatus.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Update Invoice Status
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Status Update</AlertDialogTitle>
            <AlertDialogDescription>
              {invoice && nextStatus
                ? `Update ${invoice.invoice_number} from ${invoice.status} to ${nextStatus}?`
                : "Update invoice status?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateInvoiceStatus.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStatusUpdate}
              disabled={updateInvoiceStatus.isPending}
            >
              {updateInvoiceStatus.isPending ? "Updating..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {invoice && paymentIntent && (
        <AddPaymentModal
          isOpen={true}
          onClose={() => setPaymentIntent(null)}
          invoice={invoice}
          defaultAmount={paymentIntent === "Paid" ? outstanding : 0}
          description={
            paymentIntent === "Paid"
              ? `Record the full outstanding payment for ${invoice.invoice_number}.`
              : `Enter how much was paid for ${invoice.invoice_number}. Sales-rep entries are sent to the manager Approval Queue.`
          }
        />
      )}
    </>
  );
}
