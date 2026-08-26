import { useMemo, useState } from "react";
import { Card, CardContent } from "~/components/ui/card";
import PageHeader from "~/components/page-header";
import Container from "~/components/container";
import { Skeleton } from "~/components/ui/skeleton";
import { useCurrency } from "~/hooks/use-currency";
import { CalendarIcon, CreditCard, DollarSign, TrendingUp } from "lucide-react";
import { format, startOfYear } from "date-fns";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import {
  usePaymentsList,
  usePaymentStatistics,
  type Payment,
} from "~/api/payments";

const columnHelper = createColumnHelper<Payment>();

const paymentMethodLabels: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  mobile_money: "Mobile Money",
  check: "Check",
  other: "Other",
};

export default function PaymentsPage() {
  const { formatCurrency } = useCurrency();
  const currentYear = new Date().getFullYear();
  const fiscalYearStart = startOfYear(new Date(currentYear, 0, 1));

  const [dateRange, setDateRange] = useState<{
    from: Date;
    to: Date;
  }>({
    from: fiscalYearStart,
    to: new Date(),
  });

  const listParams = useMemo(
    () => ({
      start_date: format(dateRange.from, "yyyy-MM-dd"),
      end_date: format(dateRange.to, "yyyy-MM-dd"),
      limit: 100,
    }),
    [dateRange],
  );

  const statsParams = useMemo(
    () => ({
      start_date: listParams.start_date,
      end_date: listParams.end_date,
    }),
    [listParams],
  );

  const { data: paymentsData, isLoading } = usePaymentsList(listParams);
  const { data: statistics } = usePaymentStatistics(statsParams);

  const totalPayments = statistics?.total_payments ?? 0;
  const totalAmount = Number(statistics?.total_amount ?? 0);
  const totalAllocated = Number(statistics?.total_allocated ?? 0);

  const columns = [
    columnHelper.accessor("reference_number", {
      header: "Reference",
      cell: (info) => info.getValue() || info.row.original.reference || "-",
    }),
    columnHelper.accessor("payment_date", {
      header: "Date",
      cell: (info) => format(new Date(info.getValue()), "dd-MM-yyyy"),
    }),
    columnHelper.accessor("invoice", {
      header: "Customer",
      cell: (info) => {
        const invoice = info.getValue();
        return (
          <div className="space-y-1">
            <p>{invoice?.client_name}</p>
            <p className="text-xs text-muted-foreground">
              {invoice?.client_email}
            </p>
          </div>
        );
      },
    }),
    columnHelper.accessor("amount", {
      header: "Amount",
      cell: (info) => formatCurrency(Number(info.getValue())),
    }),
    columnHelper.accessor("payment_method", {
      header: "Method",
      cell: (info) => {
        const method =
          info.row.original.payment_method || info.row.original.method || "";
        return paymentMethodLabels[method] || method || "-";
      },
    }),

    columnHelper.accessor("allocated_amount", {
      header: "Allocated",
      cell: (info) => formatCurrency(Number(info.getValue())),
    }),
  ];

  const payments = paymentsData?.data || [];

  const table = useReactTable({
    data: payments,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div>
      <PageHeader title="Payments" />

      <Container className="p-4 space-y-6">
        {/* Date Range Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">From:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[200px] justify-start text-left font-normal",
                        !dateRange.from && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        format(dateRange.from, "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.from}
                      onSelect={(date) =>
                        date &&
                        setDateRange((prev) => ({ ...prev, from: date }))
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">To:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[200px] justify-start text-left font-normal",
                        !dateRange.to && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.to ? (
                        format(dateRange.to, "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.to}
                      onSelect={(date) =>
                        date && setDateRange((prev) => ({ ...prev, to: date }))
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 border border-gray-300 bg-white">
            <div className="flex items-center justify-between">
              <div className="space-y-1 min-w-0 flex-1 mr-2">
                <p className="text-xs font-medium text-black truncate">
                  Total Payments
                </p>
                <p className="text-2xl font-bold text-black">{totalPayments}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(totalAmount)}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center flex-shrink-0">
                <DollarSign className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 border border-gray-300 bg-white">
            <div className="flex items-center justify-between">
              <div className="space-y-1 min-w-0 flex-1 mr-2">
                <p className="text-xs font-medium text-black truncate">
                  Allocated
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(totalAllocated)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totalAmount
                    ? `${((totalAllocated / totalAmount) * 100).toFixed(1)}%`
                    : "0%"}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 border border-green-200 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </Card>

          <Card className="p-4 border border-gray-300 bg-white">
            <div className="flex items-center justify-between">
              <div className="space-y-1 min-w-0 flex-1 mr-2">
                <p className="text-xs font-medium text-black truncate">
                  Avg Payment
                </p>
                <p className="text-2xl font-bold text-black">
                  {formatCurrency(
                    totalPayments ? totalAmount / totalPayments : 0,
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Per transaction</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-6 w-6 text-black" />
              </div>
            </div>
          </Card>
        </div>

        {/* Payments Table */}
        <Card>
          {isLoading ? (
            <CardContent>
              <div className="grid grid-cols-2 gap-x-2">
                <Skeleton className="h-6" />
                <Skeleton className="h-6" />
              </div>
            </CardContent>
          ) : (
            <CardContent>
              <table className="w-full">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b bg-slate-50">
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-4 py-3 text-left text-sm font-semibold"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-slate-50">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3 text-sm">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {payments.length === 0 && (
                <div className="text-center py-8 text-sm text-slate-500">
                  No payments found for the selected date range
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </Container>
    </div>
  );
}
