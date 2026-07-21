import { useEffect, useState } from "react";
import Modal from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Calendar } from "~/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Separator } from "~/components/ui/separator";
import {
  Loader2,
  Users,
  Package,
  CreditCard,
  Clock,
  Wallet,
  CalendarIcon,
  AlertCircle,
} from "lucide-react";
import {
  useLeadQualification,
  useUpdateLeadQualification,
} from "~/api/lead-qualification";
import {
  TIMELINE_TYPES,
  BUDGET_INDICATORS,
  type TimelineType,
  type BudgetIndicator,
  type LeadQualificationValues,
  leadQualificationSchema,
} from "~/api/lead-qualification/types";
import { cn } from "~/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePaymentTerms } from "~/api/payment-terms";
import { useProducts } from "~/api/products";
import {
  Form,
  FormField,
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { useLeadStakeholders } from "~/api/leads";
import { toast } from "sonner";
import { format } from "date-fns";
import { Checkbox } from "../ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { handleApiError } from "~/api/axios";

interface LeadQualificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
}

const TIMELINE_LABELS: Record<TimelineType, string> = {
  "this-term": "This Term",
  "next-term": "Next Term",
  "within-6-months": "Within 6 Months",
  "within-1-year": "Within 1 Year",
  "specific-date": "Specific Date",
};

const BUDGET_LABELS: Record<BudgetIndicator, string> = {
  high: "High (Above Budget)",
  medium: "Medium (Within Budget)",
  low: "Low (Below Budget)",
  "not-disclosed": "Not Disclosed",
};

