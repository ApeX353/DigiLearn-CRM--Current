import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  FormField,
  FormDescription,
  FormLabel,
  FormControl,
  FormMessage,
  FormItem,
  Form,
} from "~/components/ui/form";
import Modal from "~/components/ui/modal";
import { DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { usePaymentTerms } from "~/api/payment-terms";
import type { PaymentTerm } from "~/api/payment-terms/types";
import { calculatePaymentTerms } from "~/lib/payment-terms-calculator";

export interface PaymentTermCalculationResult {
  subtotalAfterDiscount: number;
  interestAmount: number;
  amountBeforeTax: number;
  taxAmount: number;
  total: number;
  termCount?: number;
  installmentAmount?: number;
}

const calculatorSchema = z.object({
  paymentTermId: z.string().min(1, "Please select a payment term"),
  subtotal: z.number().min(0),
  discount: z.number().min(0),
  tax: z.number().min(0),
});

type CalculatorFormValues = z.infer<typeof calculatorSchema>;

interface PaymentTermsCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: {
    paymentTermId: string;
    interest: number;
    total: number;
    term: PaymentTerm;
    result: PaymentTermCalculationResult;
  }) => void;
  initialSubtotal?: number;
  initialDiscount?: number;
  initialTax?: number;
  initialPaymentTermId?: string;
  disableInputs?: boolean;
}


