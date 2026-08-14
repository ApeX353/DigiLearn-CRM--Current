import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Modal from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Calendar } from "~/components/ui/calendar";
import { cn } from "~/lib/utils";
import {
  addPaymentFormSchema,
  invoiceKeys,
  PAYMENT_METHODS,
  useAddPayment,
  useInvoice,
  type AddPaymentFormValues,
  type Invoice,
  type InvoicePaymentSubmissionResponse,
} from "~/api/invoices";
import { schoolsKeys } from "~/api/schools";
import { useCurrency } from "~/hooks/use-currency";

interface AddPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  defaultAmount?: number;
  description?: string;
}

const getInvoiceOutstanding = (targetInvoice?: Invoice | null) =>
  Math.max(
    Number(targetInvoice?.total || 0) - Number(targetInvoice?.amount_paid || 0),
    0,
  );

const getInvoiceSortValue = (value?: string) => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const sortPayableInvoices = (left: Invoice, right: Invoice) => {
  const dueDateDifference =
    getInvoiceSortValue(left.due_date) - getInvoiceSortValue(right.due_date);
  if (dueDateDifference !== 0) {
    return dueDateDifference;
  }

  return left.invoice_number.localeCompare(right.invoice_number);
};

const formatInvoiceDueDate = (value?: string) => {
  if (!value) return "No due date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No due date";
  return format(parsed, "PPP");
};

