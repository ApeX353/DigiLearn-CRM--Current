import { useFieldArray, useFormContext } from "react-hook-form";
import type { Product } from "~/api/products";
import type { PaymentTerm } from "~/api/payment-terms";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Plus, Trash2 } from "lucide-react";
import { FormControl, FormField, FormItem, FormMessage } from "./ui/form";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
import { useEffect, useMemo, useState } from "react";
import { TAX_CONFIG } from "~/data";
import { Input } from "./ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Autocomplete, type AutocompleteOption } from "./ui/autocomplete";
import PaymentTermsCalculatorModal, {
  type PaymentTermCalculationResult,
} from "./finance/payment-terms-calculator-modal";
import { useCurrency } from "~/hooks/use-currency";

interface PaymentTermInfo {
  term: PaymentTerm;
  interest: number;
  total: number;
  result: PaymentTermCalculationResult;
}

export interface DocumentItemsProps {
  products: Product[];
  onSearch?: (value: string) => void;
  productSearchTerm?: string;
  isProductLoading?: boolean;
  showPaymentTerms?: boolean;
  onPaymentTermsApplied?: (data: {
    paymentTermId: string;
    interest: number;
    total: number;
    term: PaymentTerm;
    result: PaymentTermCalculationResult;
  }) => void;
}

const toNum = (val: string | number | undefined): number => {
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : 0;
  }
  const parsed = parseFloat(String(val ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
};

type ItemLike = {
  quantity?: string | number;
  unit_price?: string | number;
  discount?: string | number;
  tax_rate?: string | number;
};

const calculateItemAmounts = (item?: ItemLike) => {
  const qty = toNum(item?.quantity);
  const price = toNum(item?.unit_price);
  const discRate = toNum(item?.discount);
  const taxRate = toNum(item?.tax_rate);

  const subtotal = qty * price;
  const discount = (subtotal * discRate) / 100;
  const taxable = subtotal - discount;
  const tax = (taxable * taxRate) / 100;

  return {
    subtotal,
    discount,
    tax,
    total: taxable + tax,
  };
};

const calculateTotals = (items: ItemLike[] = []) =>
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
  );

