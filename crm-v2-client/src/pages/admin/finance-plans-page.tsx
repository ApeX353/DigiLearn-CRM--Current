import { useState } from "react";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Calculator, MoreHorizontal, Pencil, Power } from "lucide-react";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";
import {
  usePaymentTerms,
  useTogglePaymentTermActive,
  type PaymentTerm,
} from "~/api/payment-terms";
import { AddFinancePlanDialog } from "~/components/finance/add-finance-plan-dialog";
import { EditFinancePlanDialog } from "~/components/finance/edit-finance-plan-dialog";

const typeLabels: Record<string, string> = {
  cash: "Cash",
  "3-term": "3 Terms",
  "4-term": "4 Terms",
  "6-term": "6 Terms",
  "9-term": "9 Terms",
  "custom-date": "Custom Date",
  "net-30": "Net 30",
  "net-60": "Net 60",
  "net-90": "Net 90",
  custom: "Custom",
};

const interestLabels: Record<string, string> = {
  simple: "Simple",
  compound: "Compound",
  flat: "Flat",
  none: "None",
};

export default function FinancePlansPage() {
  const { data, isLoading } = usePaymentTerms({
    page: 1,
    limit: 100,
  });
  const toggleActive = useTogglePaymentTermActive();
  const [editingPlan, setEditingPlan] = useState<PaymentTerm | null>(null);

  const financePlans = data?.data || [];

  const handleToggleActive = async (plan: PaymentTerm) => {
    try {
      await toggleActive.mutateAsync({
        id: plan.id,
        is_active: !plan.is_active,
      });
      toast.success(`Plan ${plan.is_active ? "deactivated" : "activated"}`);
    } catch {
      toast.error("Failed to update plan status");
    }
  };

  return (
    <div>
      <PageHeader
        title="Finance Plans"
        subtitle="Configure financing options for payment terms"
        actions={<AddFinancePlanDialog />}
      />

      <Container className="p-4">
        {isLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Finance Plans ({financePlans.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {financePlans.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No finance plans found. Create your first plan to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Terms</TableHead>
                      <TableHead>Interest Rate</TableHead>
                      <TableHead>Grace Period</TableHead>
                      <TableHead>Late Fee</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {financePlans.map((plan) => (
                      <TableRow
                        key={plan.id}
                        className={!plan.is_active ? "opacity-60" : ""}
                      >
                        <TableCell className="font-medium">
                          {plan.name}
                          {plan.is_default && (
                            <Badge variant="outline" className="ml-2">
                              Default
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {typeLabels[plan.type] || plan.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {plan.number_of_terms}{" "}
                          {plan.number_of_terms === 1 ? "term" : "terms"}
                          <span className="text-muted-foreground text-sm ml-1">
                            ({plan.term_length_days}d each)
                          </span>
                        </TableCell>
                        <TableCell>
                          {plan.interest_rate}%{" "}
                          <span className="text-muted-foreground text-sm">
                            ({interestLabels[plan.interest_calculation_method]})
                          </span>
                        </TableCell>
                        <TableCell>
                          {plan.grace_period_days} days
                        </TableCell>
                        <TableCell>
                          {plan.late_fee_percentage > 0
                            ? `${plan.late_fee_percentage}%`
                            : plan.late_fee_amount > 0
                              ? `$${plan.late_fee_amount}`
                              : "None"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={plan.is_active ? "default" : "secondary"}
                          >
                            {plan.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setEditingPlan(plan)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleToggleActive(plan)}
                              >
                                <Power className="mr-2 h-4 w-4" />
                                {plan.is_active ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </Container>

      <EditFinancePlanDialog
        plan={editingPlan}
        open={!!editingPlan}
        onOpenChange={(open) => !open && setEditingPlan(null)}
      />
    </div>
  );
}