export function AddPaymentModal({
  isOpen,
  onClose,
  invoice,
  defaultAmount,
  description,
}: AddPaymentModalProps) {
  const queryClient = useQueryClient();
  const { currency, formatCurrency } = useCurrency();
  const addPayment = useAddPayment();
  const detailInvoiceId = isOpen ? invoice.id : "";
  const { data: invoiceDetail, isLoading: isInvoiceDetailLoading } = useInvoice(detailInvoiceId);
  const resolvedInvoice = invoiceDetail ?? invoice;
  const isSummaryInvoice = Boolean(
    invoiceDetail?.is_summary_invoice ?? invoice.is_summary_invoice,
  );
  const payableChildren = useMemo(
    () =>
      isSummaryInvoice
        ? [...(resolvedInvoice.child_invoices ?? [])]
            .filter((childInvoice) => getInvoiceOutstanding(childInvoice) > 0)
            .sort(sortPayableInvoices)
        : [],
    [isSummaryInvoice, resolvedInvoice.child_invoices],
  );
  const [selectedChildInvoiceId, setSelectedChildInvoiceId] = useState("");
  const selectedChildInvoice = useMemo(
    () =>
      payableChildren.find(
        (childInvoice) => childInvoice.id === selectedChildInvoiceId,
      ) ?? payableChildren[0] ?? null,
    [payableChildren, selectedChildInvoiceId],
  );
  const targetInvoice = isSummaryInvoice ? selectedChildInvoice : resolvedInvoice;
  // Payment amounts follow the invoice currency. Invoices currently use the
  // CRM-wide setting and must not inherit a linked deal/quote's currency.
  const displayCurrency = currency;
  const formatPaymentCurrency = (amount: number) =>
    formatCurrency(amount, displayCurrency);
  const outstanding = getInvoiceOutstanding(targetInvoice);
  const initialAmount =
    defaultAmount !== undefined
      ? Math.max(0, Math.min(defaultAmount, outstanding))
      : outstanding;
  const isLoadingChildInvoices =
    isSummaryInvoice && isInvoiceDetailLoading && !invoiceDetail;

  const form = useForm<AddPaymentFormValues>({
    resolver: zodResolver(addPaymentFormSchema),
    defaultValues: {
      amount: initialAmount,
      payment_method: "Cash",
      payment_date: new Date(),
      reference_number: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!isOpen) {
      setSelectedChildInvoiceId("");
      return;
    }

    if (!isSummaryInvoice) {
      setSelectedChildInvoiceId("");
      return;
    }

    const hasSelectedInvoice = payableChildren.some(
      (childInvoice) => childInvoice.id === selectedChildInvoiceId,
    );

    if (!hasSelectedInvoice) {
      setSelectedChildInvoiceId(payableChildren[0]?.id ?? "");
    }
  }, [isOpen, isSummaryInvoice, payableChildren, selectedChildInvoiceId]);

  // Opening the modal starts a clean receipt.
  useEffect(() => {
    if (!isOpen) return;

    form.reset({
      amount: initialAmount,
      payment_method: "Cash",
      payment_date: new Date(),
      reference_number: "",
      notes: "",
    });
    // Deliberately keyed on `isOpen` alone: switching child invoice or
    // recomputing the amount must not wipe fields the rep has already
    // filled in — with the reference now mandatory, that would turn into
    // a submit block on a field they had typed correctly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Switching the target invoice only re-points the amount.
  useEffect(() => {
    if (!isOpen) return;
    form.setValue("amount", initialAmount);
  }, [form, initialAmount, isOpen, targetInvoice?.id]);

  const invalidateRelatedQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["payments"] }),
      queryClient.invalidateQueries({ queryKey: ["payment-terms"] }),
      queryClient.invalidateQueries({ queryKey: ["deals"] }),
      queryClient.invalidateQueries({ queryKey: schoolsKeys.all }),
    ]);
  };

  const onSubmit = async (values: AddPaymentFormValues) => {
    if (isLoadingChildInvoices) {
      toast.error("Child invoices are still loading");
      return;
    }

    if (!targetInvoice) {
      toast.error(
        isSummaryInvoice
          ? "Select a child invoice to apply this payment"
          : "Invoice details are unavailable",
      );
      return;
    }

    if (outstanding <= 0) {
      toast.error(
        isSummaryInvoice
          ? "The selected child invoice has no outstanding balance"
          : "This invoice has no outstanding balance",
      );
      return;
    }

    if (values.amount > outstanding) {
      form.setError("amount", {
        message: `Amount cannot exceed outstanding balance of ${formatPaymentCurrency(outstanding)}`,
      });
      return;
    }

    try {
      // Trim (his change) but still omit when blank, so the optional field
      // is absent rather than an empty string — and so a missing value
      // cannot throw on .trim().
      const reference = values.reference_number?.trim() || undefined;
      const paymentResponse = (await addPayment.mutateAsync({
        data: {
          invoice_id: targetInvoice.id,
          amount: values.amount,
          payment_method: values.payment_method,
          method: values.payment_method,
          payment_date: values.payment_date.toISOString(),
          // The API's CreatePaymentDto whitelists `reference` only —
          // sending `reference_number` made the global
          // forbidNonWhitelisted pipe reject the WHOLE request with
          // "property reference_number should not exist", so no
          // payment could ever be recorded with a reference filled in.
          reference,
          notes: values.notes || undefined,
        },
      })) as InvoicePaymentSubmissionResponse;

      await invalidateRelatedQueries();

      if (paymentResponse.kind === "approval_request") {
        toast.success("Payment entry sent to the manager Approval Queue");
      } else {
        toast.success("Payment recorded successfully");
      }

      form.reset();
      onClose();
    } catch {
      toast.error("Failed to record payment");
    }
  };

  const isSubmitting = addPayment.isPending;
  const isSubmitDisabled =
    isSubmitting ||
    isLoadingChildInvoices ||
    !targetInvoice ||
    outstanding <= 0 ||
    (isSummaryInvoice && payableChildren.length === 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Payment"
      description={
        description ||
        `Record a payment for invoice ${resolvedInvoice.invoice_number}`
      }
      size="sm"
    >
      {isSummaryInvoice && (
        <div className="mb-4 rounded-lg border bg-muted/40 p-4 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Apply Payment To</p>
            <p className="text-xs text-muted-foreground">
              Summary invoice {resolvedInvoice.invoice_number} cannot receive
              payments directly. Choose the child invoice that should receive
              this payment.
            </p>
          </div>

          {isLoadingChildInvoices ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading child invoices...
            </div>
          ) : payableChildren.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All child invoices for this summary invoice are fully paid.
            </p>
          ) : (
            <div className="space-y-2">
              <FormLabel>Child Invoice *</FormLabel>
              <Select
                value={selectedChildInvoiceId}
                onValueChange={setSelectedChildInvoiceId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a child invoice" />
                </SelectTrigger>
                <SelectContent>
                  {payableChildren.map((childInvoice) => (
                    <SelectItem key={childInvoice.id} value={childInvoice.id}>
                      {`${childInvoice.invoice_number} • ${formatCurrency(getInvoiceOutstanding(childInvoice), displayCurrency)} outstanding • Due ${formatInvoiceDueDate(childInvoice.due_date)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg bg-muted/50 p-4 mb-4 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Payment Invoice</span>
          <span className="font-medium">
            {targetInvoice?.invoice_number ?? "--"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Invoice Total</span>
          <span className="font-medium">
            {formatPaymentCurrency(Number(targetInvoice?.total || 0))}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Amount Paid</span>
          <span className="font-medium">
            {formatPaymentCurrency(Number(targetInvoice?.amount_paid || 0))}
          </span>
        </div>
        <div className="flex justify-between text-sm font-semibold border-t pt-1">
          <span>Outstanding</span>
          <span>{formatPaymentCurrency(outstanding)}</span>
        </div>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Payments are allocated using FIFO, starting with the oldest outstanding
        installment first.
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 grid-cols-2">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {displayCurrency}
                      </span>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={outstanding}
                        className="pl-14"
                        onChange={(e) =>
                          field.onChange(parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="payment_method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 grid-cols-2">
            <FormField
              control={form.control}
              name="payment_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Date *</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground",
                          )}
                        >
                          {field.value
                            ? format(field.value, "PPP")
                            : "Pick a date"}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date > new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reference_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference Number *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Bank ref / transfer ID / receipt no."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Optional payment notes..."
                    className="min-h-[80px] resize-none"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-3 justify-end pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Record Payment
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
}




