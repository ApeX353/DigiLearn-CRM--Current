import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
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
  useSalesPerformanceStats,
  usePipelineAnalysisStats,
  useFinanceReportStats,
} from "~/api/reports";
import { useReportExport } from "~/api/reports/use-report-export";
import { useCurrency } from "~/hooks/use-currency";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Loader2, Download } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import PageHeader from "~/components/page-header";

function ExportButton({
  reportType,
  dateRange,
}: {
  reportType: "sales" | "pipeline" | "collections";
  dateRange?: "mtd" | "qtd" | "ytd";
}) {
  const exportReport = useReportExport();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={exportReport.isPending}
        >
          {exportReport.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onClick={() =>
            exportReport.mutate({ reportType, format: "pdf", dateRange })
          }
        >
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            exportReport.mutate({ reportType, format: "xlsx", dateRange })
          }
        >
          Download Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ReportsPage() {
  const { formatCurrency } = useCurrency();
  const { data: salesStats, isLoading: salesLoading } =
    useSalesPerformanceStats("quarter");
  const { data: pipelineStats, isLoading: pipelineLoading } =
    usePipelineAnalysisStats();
  const { data: financeStats, isLoading: financeLoading } =
    useFinanceReportStats();

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Sales performance and analytics" />

      <section className="p-4">
        <Tabs defaultValue="sales">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="sales">Sales Performance</TabsTrigger>
              <TabsTrigger value="pipeline">Pipeline Analysis</TabsTrigger>
              <TabsTrigger value="finance">Finance Report</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="sales" className="space-y-4">
            <div className="flex justify-end">
              <ExportButton reportType="sales" dateRange="qtd" />
            </div>
            {salesLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Principal Sold
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(salesStats?.totalPrincipalSold || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This quarter
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Contract Value
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(salesStats?.totalContractValue || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Including financing
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Cash Collected
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(salesStats?.cashCollected || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This quarter
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Outstanding
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(salesStats?.outstanding || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">Receivables</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-4">
            <div className="flex justify-end">
              <ExportButton reportType="pipeline" />
            </div>
            {pipelineLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Stage Conversion Analysis</CardTitle>
                    <CardDescription>
                      Deals distribution across pipeline stages
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pipelineStats && pipelineStats.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={pipelineStats}
                          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            className="stroke-muted"
                          />
                          <XAxis
                            dataKey="stageName"
                            tick={{ fill: "hsl(var(--muted-foreground))" }}
                          />
                          <YAxis
                            tick={{ fill: "hsl(var(--muted-foreground))" }}
                            tickFormatter={(value) =>
                              `$${(value / 1000).toFixed(0)}k`
                            }
                          />
                          <Tooltip
                            formatter={(value: number, name: string) => {
                              if (name === "totalValue")
                                return [formatCurrency(value), "Value"];
                              if (name === "dealCount") return [value, "Deals"];
                              return [value, name];
                            }}
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "var(--radius)",
                            }}
                          />
                          <Bar dataKey="totalValue" radius={[4, 4, 0, 0]}>
                            {pipelineStats.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.stageColor}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No active deals in pipeline
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Stage Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pipelineStats && pipelineStats.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Stage</TableHead>
                            <TableHead>Deals</TableHead>
                            <TableHead>Total Value</TableHead>
                            <TableHead>Avg Days</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pipelineStats.map((stage) => (
                            <TableRow key={stage.stageName}>
                              <TableCell>
                                <Badge
                                  style={{ backgroundColor: stage.stageColor }}
                                  className="text-white"
                                >
                                  {stage.stageName}
                                </Badge>
                              </TableCell>
                              <TableCell>{stage.dealCount}</TableCell>
                              <TableCell>
                                {formatCurrency(stage.totalValue)}
                              </TableCell>
                              <TableCell>
                                {Math.round(stage.avgDaysInStage)} days
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        No pipeline data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="finance" className="space-y-4">
            <div className="flex justify-end">
              <ExportButton reportType="collections" />
            </div>
            {financeLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Revenue by Payment Method</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {financeStats?.revenueByMethod &&
                      financeStats.revenueByMethod.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie
                              data={financeStats.revenueByMethod}
                              dataKey="amount"
                              nameKey="method"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label={({ method, percent }) =>
                                `${method} ${(percent * 100).toFixed(0)}%`
                              }
                            >
                              {financeStats.revenueByMethod.map((_, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={`hsl(${index * 60}, 70%, 50%)`}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: number) =>
                                formatCurrency(value)
                              }
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "var(--radius)",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No payment data available
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Outstanding Invoices</CardTitle>
                      <CardDescription>
                        Invoices awaiting payment
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {financeStats?.outstandingInvoices &&
                      financeStats.outstandingInvoices.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Invoice</TableHead>
                              <TableHead>School</TableHead>
                              <TableHead>Due</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {financeStats.outstandingInvoices
                              .slice(0, 5)
                              .map((inv) => (
                                <TableRow key={inv.id}>
                                  <TableCell className="font-medium">
                                    {inv.invoiceNumber}
                                  </TableCell>
                                  <TableCell className="max-w-30 truncate">
                                    {inv.schoolName}
                                  </TableCell>
                                  <TableCell>
                                    {formatCurrency(
                                      inv.amountDue - inv.amountPaid,
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        inv.status === "Overdue"
                                          ? "destructive"
                                          : "secondary"
                                      }
                                    >
                                      {inv.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No outstanding invoices
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Upcoming Installments</CardTitle>
                    <CardDescription>
                      Next payment installments due
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {financeStats?.upcomingInstallments &&
                    financeStats.upcomingInstallments.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Deal</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {financeStats.upcomingInstallments.map((inst) => (
                            <TableRow key={inst.id}>
                              <TableCell className="font-medium">
                                {inst.dealName}
                              </TableCell>
                              <TableCell>
                                {formatCurrency(inst.amount)}
                              </TableCell>
                              <TableCell>
                                {new Date(inst.dueDate).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    inst.status === "OVERDUE"
                                      ? "destructive"
                                      : "secondary"
                                  }
                                >
                                  {inst.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No upcoming installments
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
