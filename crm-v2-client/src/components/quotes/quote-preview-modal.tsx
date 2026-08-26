import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  QUOTE_STATUSES,
  useQuote,
  useUpdateQuote,
  useDownloadQuotePdf,
  useReissueQuote,
  type Quote,
  type QuoteStatus,
} from "~/api/quotes";
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
import { QuoteStatusBadge } from "./quote-status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
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

interface QuotePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string | null;
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

export function QuotePreviewModal({
  open,
  onOpenChange,
  quoteId,
}: QuotePreviewModalProps) {
  const { formatCurrency } = useCurrency();
  const { data: quoteResponse, isLoading } = useQuote(quoteId || "");
  const updateQuote = useUpdateQuote();
  const quote = useMemo(
    () =>
      (quoteResponse as { data?: Quote } | undefined)?.data ??
      (quoteResponse as Quote | undefined),
    [quoteResponse],
  );

  const downloadPdf = useDownloadQuotePdf();
  const reissueQuote = useReissueQuote();
  const [nextStatus, setNextStatus] = useState<QuoteStatus | "">("");
  const [poReceived, setPoReceived] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDownload = async () => {
    if (!quote) return;
    try {
      await downloadPdf.mutateAsync({
        id: quote.id,
        quoteNumber: quote.quote_number,
      });
    } catch {
      toast.error("Could not generate the PDF. Please try again.");
    }
  };

  // QUOTE6: re-issue an expired quote as a fresh Draft with a new validity
  // window. The deal is never auto-marked Lost — this is the manual path back.
  const handleReissue = async () => {
    if (!quote) return;
    try {
      const res = await reissueQuote.mutateAsync(quote.id);
      const newNumber = res?.data?.quote_number;
      toast.success(
        newNumber
          ? `Re-issued as ${newNumber}`
          : "Quote re-issued successfully",
      );
      onOpenChange(false);
    } catch {
      toast.error("Could not re-issue the quote. Please try again.");
    }
  };

  useEffect(() => {
    if (!quote) return;
    setNextStatus(quote.status);
    setPoReceived(quote.po_received);
  }, [quote]);

  const hasStatusChange =
    !!quote && !!nextStatus && nextStatus !== quote.status;

  const availableStatuses = useMemo(() => {
    if (!quote) return [] as QuoteStatus[];
    return QUOTE_STATUSES.filter((status) => status !== quote.status);
  }, [quote]);

  const handleConfirmStatusUpdate = async () => {
    if (!quote || !nextStatus || nextStatus === quote.status) {
      setConfirmOpen(false);
      return;
    }

    try {
      await updateQuote.mutateAsync({
        id: quote.id,
        data: {
          status: nextStatus,
          ...(nextStatus === "Accepted" ? { po_received: poReceived } : {}),
        },
      });
      toast.success("Quote status updated");
      setConfirmOpen(false);
    } catch {
      toast.error("Failed to update quote status");
    }
  };

  const items = quote?.items || [];
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
  const interestAmount = quote ? toNum(quote.interest) : 0;
  const hasInterest = interestAmount > 0;
  const displayTotal = quote ? toNum(quote.total) : totals.total + interestAmount;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="h-screen w-screen max-w-[100vw] rounded-none p-0 sm:max-w-[100vw]">
          <div className="flex h-full flex-col">
            <DialogHeader className="flex items-center flex-row py-4 px-6 border-b">
              {/* <div className="flex flex-wrap items-center justify-between gap-3"> */}
              <DialogTitle>
                <span className="mr-2">Quote Preview</span>
                {quote && <QuoteStatusBadge status={quote.status} />}
              </DialogTitle>
              <div className="ml-auto mr-8">
                <Select
                  value={nextStatus}
                  onValueChange={(value) => setNextStatus(value as QuoteStatus)}
                  disabled={!quote}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {quote && (
                      <SelectItem value={quote.status}>
                        {quote.status}
                      </SelectItem>
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

            <div className="border-b px-6 max-w-6xl w-full mx-auto py-4">
              {quote && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Quote Number
                    </p>
                    <p className="font-medium">{quote.quote_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Client</p>
                    <p className="font-medium">{quote.client_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">School</p>
                    <p className="font-medium">{quote.school?.name || "--"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="font-medium">
                      {format(new Date(quote.created_at), "MMM dd, yyyy")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valid Until</p>
                    <p className="font-medium">
                      {quote.valid_until
                        ? format(new Date(quote.valid_until), "MMM dd, yyyy")
                        : "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-semibold">
                      {formatCurrency(quote.total)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 max-w-6xl w-full mx-auto px-6 py-4">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !quote ? (
                <p className="text-sm text-muted-foreground">
                  Quote details are unavailable.
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
                                  {formatCurrency(toNum(item.unit_price))}
                                </TableCell>
                                <TableCell>
                                  {toNum(item.discount).toFixed(2)}%
                                </TableCell>
                                <TableCell>
                                  {toNum(item.tax_rate).toFixed(2)}%
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(amounts.total)}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-start">
                    {/* Totals Summary */}
                    <div className="w-72 ml-auto space-y-2 rounded-lg bg-muted/50 p-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">
                          {formatCurrency(totals.subtotal)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Discount</span>
                        <span className="font-medium text-green-600">
                          -{formatCurrency(totals.totalDiscount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tax</span>
                        <span className="font-medium">
                          {formatCurrency(totals.totalTax)}
                        </span>
                      </div>
                      {hasInterest && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Interest</span>
                          <span className="font-medium">
                            +{formatCurrency(interestAmount)}
                          </span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between">
                        <span className="font-semibold">Total</span>
                        <span className="text-xl font-bold text-primary">
                          {formatCurrency(displayTotal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {quote.notes && (
                    <div>
                      <p className="text-sm font-medium">Notes</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {quote.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            <div className="border-t px-6 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!hasStatusChange || updateQuote.isPending}
                >
                  {updateQuote.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Update Quote Status
                </Button>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {quote?.status === "Expired" && (
                    <Button
                      variant="outline"
                      onClick={handleReissue}
                      disabled={reissueQuote.isPending}
                    >
                      {reissueQuote.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Re-issue Quote
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleDownload}
                    disabled={!quote || downloadPdf.isPending}
                  >
                    {downloadPdf.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download PDF
                  </Button>
                </div>
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
              {quote && nextStatus
                ? `Update ${quote.quote_number} from ${quote.status} to ${nextStatus}?`
                : "Update quote status?"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {nextStatus === "Accepted" && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">PO received</p>
                <p className="text-xs text-muted-foreground">
                  Confirm whether the purchase order has been received.
                </p>
              </div>
              <Switch checked={poReceived} onCheckedChange={setPoReceived} />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateQuote.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStatusUpdate}
              disabled={updateQuote.isPending}
            >
              {updateQuote.isPending ? "Updating..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