export function LeadQualificationModal({
  isOpen,
  onClose,
  leadId,
}: LeadQualificationModalProps) {
  const { data: qualificationData, isLoading } = useLeadQualification(leadId);
  const { data: stakeholdersData, isLoading: isLoadingStakeholders } =
    useLeadStakeholders(leadId);
  const { data: paymentTermsData, isLoading: isLoadingTerms } = usePaymentTerms(
    {
      limit: 50,
      page: 1,
      is_active: true,
    },
  );
  const { data: productsData, isLoading: isLoadingProducts } = useProducts({
    is_active: true,
    limit: 100,
    page: 1,
  });
  const updateMutation = useUpdateLeadQualification();

  const qualification = qualificationData?.data;
  const paymentTerms = paymentTermsData?.data || [];
  const stakeholders = stakeholdersData?.data || [];
  const products = productsData?.data || [];

  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const form = useForm<LeadQualificationValues>({
    resolver: zodResolver(leadQualificationSchema),
    defaultValues: {
      stakeholder_id: "",
      decision_maker_name: "",
      decision_maker_title: "",
      product_ids: [],
      needs: "",
      payment_term_id: undefined,
      plan_type: undefined,
      timeline_type: "this-term",
      specific_date: undefined,
      budget_indicator: "not-disclosed",
      budget_amount: undefined,
    },
  });

  const timelineType = form.watch("timeline_type");
  const budgetIndicator = form.watch("budget_indicator");

  // Populate form when qualification data loads
  useEffect(() => {
    if (qualification && products.length > 0 && stakeholders.length > 0) {
      // Find stakeholder by name match
      const matchingStakeholder = stakeholders.find(
        (s) =>
          `${s.contact?.first_name} ${s.contact?.last_name}` ===
          qualification.decision_maker_name,
      );

      // Parse needs CSV to find matching product IDs
      const needsNames = qualification.needs
        ? qualification.needs.split(",").map((n) => n.trim())
        : [];
      const matchingProductIds = products
        .filter((p) => needsNames.includes(p.name))
        .map((p) => p.id);

      // Find payment term by name match
      const matchingTerm = paymentTerms.find(
        (t) => t.name === qualification.plan_type,
      );

      form.reset({
        stakeholder_id: matchingStakeholder?.id || "",
        decision_maker_name: qualification.decision_maker_name || "",
        decision_maker_title: qualification.decision_maker_title || "",
        product_ids: matchingProductIds,
        needs: qualification.needs || "",
        payment_term_id: matchingTerm?.id || undefined,
        plan_type: qualification.plan_type || "",
        timeline_type: qualification.timeline_type || "this-term",
        specific_date: qualification.specific_date || undefined,
        budget_indicator: qualification.budget_indicator || "not-disclosed",
        budget_amount: qualification.budget_amount || undefined,
      });

      setSelectedProducts(matchingProductIds);
    }
  }, [qualification, products, stakeholders, paymentTerms, form]);

  // Update product_ids when selectedProducts changes
  useEffect(() => {
    form.setValue("product_ids", selectedProducts);
    // Also update needs CSV
    const selectedProductNames = products
      .filter((p) => selectedProducts.includes(p.id))
      .map((p) => p.name)
      .join(", ");
    form.setValue("needs", selectedProductNames);
  }, [selectedProducts, products, form]);

  const handleStakeholderChange = (stakeholderId: string) => {
    const stakeholder = stakeholders.find((s) => s.id === stakeholderId);
    if (stakeholder?.contact) {
      form.setValue("stakeholder_id", stakeholderId);
      form.setValue(
        "decision_maker_name",
        `${stakeholder.contact.first_name} ${stakeholder.contact.last_name}`,
      );
      form.setValue("decision_maker_title", stakeholder.contact.role || "");
    }
  };

  const handlePaymentTermChange = (termId: string) => {
    const term = paymentTerms.find((t) => t.id === termId);
    if (term) {
      form.setValue("payment_term_id", termId);
      form.setValue("plan_type", term.name);
    }
  };

  const toggleProduct = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    );
  };

  const handleSubmit = (values: LeadQualificationValues) => {
    if (qualification?.id) {
      // The backend's qualify gate checks `qualification_needs`
      // (product snapshots), not the `needs` display string. Without
      // this array every qualify attempt failed with
      // "boards/products required" even after products were picked.
      const qualificationNeeds = products
        .filter((p) => selectedProducts.includes(p.id))
        .map((p) => ({
          id: p.id,
          name: p.name,
          price: Math.round(Number(p.price) || 0),
          tax: Math.round(Number(p.tax) || 0),
          discount: Math.round(Number(p.discount) || 0),
        }));

      updateMutation.mutate(
        {
          id: qualification.id,
          data: {
            decision_maker_name: values.decision_maker_name,
            decision_maker_title: values.decision_maker_title,
            needs: values.needs,
            qualification_needs: qualificationNeeds,
            plan_type: values.plan_type,
            timeline_type: values.timeline_type,
            specific_date:
              values.timeline_type === "specific-date"
                ? values.specific_date
                : undefined,
            budget_indicator: values.budget_indicator,
            budget_amount:
              values.budget_indicator !== "not-disclosed"
                ? values.budget_amount
                : undefined,
          },
        },
        {
          onSuccess: () => {
            toast.success("Qualification updated successfully");
            onClose();
          },
          onError: (error) => {
            toast.error("Could not update qualification", {
              description: handleApiError(error),
            });
          },
        },
      );
    } else {
      // either create or show error
      toast.error("Qualification record is missing", {
        description:
          "Refresh the lead page. The CRM creates this record automatically for every lead.",
      });
    }
  };

  const handleOnClose = () => {
    form.reset();
    onClose();
  };

  if (
    isLoading ||
    isLoadingTerms ||
    isLoadingProducts ||
    isLoadingStakeholders
  ) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleOnClose}
        title="Lead Qualification"
        // size="md"
      >
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Lead Qualification (BANT)"
      size="sm"
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit, () => {
            toast.error("Complete the required qualification fields", {
              description:
                "Authority, products required, payment plan, timeline, and budget status are needed before a lead can be qualified.",
            });
          })}
          className="space-y-6"
        >
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Required before Qualified</AlertTitle>
            <AlertDescription>
              Capture the decision-maker, need/products, payment plan, budget
              signal, timeline, and a future next action before marking the
              lead as Qualified.
            </AlertDescription>
          </Alert>
         
          {/* Section 1: Authority - Decision Maker */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              <span>Authority - Decision Maker</span>
            </div>
            <FormField
              name="stakeholder_id"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Select Decision Maker{" "}
                    <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={handleStakeholderChange}
                      className="space-y-2"
                    >
                      {stakeholders.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No stakeholders found. Add contacts to this lead
                          first.
                        </p>
                      ) : (
                        stakeholders.map((stakeholder) => (
                          <div
                            key={stakeholder.id}
                            className="flex items-center space-x-3 rounded-md border p-3"
                          >
                            <RadioGroupItem
                              value={stakeholder.id}
                              id={stakeholder.id}
                            />
                            <Label
                              htmlFor={stakeholder.id}
                              className="flex-1 cursor-pointer"
                            >
                              <div className="font-medium">
                                {stakeholder.contact?.first_name}{" "}
                                {stakeholder.contact?.last_name}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {stakeholder.contact?.role} -{" "}
                                {stakeholder.decision_role}
                              </div>
                            </Label>
                          </div>
                        ))
                      )}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField
                name="checklist.email_verified"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="flex items-center">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked)}
                          className="space-y-2"
                          id="email_verified"
                        />
                        <Label htmlFor="email_verified" className="ml-2">
                          Email Verified
                        </Label>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="checklist.phone_verified"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="flex items-center">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked)}
                          className="space-y-2"
                          id="phone_verified"
                        />
                        <Label htmlFor="phone_verified" className="ml-2">
                          Phone Verified
                        </Label>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="checklist.province_verified"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="flex items-center">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked)}
                          className="space-y-2"
                          id="province_verified"
                        />
                        <Label htmlFor="province_verified" className="ml-2">
                          Province Verified
                        </Label>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Section 2: Needs - Product Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4" />
              <span>Needs - Products/Services Required</span>
            </div>
            <FormField
              name="product_ids"
              control={form.control}
              render={() => (
                <FormItem>
                  <FormLabel>
                    Select Products <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2">
                      {products.map((product) => {
                        const isSelected = selectedProducts.includes(
                          product.id,
                        );
                        return (
                          <Badge
                            key={product.id}
                            variant={isSelected ? "default" : "outline"}
                            className={cn(
                              "cursor-pointer text-sm py-1.5 px-3 transition-colors",
                              isSelected &&
                                "bg-primary text-primary-foreground",
                            )}
                            onClick={() => toggleProduct(product.id)}
                          >
                            {product.name}
                          </Badge>
                        );
                      })}
                      {products.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No active products found.
                        </p>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Section 3: Plan Type - Payment Terms */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CreditCard className="h-4 w-4" />
              <span>Payment Plan</span>
            </div>
            <FormField
              name="payment_term_id"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Select Payment Plan{" "}
                    <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={handlePaymentTermChange}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a payment plan" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {paymentTerms.map((term) => (
                        <SelectItem key={term.id} value={term.id}>
                          {term.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Section 4: Timeline */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4" />
              <span>Timeline</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                name="timeline_type"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Expected Timeline{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select timeline" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIMELINE_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {TIMELINE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {timelineType === "specific-date" && (
                <FormField
                  name="specific_date"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Specific Date{" "}
                        <span className="text-destructive">*</span>
                      </FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !field.value && "text-muted-foreground",
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value
                                ? format(new Date(field.value), "PPP")
                                : "Pick a date"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={
                              field.value ? new Date(field.value) : undefined
                            }
                            onSelect={(date) =>
                              field.onChange(date?.toISOString())
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>

          {/* Section 5: Budget */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="h-4 w-4" />
              <span>Budget</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                name="budget_indicator"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Budget Status <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select budget status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BUDGET_INDICATORS.map((indicator) => (
                          <SelectItem key={indicator} value={indicator}>
                            {BUDGET_LABELS[indicator]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {budgetIndicator !== "not-disclosed" && (
                <FormField
                  name="budget_amount"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Budget Amount{" "}
                        <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Enter budget amount"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>

          <Separator />

          {/* Submit Button */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Qualification
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
}
