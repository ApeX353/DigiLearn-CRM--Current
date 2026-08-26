import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { format } from "date-fns";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "react-router";
import { apiClientAuth } from "~/api/axios";
import type { Paginated } from "~/api/common-api-type";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Skeleton } from "~/components/ui/skeleton";
import {
  useInvoice,
  useInvoicePaymentSchedule,
  type Invoice,
} from "~/api/invoices";
import { usePaymentsList, type Payment } from "~/api/payments";
import { useCurrency } from "~/hooks/use-currency";
import { InvoiceStatusBadge } from "~/components/invoices/invoice-status-badge";
import { AddPaymentModal } from "~/components/invoices/add-payment-modal";

const formatDate = (value?: string | null, fallback = "--") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return format(date, "MMM d, yyyy");
};

const toNumber = (value: number | string | undefined | null) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getInstallmentStatusBadge = (status: string) => {
  switch (status) {
    case "paid":
      return <Badge className="bg-green-100 text-green-700">Paid</Badge>;
    case "overdue":
      return <Badge variant="destructive">Overdue</Badge>;
    case "partially_paid":
      return <Badge className="bg-orange-100 text-orange-700">Partial</Badge>;
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getPaymentMethodLabel = (payment: Payment) =>
  payment.payment_method || payment.method || "--";

const getPaymentReference = (payment: Payment) =>
  payment.reference_number || payment.reference || "--";

const getInvoiceOutstanding = (invoice?: Invoice | null) => {
  if (!invoice) return 0;
  return Math.max(
    toNumber(invoice.total ?? 0) - toNumber(invoice.amount_paid ?? 0),
    0,
  );
};

export default function InvoiceSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = id || "";
  const { formatCurrency } = useCurrency();

  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentDefaultAmount, setPaymentDefaultAmount] = useState<
    number | undefined
  >(undefined);
  const [paymentDescription, setPaymentDescription] = useState<
    string | undefined
  >(undefined);

  const { data: invoice, isLoading: invoiceLoading, error: invoiceError } =
    useInvoice(invoiceId);
  const {
    data: schedule,
    isLoading: scheduleLoading,
    error: scheduleError,
  } = useInvoicePaymentSchedule(invoiceId);

  const isSummaryInvoice = Boolean(
    schedule?.invoice?.is_summary_invoice ?? invoice?.is_summary_invoice,
  );
  const paymentsParams = useMemo(
    () => ({
      page: 1,
      limit: 100,
      invoice_id: invoiceId || undefined,
    }),
    [invoiceId],
  );
  const { data: paymentsData, isLoading: directPaymentsLoading } =
    usePaymentsList(paymentsParams);

  const installments = schedule?.installments || [];
  const paymentInvoiceIds = useMemo(
    () =>
      Array.from(
        new Set(
          installments
            .map((installment) => installment.invoice_id)
            .filter((childInvoiceId): childInvoiceId is string => !!childInvoiceId),
        ),
      ),
    [installments],
  );
  const summaryPaymentQueries = useQueries({
    queries: isSummaryInvoice
      ? paymentInvoiceIds.map((childInvoiceId) => {
          const params = { page: 1, limit: 100, invoice_id: childInvoiceId };
          return {
            queryKey: ["payments", "list", params] as const,
            queryFn: () =>
              apiClientAuth
                .get("/payments", { params })
                .then((response) => response.data as Paginated<Payment[]>),
          };
        })
      : [],
  });
  const payments = useMemo(() => {
    if (!isSummaryInvoice) {
      return paymentsData?.data || [];
    }

    const mergedPayments = new Map<string, Payment>();
    for (const query of summaryPaymentQueries) {
      for (const payment of query.data?.data || []) {
        mergedPayments.set(payment.id, payment);
      }
    }

    return Array.from(mergedPayments.values()).sort(
      (left, right) =>
        new Date(right.payment_date).getTime() -
        new Date(left.payment_date).getTime(),
    );
  }, [isSummaryInvoice, paymentsData?.data, summaryPaymentQueries]);
  const paymentsLoading = isSummaryInvoice
    ? summaryPaymentQueries.some((query) => query.isLoading)
    : directPaymentsLoading;
  const childInvoicesById = useMemo(
    () =>
      new Map(
        (invoice?.child_invoices ?? []).map((childInvoice) => [
          childInvoice.id,
          childInvoice,
        ] as const),
      ),
    [invoice?.child_invoices],
  );

 // const totals = useMemo(
  //   () =>
  //     installments.reduce(
  //       (acc, installment) => {
  //         acc.amount += toNumber(installment.amount);
  //         acc.paid += toNumber(installment.paid_amount);
  //         acc.balance += toNumber(installment.balance);
  //         return acc;
  //       },
  //       { amount: 0, paid: 0, balance: 0 },
  //     ),
  //   [installments],
  // );

  const resolvedInvoiceTotal = toNumber(schedule?.invoice?.total ?? invoice?.total);
  const resolvedAmountPaid = toNumber(
    schedule?.invoice?.amount_paid ?? invoice?.amount_paid,
  );
  const resolvedOutstanding = Math.max(
    resolvedInvoiceTotal - resolvedAmountPaid,
    0,
  );

  const openPaymentModal = ({
    invoice: selectedInvoice,
    defaultAmount,
    description,
  }: {
    invoice?: Invoice;
    defaultAmount?: number;
    description?: string;
  }) => {
    const invoiceForPayment = selectedInvoice ?? invoice;

    if (!invoiceForPayment) {
      toast.error("Invoice details are unavailable");
      return;
    }

    setPaymentInvoice(invoiceForPayment);
    setPaymentDefaultAmount(defaultAmount);
    setPaymentDescription(description);
  };

  const closePaymentModal = () => {
    setPaymentInvoice(null);
    setPaymentDefaultAmount(undefined);
    setPaymentDescription(undefined);
  };

  if (!invoiceId) {
    return (
      <div>
        <PageHeader title="Invoice Schedule" subtitle="Invoice not found" />
        <Container className="p-4">
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Missing invoice id.
            </CardContent>
          </Card>
        </Container>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        hasBackButton
        title="Invoice Schedule"
        subtitle={
          invoice
            ? `${invoice.invoice_number} - ${invoice.client_name}`
            : "Installments and payment allocations"
        }
        actions={
          <Button
            size="sm"
            onClick={() =>
              openPaymentModal({
                invoice,
                defaultAmount: resolvedOutstanding,
                description: invoice
                  ? `Record a payment for invoice ${invoice.invoice_number}. Allocation follows FIFO.`
                  : "Record a payment for this invoice. Allocation follows FIFO.",
              })
            }
            disabled={!invoice || resolvedOutstanding <= 0}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Add Payment
          </Button>
        }
      />

      <Container className="p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Overview</CardTitle>
            <CardDescription>
              Payment status and outstanding balance for this invoice
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoiceLoading ? (
              <div className="grid gap-4 md:grid-cols-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : invoiceError || !invoice ? (
              <p className="text-sm text-destructive">
                Could not load invoice details.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="font-medium">
                    {formatDate(
                      schedule?.invoice?.due_date ?? invoice.due_date,
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-semibold">
                    {formatCurrency(resolvedInvoiceTotal)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="font-semibold">
                    {formatCurrency(resolvedOutstanding)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="installments" className="space-y-4">
          <TabsList>
            <TabsTrigger value="installments">
              Installments ({installments.length})
            </TabsTrigger>
            <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="installments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Payment Term</CardTitle>
                <CardDescription>
                  Applied payment term and generated installment plan
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scheduleLoading ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : schedule?.appliedTerm ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Term</p>
                      <p className="font-medium">{schedule.appliedTerm.term_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="font-medium">{schedule.appliedTerm.term_type}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Installments</p>
                      <p className="font-medium">
                        {schedule.appliedTerm.number_of_installments}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Final Due Date</p>
                      <p className="font-medium">
                        {formatDate(schedule.appliedTerm.final_due_date)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No payment term has been applied to this invoice.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Installment Schedule</CardTitle>
                <CardDescription>
                  Payments are allocated using FIFO, oldest due installment first.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Scheduled Amount</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(totals.amount)}
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Paid</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(totals.paid)}
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(totals.balance)}
                    </p>
                  </div>
                </div> */}

                {scheduleLoading ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : scheduleError ? (
                  <p className="text-sm text-destructive">
                    Could not load installment schedule.
                  </p>
                ) : installments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No installments available for this invoice.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Installment</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Grace Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {installments.map((installment) => {
                        const installmentBalance = toNumber(installment.balance);
                        const linkedInvoice = installment.invoice_id
                          ? childInvoicesById.get(installment.invoice_id) ??
                            (invoice?.id === installment.invoice_id ? invoice : undefined)
                          : undefined;
                        const invoiceOutstanding = getInvoiceOutstanding(linkedInvoice);
                        const canAddPayment =
                          !!linkedInvoice &&
                          installmentBalance > 0 &&
                          invoiceOutstanding > 0;
                        const suggestedAmount = Math.min(
                          installmentBalance,
                          invoiceOutstanding,
                        );

                        return (
                          <TableRow key={installment.id}>
                            <TableCell className="font-medium">
                              #{installment.installment_number}
                            </TableCell>
                            <TableCell>{formatDate(installment.due_date)}</TableCell>
                            <TableCell>
                              {formatDate(installment.grace_due_date)}
                            </TableCell>
                            <TableCell>
                              {getInstallmentStatusBadge(installment.status)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(toNumber(installment.amount))}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(toNumber(installment.paid_amount))}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(installmentBalance)}
                            </TableCell>
                            <TableCell className="text-right">
                              {canAddPayment ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    openPaymentModal({
                                      invoice: linkedInvoice,
                                      defaultAmount: suggestedAmount,
                                      description: `Record payment for installment #${installment.installment_number}. Allocation follows FIFO.`,
                                    })
                                  }
                                >
                                  <CreditCard className="mr-2 h-4 w-4" />
                                  Add Payment
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  --
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
                <CardDescription>
                  Payments recorded for this invoice and allocation balances
                </CardDescription>
              </CardHeader>
              <CardContent>
                {paymentsLoading ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No payments have been recorded for this invoice.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead className="text-right">Unallocated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{formatDate(payment.payment_date)}</TableCell>
                          <TableCell>{getPaymentMethodLabel(payment)}</TableCell>
                          <TableCell>{getPaymentReference(payment)}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(toNumber(payment.amount))}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(toNumber(payment.allocated_amount))}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(toNumber(payment.unallocated_amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Container>

      {paymentInvoice && (
        <AddPaymentModal
          isOpen={!!paymentInvoice}
          onClose={closePaymentModal}
          invoice={paymentInvoice}
          defaultAmount={paymentDefaultAmount}
          description={paymentDescription}
        />
      )}
    </div>
  );
}






