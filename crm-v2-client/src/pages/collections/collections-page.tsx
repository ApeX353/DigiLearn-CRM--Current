import { useState, useMemo } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { format } from "date-fns";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  DollarSign,
  AlertTriangle,
  Clock,
  ArrowUpDown,
  Loader2,
  CalendarIcon,
  Receipt,
} from "lucide-react";
import { useCurrency } from "~/hooks/use-currency";
import {
  useAgingReport,
  type AgingBucket,
  type InstallmentData,
} from "~/api/collections";
import { cn } from "~/lib/utils";

const BUCKET_LABELS: Record<AgingBucket, string> = {
  current: "Current",
  "1-30": "1-30 Days",
  "31-60": "31-60 Days",
  "61-90": "61-90 Days",
  "90+": "90+ Days",
};

const BUCKET_COLORS: Record<AgingBucket, string> = {
  current: "text-green-600",
  "1-30": "text-yellow-600",
  "31-60": "text-orange-600",
  "61-90": "text-red-600",
  "90+": "text-red-800",
};

const BUCKET_BG: Record<AgingBucket, string> = {
  current: "bg-green-50 border-green-200",
  "1-30": "bg-yellow-50 border-yellow-200",
  "31-60": "bg-orange-50 border-orange-200",
  "61-90": "bg-red-50 border-red-200",
  "90+": "bg-red-100 border-red-300",
};

export default function CollectionsPage() {
  const { formatCurrency } = useCurrency();
  const [asOfDate, setAsOfDate] = useState(
    () => format(new Date(), "yyyy-MM-dd")
  );
  const [sorting, setSorting] = useState<SortingState>([]);

  const { data: report, isLoading } = useAgingReport({
    as_of_date: asOfDate,
  });

  const installments = report?.installments || [];
  const buckets = report?.buckets || [];
  const customers = report?.customers || [];
  const totalOutstanding = report?.total_outstanding || 0;

  const columnHelper = createColumnHelper<InstallmentData>();

  const columns = useMemo(
    () => [
      columnHelper.accessor("invoice_number", {
        header: "Invoice #",
        cell: (info) => (
          <span className="font-medium">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("customer_name", {
        header: "Customer",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("installment_number", {
        header: "Installment",
        cell: (info) => `#${info.getValue()}`,
      }),
      columnHelper.accessor("due_date", {
        header: "Due Date",
        cell: (info) => {
          const val = info.getValue();
          return val ? format(new Date(val), "MMM dd, yyyy") : "-";
        },
      }),
      columnHelper.accessor("amount", {
        header: "Amount",
        cell: (info) => formatCurrency(info.getValue()),
      }),
      columnHelper.accessor("paid_amount", {
        header: "Paid",
        cell: (info) => formatCurrency(info.getValue()),
      }),
      columnHelper.accessor("balance", {
        header: "Balance",
        cell: (info) => (
          <span className="font-semibold">
            {formatCurrency(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("days_overdue", {
        header: "Days Overdue",
        cell: (info) => {
          const days = info.getValue();
          return days > 0 ? (
            <span className="text-red-600 font-medium">{days} days</span>
          ) : (
            <span className="text-green-600">Current</span>
          );
        },
      }),
      columnHelper.accessor("aging_bucket", {
        header: "Aging Bucket",
        cell: (info) => {
          const bucket = info.getValue();
          return (
            <Badge
              variant="outline"
              className={cn(BUCKET_BG[bucket], BUCKET_COLORS[bucket])}
            >
              {BUCKET_LABELS[bucket]}
            </Badge>
          );
        },
      }),
      columnHelper.accessor("late_fee", {
        header: "Late Fee",
        cell: (info) => {
          const fee = info.getValue();
          return fee > 0 ? (
            <span className="text-red-600">{formatCurrency(fee)}</span>
          ) : (
            "-"
          );
        },
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge variant="secondary">{info.getValue()}</Badge>
        ),
      }),
    ],
    [formatCurrency, columnHelper]
  );

  const table = useReactTable({
    data: installments,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div>
      <PageHeader
        title="Collections"
        subtitle="Invoice aging report and collections management"
      />

      <Container className="p-4 space-y-6">
        {/* Date Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-end gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">As of Date</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="pl-9 w-[200px]"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                Total Outstanding:{" "}
                <span className="font-bold text-foreground text-lg">
                  {formatCurrency(totalOutstanding)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Aging Bucket Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {(
            ["current", "1-30", "31-60", "61-90", "90+"] as AgingBucket[]
          ).map((bucket) => {
            const bucketData = buckets.find((b) => b.bucket === bucket);
            return (
              <Card key={bucket} className={cn("border", BUCKET_BG[bucket])}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle
                    className={cn(
                      "text-sm font-medium",
                      BUCKET_COLORS[bucket]
                    )}
                  >
                    {BUCKET_LABELS[bucket]}
                  </CardTitle>
                  {bucket === "current" ? (
                    <Clock className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle
                      className={cn("h-4 w-4", BUCKET_COLORS[bucket])}
                    />
                  )}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(bucketData?.total_balance || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {bucketData?.count || 0} installments
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Installments Table */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Installments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className="cursor-pointer select-none"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <div className="flex items-center gap-1">
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="text-center py-10"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <Receipt className="h-10 w-10 text-muted-foreground" />
                          <p className="text-muted-foreground">
                            No outstanding installments found
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} className="hover:bg-muted/50">
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* By Customer Summary */}
        {customers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>By Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Installments</TableHead>
                    <TableHead className="text-right">
                      Total Balance
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.customer_id}>
                      <TableCell className="font-medium">
                        {customer.customer_name}
                      </TableCell>
                      <TableCell className="text-right">
                        {customer.installment_count}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(customer.total_balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Container>
    </div>
  );
}
