import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { InvoiceStatusBadge } from "~/components/invoices/invoice-status-badge";
import {
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  LayoutList,
  ListOrdered,
  Plus,
  Search,
  Loader2,
  CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import {
  useInvoices,
  useInvoicesStats,
  INVOICE_STATUSES,
  type InvoiceStatus,
  type Invoice,
  type InvoiceStats,
} from "~/api/invoices";
import { useCurrency } from "~/hooks/use-currency";
import { AddPaymentModal } from "~/components/invoices/add-payment-modal";
import { InvoicePreviewModal } from "~/components/invoices/invoice-preview-modal";
import { Badge } from "~/components/ui/badge";

type ViewMode = "table" | "grid";
type StatsPeriod = keyof InvoiceStats;

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const getOutstanding = (invoice: Invoice) =>
  Math.max(Number(invoice.total || 0) - Number(invoice.amount_paid || 0), 0);

const getPaymentState = (invoice: Invoice) => {
  const paid = Number(invoice.amount_paid || 0);
  const outstanding = getOutstanding(invoice);
  return paid <= 0 ? "Unpaid" : outstanding <= 0 ? "Paid" : "Partial";
};

const isDocumentState = (status: InvoiceStatus) =>
  status === "Draft" || status === "Sent" || status === "Cancelled";

export default function InvoicesPage() {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("monthly");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">(
    "all"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);

  // Deep link from a deal's Files tab: quote/invoice records are filed as
  // /…?preview=<id>, so honour the param and open the preview directly.
  const [previewParams] = useSearchParams();
  useEffect(() => {
    const fromUrl = previewParams.get("preview");
    if (fromUrl) setPreviewInvoiceId(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading } = useInvoices({
    page,
    limit: 20,
    search: searchQuery || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const { data: statsData, isLoading: isStatsLoading } = useInvoicesStats();

  const invoices = data?.data || [];
  const meta = data?.meta;
  const periodStats = statsData?.data?.[statsPeriod];
  const statsLoading = isStatsLoading && !periodStats;

  const totalInvoices = periodStats?.totalInvoices ?? 0;
  const totalValue = periodStats?.totalValue ?? 0;
  const paidCount = periodStats?.paid ?? 0;
  const paidValue = periodStats?.paidValue ?? 0;
  const cancelledCount = periodStats?.cancelled ?? 0;
  const overdueCount = periodStats?.overdue ?? 0;
  const collectionRate = periodStats?.collectionRate ?? 0;

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Manage and track all your invoices"
        actions={
          <Button onClick={() => navigate("/invoices/new")}>
            <Plus className="mr-2 h-4 w-4" />
            New Invoice
          </Button>
        }
      />

      <Container className="p-4 space-y-6">
        <div className="flex justify-end">
          <div className="w-full md:w-[180px] space-y-2">
            <label className="text-sm font-medium">Stats Period</label>
            <Select
              value={statsPeriod}
              onValueChange={(value) => setStatsPeriod(value as StatsPeriod)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Invoices
              </CardTitle>
              <FileText className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {statsLoading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                ) : (
                  totalInvoices
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {PERIOD_LABELS[statsPeriod]} invoices created
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Value
              </CardTitle>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {statsLoading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                ) : (
                  formatCurrency(totalValue)
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Value for the {PERIOD_LABELS[statsPeriod].toLowerCase()} period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Paid
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {statsLoading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                ) : (
                  paidCount
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(paidValue)} collected
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Collection Rate
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {statsLoading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                ) : (
                  `${collectionRate.toFixed(1)}%`
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {overdueCount} overdue, {cancelledCount} cancelled
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by invoice number or client name..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value as InvoiceStatus | "all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {INVOICE_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator
                orientation="vertical"
                className="hidden md:block h-10"
              />

              <div className="flex gap-2">
                <Button
                  variant={viewMode === "table" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setViewMode("table")}
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "grid" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === "table" ? (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          No invoices found
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice) => (
                    <TableRow key={invoice.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">
                          {invoice.school?.name || invoice.client_name}
                        </p>
                      </TableCell>
                      <TableCell>
                        {invoice.client_name ? (
                          <div>
                            <p className="text-sm">{invoice.client_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {invoice.client_email || "not provided"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {isDocumentState(invoice.status) && (
                            <InvoiceStatusBadge status={invoice.status} />
                          )}
                          <Badge variant="outline">
                            Payment: {getPaymentState(invoice)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(invoice.created_at), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {invoice.due_date
                          ? format(new Date(invoice.due_date), "MMM dd, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(invoice.total)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(getOutstanding(invoice))}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {getOutstanding(invoice) > 0 &&
                            invoice.status !== "Cancelled" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPaymentInvoice(invoice)}
                              >
                                <DollarSign className="mr-1 h-3 w-3" />
                                Pay
                              </Button>
                            )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              navigate(`/invoices/${invoice.id}/schedule`)
                            }
                          >
                            <ListOrdered className="mr-1 h-3 w-3" />
                            Schedule
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewInvoiceId(invoice.id)}
                          >
                            View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {invoices.length === 0 ? (
              <div className="col-span-full flex flex-col items-center gap-2 py-10">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">No invoices found</p>
              </div>
            ) : (
              invoices.map((invoice) => (
                <Card
                  key={invoice.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => setPreviewInvoiceId(invoice.id)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {invoice.invoice_number}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {invoice.school?.name || invoice.client_name}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {isDocumentState(invoice.status) && (
                          <InvoiceStatusBadge status={invoice.status} />
                        )}
                        <Badge variant="outline">
                          Payment: {getPaymentState(invoice)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {invoice.client_email && (
                      <div>
                        <p className="text-sm font-medium">
                          {invoice.client_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {invoice.client_email}
                        </p>
                      </div>
                    )}

                    <Separator />

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-lg font-bold">
                          {formatCurrency(invoice.total)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Paid</p>
                        <p className="text-lg font-bold">
                          {formatCurrency(Number(invoice.amount_paid || 0))}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Outstanding
                        </p>
                        <p className="text-lg font-bold">
                          {formatCurrency(getOutstanding(invoice))}
                        </p>
                      </div>
                    </div>

                    {invoice.due_date && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarIcon className="h-3 w-3" />
                        Due{" "}
                        {format(new Date(invoice.due_date), "MMM dd, yyyy")}
                      </div>
                    )}

                    {getOutstanding(invoice) > 0 &&
                      invoice.status !== "Cancelled" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPaymentInvoice(invoice);
                          }}
                        >
                          <DollarSign className="mr-2 h-4 w-4" />
                          Record Payment
                        </Button>
                      )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/invoices/${invoice.id}/schedule`);
                      }}
                    >
                      <ListOrdered className="mr-2 h-4 w-4" />
                      View Schedule
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * (meta.itemsPerPage || 20) + 1} to{" "}
              {Math.min(page * (meta.itemsPerPage || 20), meta.totalItems)} of{" "}
              {meta.totalItems} invoices
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Container>

      {paymentInvoice && (
        <AddPaymentModal
          isOpen={!!paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          invoice={paymentInvoice}
        />
      )}

      <InvoicePreviewModal
        open={!!previewInvoiceId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPreviewInvoiceId(null);
        }}
        invoiceId={previewInvoiceId}
      />
    </div>
  );
}