export const DocumentItems = ({
  products,
  onSearch,
  productSearchTerm,
  isProductLoading,
  showPaymentTerms = true,
  onPaymentTermsApplied,
}: DocumentItemsProps) => {
  const { formatCurrency } = useCurrency();
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [paymentTermInfo, setPaymentTermInfo] =
    useState<PaymentTermInfo | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useFormContext<any>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = form.watch("items") as ItemLike[] | undefined;

  const totals = calculateTotals(watchedItems ?? []);

  useEffect(() => {
    setPaymentTermInfo((current) => (current ? null : current));
  }, [totals.subtotal, totals.totalDiscount, totals.totalTax]);

  const productOptions: AutocompleteOption[] = useMemo(
    () =>
      (products || []).map((product) => ({
        value: product.id,
        label: product.name,
        subtitle: formatCurrency(product.price),
      })),
    [products, formatCurrency],
  );

  return (
    <div className="pt-4 mb-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="w-24">Qty</TableHead>
            <TableHead className="w-28">Price</TableHead>
            <TableHead className="w-24">Disc %</TableHead>
            <TableHead className="w-24">Tax %</TableHead>
            <TableHead className="w-28 text-right">Total</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field, index) => (
            <TableRow key={field.id}>
              <TableCell className="space-y-2">
                <FormField
                  control={form.control}
                  name={`items.${index}.product_id`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Autocomplete
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            const product = products?.find(
                              (p) => p.id === value,
                            );
                            if (product) {
                              form.setValue(
                                `items.${index}.description`,
                                product.name,
                              );
                              form.setValue(
                                `items.${index}.unit_price`,
                                parseFloat(String(product.price)),
                              );
                              form.setValue(
                                `items.${index}.tax_rate`,
                                parseFloat(String(product.tax)),
                              );
                              form.setValue(
                                `items.${index}.discount`,
                                parseFloat(String(product.discount ?? 0)),
                              );
                            }
                          }}
                          options={productOptions}
                          placeholder="Select product"
                          searchPlaceholder="Search products..."
                          emptyText="No products found"
                          searchValue={productSearchTerm}
                          onSearchChange={onSearch}
                          isLoading={isProductLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`items.${index}.description`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} placeholder="Item description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TableCell>
              <TableCell className="align-top">
                <FormField
                  control={form.control}
                  name={`items.${index}.quantity`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input   type="number" step="1" min="0" value={field.value ?? 0} onChange={(e) => field.onChange(Number(e.target.value))} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TableCell>
              <TableCell className="align-top">
                <FormField
                  control={form.control}
                  name={`items.${index}.unit_price`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input value={field.value ?? 0} onChange={(e) => field.onChange(Number(e.target.value))}  type="number" step="0.01" min="0" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TableCell>
              <TableCell className="align-top">
                <FormField
                  control={form.control}
                  name={`items.${index}.discount`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input value={field.value ?? 0} onChange={(e) => field.onChange(Number(e.target.value))}  type="number" step="1" min="0" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TableCell>
              <TableCell className="align-top">
                <FormField
                  control={form.control}
                  name={`items.${index}.tax_rate`}
                  render={({ field }) => (
                    <FormItem>
                      <Select
                        value={String(field.value ?? "")}
                        onValueChange={(value) => field.onChange(Number(value))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Tax" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TAX_CONFIG.map((tax) => (
                            <SelectItem
                              key={tax.label}
                              value={tax.value.toString()}
                            >
                              {tax.label} ({tax.value}%)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TableCell>
              <TableCell className="align-top text-right font-semibold">
                {formatCurrency(
                  calculateItemAmounts(watchedItems?.[index]).total,
                )}
              </TableCell>
              <TableCell className="align-top">
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Separator className="my-4" />

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() =>
              append({
                product_id: "",
                description: "",
                quantity: 1,
                unit_price: 0,
                discount: 0,
                tax_rate: 0,
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
          {showPaymentTerms && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsTermsModalOpen(true)}
            >
              Apply Terms
            </Button>
          )}
        </div>

        {/* Totals Summary */}
        <div className="w-72 space-y-2 rounded-lg bg-muted/50 p-4">
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

          {paymentTermInfo && (
            <>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Payment Plan</span>
                <span className="font-semibold">
                  {paymentTermInfo.term.name || paymentTermInfo.term.type}
                </span>
              </div>
              {paymentTermInfo.interest > 0 && (
                <>
                  <div className="flex justify-between text-sm text-blue-600">
                    <span>
                      Interest (
                      {Number(
                        paymentTermInfo.term.interest_rate ?? 0,
                      ).toFixed(2)}
                      %)
                    </span>
                    <span>
                      +{formatCurrency(paymentTermInfo.interest)}
                    </span>
                  </div>
                  {paymentTermInfo.result.termCount && (
                    <div className="flex justify-between text-xs text-purple-600">
                      <span>Installments</span>
                      <span>
                        {paymentTermInfo.result.termCount} terms @{" "}
                        {formatCurrency(
                          paymentTermInfo.result.installmentAmount ?? 0,
                        )}
                        /term
                      </span>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax</span>
            <span className="font-medium">
              {formatCurrency(totals.totalTax)}
            </span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-bold text-primary">
              {formatCurrency(paymentTermInfo?.total ?? totals.total)}
            </span>
          </div>
        </div>
      </div>

      {showPaymentTerms && (
        <PaymentTermsCalculatorModal
          isOpen={isTermsModalOpen}
          onClose={() => setIsTermsModalOpen(false)}
          disableInputs
          onApply={(data) => {
            setPaymentTermInfo({
              term: data.term,
              interest: data.interest,
              total: data.total,
              result: data.result,
            });
            onPaymentTermsApplied?.(data);
            setIsTermsModalOpen(false);
          }}
          initialSubtotal={totals.subtotal}
          initialDiscount={totals.totalDiscount}
          initialTax={totals.totalTax}
        />
      )}
    </div>
  );
};