export default function PaymentTermsCalculatorModal({
  isOpen,
  onClose,
  onApply,
  initialSubtotal,
  initialDiscount,
  initialTax,
  initialPaymentTermId,
  disableInputs,
}: PaymentTermsCalculatorModalProps) {
  const [calculationResult, setCalculationResult] =
    useState<PaymentTermCalculationResult | null>(null);

  const { data: paymentTermsData, isLoading } = usePaymentTerms({
    page: 1,
    limit: 100,
    is_active: true,
  });

  const paymentTerms = paymentTermsData?.data || [];
  const defaultTerm =
    paymentTerms.find((t) => t.is_default) ||
    paymentTerms.find((t) => t.type === "cash");

  const form = useForm<CalculatorFormValues>({
    resolver: zodResolver(calculatorSchema),
    defaultValues: useMemo(
      () => ({
        paymentTermId: initialPaymentTermId || defaultTerm?.id || "",
        subtotal: initialSubtotal ?? 0,
        discount: initialDiscount ?? 0,
        tax: initialTax ?? 0,
      }),
      [
        initialPaymentTermId,
        initialSubtotal,
        initialDiscount,
        initialTax,
        defaultTerm?.id,
      ],
    ),
  });

  useEffect(() => {
    form.setValue("subtotal", initialSubtotal ?? 0);
    form.setValue("discount", initialDiscount ?? 0);
    form.setValue("tax", initialTax ?? 0);
    if (initialPaymentTermId) {
      form.setValue("paymentTermId", initialPaymentTermId);
    } else if (defaultTerm?.id) {
      form.setValue("paymentTermId", defaultTerm.id);
    }
  }, [
    initialSubtotal,
    initialDiscount,
    initialTax,
    initialPaymentTermId,
    defaultTerm?.id,
    form,
  ]);

  const selectedPaymentTermId = form.watch("paymentTermId");
  const subtotal = form.watch("subtotal");
  const discount = form.watch("discount");
  const tax = form.watch("tax");

  const selectedTerm = paymentTerms.find((t) => t.id === selectedPaymentTermId);

  useEffect(() => {
    if (!selectedTerm || subtotal === undefined) return;

    const baseTotal =
      Number(subtotal || 0) - Number(discount || 0) + Number(tax || 0);
    const paymentTermResult = calculatePaymentTerms({
      subtotal,
      discount: Number(discount || 0),
      taxRate: Number(tax || 0),
      interestRate: Number(selectedTerm.interest_rate || 0),
      numberOfTerms: selectedTerm.number_of_terms || 1,
      interestCalculationMethod: selectedTerm.interest_calculation_method || "none",
    });
    const finalTotal = baseTotal + paymentTermResult.interestAmount;

    setCalculationResult({
      subtotalAfterDiscount: Number(subtotal || 0) - Number(discount || 0),
      interestAmount: paymentTermResult.interestAmount,
      taxAmount: Number(tax || 0),
      amountBeforeTax: baseTotal,
      total: finalTotal,
      termCount: selectedTerm.number_of_terms || undefined,
      installmentAmount: selectedTerm.number_of_terms
        ? finalTotal / selectedTerm.number_of_terms
        : undefined,
    });
  }, [selectedTerm, subtotal, discount, tax]);

  const handleApply = () => {
    if (!calculationResult || !selectedTerm) {
      toast.error("Please select a payment term first");
      return;
    }

    onApply({
      paymentTermId: selectedPaymentTermId,
      interest: calculationResult.interestAmount,
      total: calculationResult.total,
      term: selectedTerm,
      result: calculationResult,
    });

    toast.success("Payment terms applied successfully");
    onClose();
  };

  const handleClose = () => {
    setCalculationResult(null);
    form.reset();
    onClose();
  };

  if (isLoading) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Payment Terms Calculator"
      description="Calculate interest and final totals based on selected payment terms"
      size="md"
    >
      <Form {...form}>
        <form className="space-y-6">
          <FormField
            control={form.control}
            name="paymentTermId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Term</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment term" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {paymentTerms.map((term) => (
                      <SelectItem key={term.id} value={term.id}>
                        <div className="flex items-center justify-between w-full gap-4">
                          <span>{term.name || term.type}</span>
                          <span className="text-muted-foreground text-xs">
                            {Number(term.interest_rate ?? 0).toFixed(2)}%
                            interest
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTerm?.description && (
                  <FormDescription>{selectedTerm.description}</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="subtotal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subtotal</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="pl-9"
                        disabled={disableInputs}
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>Total product value</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="discount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="pl-9"
                        disabled={disableInputs}
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>Total discount</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tax"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Amount</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="pl-9"
                        disabled={disableInputs}
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>Calculated tax from items</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {calculationResult && (
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">Calculation Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 font-mono text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-semibold">
                      ${Number(subtotal || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Discount:</span>
                    <span>- ${Number(discount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Tax:</span>
                    <span>+ ${Number(tax || 0).toFixed(2)}</span>
                  </div>
                  <hr className="border-dashed" />
                  <div className="flex justify-between">
                    <span>Base Total (with tax):</span>
                    <span className="font-semibold">
                      ${calculationResult.amountBeforeTax.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-blue-600">
                    <span>
                      Interest (
                      {Number(selectedTerm?.interest_rate ?? 0).toFixed(2)}%{" "}
                      {selectedTerm?.interest_calculation_method || "simple"}):
                    </span>
                    <span>
                      + ${calculationResult.interestAmount.toFixed(2)}
                    </span>
                  </div>
                  <hr className="border-double border-2" />
                  <div className="flex justify-between text-lg font-bold">
                    <span>TOTAL:</span>
                    <span className="text-primary">
                      ${calculationResult.total.toFixed(2)}
                    </span>
                  </div>
                  {calculationResult.installmentAmount &&
                    calculationResult.termCount && (
                      <div className="flex justify-between text-purple-600 mt-2 pt-2 border-t">
                        <span>
                          Per Installment ({calculationResult.termCount} terms):
                        </span>
                        <span className="font-semibold">
                          ${calculationResult.installmentAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                </div>

                {selectedTerm?.terms_and_conditions && (
                  <div className="mt-4 p-3 bg-background rounded-md border">
                    <p className="text-xs font-semibold mb-1">
                      Terms & Conditions:
                    </p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {selectedTerm.terms_and_conditions}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-x-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApply}
              disabled={!calculationResult || !selectedPaymentTermId}
            >
              Apply Payment Terms
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
}
