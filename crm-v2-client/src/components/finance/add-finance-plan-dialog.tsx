import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import Modal from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Switch } from "~/components/ui/switch";
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
  useCreatePaymentTerm,
  PAYMENT_TERM_TYPES,
  INTEREST_CALCULATION_METHODS,
  INVOICE_STRATEGIES,
  createPaymentTermSchema,
  type CreatePaymentTermValues,
} from "~/api/payment-terms";

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

const strategyLabels: Record<string, string> = {
  single_with_installments: "Single Invoice with Installments",
  multiple_invoices: "Multiple Invoices",
};

export function AddFinancePlanDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const createPaymentTerm = useCreatePaymentTerm();

  const form = useForm<CreatePaymentTermValues>({
    resolver: zodResolver(createPaymentTermSchema),
    defaultValues: {
      name: "",
      type: "3-term",
      number_of_terms: 3,
      term_length_days: 30,
      days_until_due: 30,
      interest_rate: 0,
      interest_calculation_method: "none",
      invoice_strategy: "single_with_installments",
      grace_period_days: 0,
      late_fee_percentage: 0,
      late_fee_amount: 0,
      description: "",
      terms_and_conditions: "",
      is_active: true,
      is_default: false,
    },
  });

  const onSubmit = async (values: CreatePaymentTermValues) => {
    try {
      await createPaymentTerm.mutateAsync(values);
      toast.success("Finance plan created successfully");
      setIsOpen(false);
      form.reset();
    } catch {
      toast.error("Failed to create finance plan");
    }
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Add Plan
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Create Finance Plan"
        description="Configure a new payment term"
        size="md"
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Standard 3-Term Plan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_TERM_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {typeLabels[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoice_strategy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Strategy</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INVOICE_STRATEGIES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {strategyLabels[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="number_of_terms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Terms</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} value={String(field.value)} onChange={(e: ChangeEvent<HTMLInputElement>) => field.onChange(parseInt(e.target.value) || 1)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="term_length_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Term Length (days)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} value={String(field.value)} onChange={(e: ChangeEvent<HTMLInputElement>) => field.onChange(parseInt(e.target.value) || 1)}  />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="days_until_due"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Days Until Due</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} value={String(field.value)} onChange={(e: ChangeEvent<HTMLInputElement>) => field.onChange(parseInt(e.target.value) || 1)}  />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="interest_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interest Rate (%)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={0.1} value={String(field.value)} onChange={(e: ChangeEvent<HTMLInputElement>) => field.onChange(parseFloat(e.target.value) || 0)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="interest_calculation_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interest Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INTEREST_CALCULATION_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {interestLabels[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="grace_period_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grace Period (days)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} value={String(field.value)} onChange={(e: ChangeEvent<HTMLInputElement>) => field.onChange(parseInt(e.target.value) || 0)}  />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="late_fee_percentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Late Fee (%)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={0.1} value={String(field.value)} onChange={(e: ChangeEvent<HTMLInputElement>) => field.onChange(parseFloat(e.target.value) || 0)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="late_fee_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Late Fee (fixed amount)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={0.01} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of this plan"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="terms_and_conditions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Terms & Conditions</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center gap-6">
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Active</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_default"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Default</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsOpen(false);
                  form.reset();
                }}
                disabled={createPaymentTerm.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createPaymentTerm.isPending}>
                {createPaymentTerm.isPending ? "Creating..." : "Create Plan"}
              </Button>
            </div>
          </form>
        </Form>
      </Modal>
    </>
  );
}
