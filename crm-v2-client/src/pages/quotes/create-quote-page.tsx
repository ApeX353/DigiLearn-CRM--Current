import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Calendar } from "~/components/ui/calendar";
import {
  Autocomplete,
  type AutocompleteOption,
} from "~/components/ui/autocomplete";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import { useSchools } from "~/api/schools";
import { useProducts } from "~/api/products";
import {
  createQuoteSchema,
  useCreateQuote,
  type CreateQuoteDto,
} from "~/api/quotes";
import { DocumentItems } from "~/components/document-items";
import { useDocumentPrepopulation } from "~/hooks/use-document-prepopulation";
import { useCurrency } from "~/hooks/use-currency";

export default function CreateQuotePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const schoolId = searchParams.get("schoolId") || undefined;
  const dealId = searchParams.get("dealId") || undefined;
  const leadId = searchParams.get("leadId") || undefined;
  const personId = searchParams.get("personId") || undefined;
  const createQuote = useCreateQuote();
  const { currency } = useCurrency();
  const [schoolSearch, setSchoolSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const { data: schoolsData, isFetching: schoolsFetching } = useSchools({
    page: 1,
    limit: 50,
    search: schoolSearch || undefined,
  });
  const { data: productsData, isFetching: productsFetching } = useProducts({
    page: 1,
    limit: 100,
    search: productSearch || undefined,
    is_active: true,
  });
  const prepopData = useDocumentPrepopulation({
    schoolId,
    dealId,
    leadId,
    personId,
    quoteId: undefined,
  });

  const schools = schoolsData?.data || [];
  const products = productsData?.data || [];

  const schoolOptions: AutocompleteOption[] = useMemo(() => {
    const options: AutocompleteOption[] = schools.map((school) => ({
      value: school.id,
      label: school.name,
      subtitle: school.province || undefined,
    }));
    // The prefilled school (arriving via ?schoolId/?leadId/?dealId) is often
    // not in the first page of options, and an Autocomplete can't display a
    // value it has no option for — the field looked blank even though the
    // form held the right school_id. Inject it.
    if (
      prepopData.school_id &&
      prepopData.school_name &&
      !options.some((o) => o.value === prepopData.school_id)
    ) {
      options.unshift({
        value: prepopData.school_id,
        label: prepopData.school_name,
        subtitle: undefined,
      });
    }
    return options;
  }, [schools, prepopData.school_id, prepopData.school_name]);

  const form = useForm<CreateQuoteDto>({
    resolver: zodResolver(createQuoteSchema),
    defaultValues: {
      school_id: "",
      client_name: "",
      client_email: "",
      client_address: "",
      notes: "",
      currency,
      items: [
        {
          product_id: "",
          description: "",
          quantity: 1,
          unit_price: 0,
          discount: 0,
          tax_rate: 0,
        },
      ],
    },
  });

  // Populate form from prepopulation data
  useEffect(() => {
    if (prepopData.isReady && !form.formState.isDirty) {
      const defaultItem = {
        product_id: "",
        description: "",
        quantity: 1,
        unit_price: 0,
        discount: 0,
        tax_rate: 0,
      };

      form.reset({
        school_id: prepopData.school_id || "",
        person_id: prepopData.person_id,
        deal_id: prepopData.deal_id,
        client_name: prepopData.client_name || "",
        client_email: prepopData.client_email || "",
        client_address: prepopData.client_address || "",
        notes: prepopData.notes || "",
        currency,
        items:
          prepopData.items && prepopData.items.length > 0
            ? prepopData.items.map((item) => ({
                product_id: item.product_id || "",
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                discount: item.discount || 0,
                tax_rate: item.tax_rate || 0,
              }))
            : [defaultItem],
      });
    }
  }, [prepopData.isReady, form, prepopData]);

  const onSubmit = async (values: CreateQuoteDto) => {
    try {
      await createQuote.mutateAsync({
        school_id: values.school_id,
        person_id: values.person_id,
        deal_id: values.deal_id,
        client_name: values.client_name,
        client_email: values.client_email,
        client_address: values.client_address,
        quote_number: values.quote_number,
        valid_until: values.valid_until,
        notes: values.notes,
        currency: values.currency,
        payment_term_id: values.payment_term_id,
        interest: values.interest,
        tax: values.tax,
        total: values.total,
        items: values.items.map((item) => ({
          product_id: item.product_id || undefined,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.discount,
          tax_rate: item.tax_rate,
        })),
      });
      toast.success("Quote created successfully");
      navigate("/quotes");
    } catch {
      toast.error("Failed to create quote");
    }
  };

  return (
    <div>
      <PageHeader
        title="Create Quote"
        subtitle="Generate a new quote for your customer"
      />

      <Container className="p-4">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6 max-w-5xl mx-auto"
          >
            {/* Customer Information */}
            <Card>
              <CardHeader>
                <CardTitle>Customer Information</CardTitle>
                <CardDescription>
                  Select the school and contact details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="school_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>School *</FormLabel>
                        <FormControl>
                          <Autocomplete
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              const school = schools.find(
                                (s) => s.id === value,
                              );
                              if (school) {
                                const client =
                                  school.contacts?.find((c) => c.is_primary) ||
                                  school.contacts?.[0];
                                const clientName = client
                                  ? `${client.first_name} ${client.last_name || ""}`.trim()
                                  : school.name;
                                const clientEmail = client?.email || "";
                                form.setValue("client_name", clientName);
                                form.setValue("client_email", clientEmail);
                              }
                            }}
                            options={schoolOptions}
                            placeholder="Select school"
                            searchPlaceholder="Search schools..."
                            emptyText="No schools found"
                            searchValue={schoolSearch}
                            onSearchChange={setSchoolSearch}
                            isLoading={schoolsFetching}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="client_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client Name *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Client name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? currency}
                            onChange={(event) =>
                              field.onChange(event.target.value.toUpperCase())
                            }
                            maxLength={3}
                            placeholder="USD"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="client_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client Email</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            placeholder="email@example.com"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="valid_until"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valid Until</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground",
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date()}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="client_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Address</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card>
              <CardHeader>
                <CardTitle>Line Items</CardTitle>
                <CardDescription>
                  Add products or services to the quote
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentItems
                  products={products}
                  onSearch={setProductSearch}
                  productSearchTerm={productSearch}
                  isProductLoading={productsFetching}
                  showPaymentTerms
                  onPaymentTermsApplied={({
                    term,
                    interest,
                    total,
                    result,
                  }) => {
                    const lines = [
                      `Payment Plan: ${term.name || term.type}`,
                      `Interest Rate: ${Number(term.interest_rate).toFixed(2)}% (${term.interest_calculation_method})`,
                      `Interest Amount: $${interest.toFixed(2)}`,
                      `Total: $${total.toFixed(2)}`,
                    ];
                    if (result.installmentAmount && result.termCount) {
                      lines.push(
                        `Installments: ${result.termCount} terms @ $${result.installmentAmount.toFixed(2)}/term`,
                      );
                    }
                    if (term.terms_and_conditions) {
                      lines.push(
                        "",
                        "Terms & Conditions:",
                        term.terms_and_conditions,
                      );
                    }
                    const paymentNotes = lines.join("\n");
                    const currentNotes = form.getValues("notes") || "";
                    const newNotes = currentNotes
                      ? `${currentNotes}\n\n---\n${paymentNotes}`
                      : paymentNotes;
                    form.setValue("notes", newNotes);
                    form.setValue("payment_term_id", term.id);
                    form.setValue(
                      "interest",
                      Number(term.interest_rate).toFixed(2),
                    );
                  }}
                />
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Notes</CardTitle>
                <CardDescription>
                  Add any special terms or conditions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Enter any additional notes or terms..."
                          className="min-h-[100px] resize-none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-4 justify-end">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => navigate("/quotes")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="lg"
                disabled={createQuote.isPending}
                className="min-w-[150px]"
              >
                {createQuote.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Quote
              </Button>
            </div>
          </form>
        </Form>
      </Container>
    </div>
  );
}
