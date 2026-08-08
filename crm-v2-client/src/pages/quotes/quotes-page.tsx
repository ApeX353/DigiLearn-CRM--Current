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
import { QuoteStatusBadge } from "~/components/quotes/quote-status-badge";
import { QuotePreviewModal } from "~/components/quotes/quote-preview-modal";
import {
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  LayoutList,
  Plus,
  Search,
  Loader2,
  CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import {
  useQuotes,
  useQuotesStats,
  QUOTE_STATUSES,
  type QuoteStatus,
  type QuoteStats,
} from "~/api/quotes";
import { useCurrency } from "~/hooks/use-currency";
import { Link } from "react-router";

type ViewMode = "table" | "grid";
type StatsPeriod = keyof QuoteStats;

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export default function QuotesPage() {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("monthly");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [previewQuoteId, setPreviewQuoteId] = useState<string | null>(null);

  // Deep link from a deal's Files tab: quote/invoice records are filed as
  // /…?preview=<id>, so honour the param and open the preview directly.
  const [previewParams] = useSearchParams();
  useEffect(() => {
    const fromUrl = previewParams.get("preview");
    if (fromUrl) setPreviewQuoteId(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading } = useQuotes({
    page,
    limit: 20,
    search: searchQuery || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const { data: statsData } = useQuotesStats();

  const quotes = data?.data || [];
  const meta = data?.meta;
  const periodStats = statsData?.data?.[statsPeriod];

  const totalQuotes = periodStats?.totalQuotes ?? 0;
  const rejectedCount = periodStats?.rejected ?? 0;
  const totalValue = periodStats?.totalValue ?? 0;
  const acceptedCount = periodStats?.accepted ?? 0;
  const acceptedValue = periodStats?.acceptedValue ?? 0;
  const conversionRate = periodStats?.conversionRate ?? 0;

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle="Manage and track all your quotes"
        actions={
          <Button onClick={() => navigate("/quotes/new")}>
            <Plus className="mr-2 h-4 w-4" />
            New Quote
          </Button>
        }
      />

      <Container className="p-4 space-y-6">
        {/* Top Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by quote number or client name..."
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
                    setStatusFilter(value as QuoteStatus | "all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {QUOTE_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Stats Period</label>
                <Select
                  value={statsPeriod}
                  onValueChange={(value) => setStatsPeriod(value as StatsPeriod)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
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

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Quotes
              </CardTitle>
              <FileText className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalQuotes}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {PERIOD_LABELS[statsPeriod]} quotes created
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
                {formatCurrency(totalValue)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total value for {PERIOD_LABELS[statsPeriod].toLowerCase()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Accepted
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{acceptedCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(acceptedValue)} in value
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Conversion Rate
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {conversionRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {rejectedCount} rejected quotes
              </p>
            </CardContent>
          </Card>
        </div>

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
                  <TableHead>Quote #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">No quotes found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  quotes.map((quote) => (
                    <TableRow key={quote.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        {quote.quote_number}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">
                          {quote.school?.name || quote.client_name}
                        </p>
                      </TableCell>
                      <TableCell>
                        {quote.client_name ? (
                          <div>
                            <p className="text-sm">{quote.client_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {quote.client_email || "not provided"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <QuoteStatusBadge status={quote.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(quote.created_at), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {quote.valid_until
                          ? format(new Date(quote.valid_until), "MMM dd, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(quote.total)}
                      </TableCell>
                      <TableCell className="space-x-2">
                        <Link
                          className="text-primary hover:underline"
                          to={`/invoices/new?quoteId=${quote.id}`}
                        >
                          Create Invoice
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewQuoteId(quote.id)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {quotes.length === 0 ? (
              <div className="col-span-full flex flex-col items-center gap-2 py-10">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">No quotes found</p>
              </div>
            ) : (
              quotes.map((quote) => (
                <Card
                  key={quote.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => setPreviewQuoteId(quote.id)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {quote.quote_number}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {quote.school?.name || quote.client_name}
                        </p>
                      </div>
                      <QuoteStatusBadge status={quote.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {quote.client_email && (
                      <div>
                        <p className="text-sm font-medium">
                          {quote.client_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {quote.client_email}
                        </p>
                      </div>
                    )}

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Amount</p>
                        <p className="text-2xl font-bold">
                          {formatCurrency(quote.total)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Created</p>
                        <p className="text-sm font-medium">
                          {format(new Date(quote.created_at), "MMM dd, yyyy")}
                        </p>
                      </div>
                    </div>

                    {quote.valid_until && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarIcon className="h-3 w-3" />
                        Valid until{" "}
                        {format(new Date(quote.valid_until), "MMM dd, yyyy")}
                      </div>
                    )}
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
              {meta.totalItems} quotes
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

      <QuotePreviewModal
        open={!!previewQuoteId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPreviewQuoteId(null);
        }}
        quoteId={previewQuoteId}
      />
    </div>
  );
}
