import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Button } from "~/components/ui/button";
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
  FormDescription,
} from "~/components/ui/form";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Checkbox } from "~/components/ui/checkbox";
import { Textarea } from "~/components/ui/textarea";
import {
  createLeadSchema,
  type AddLeadValues,
  LEAD_SOURCES,
  useCreateLead,
} from "~/api/leads";
import {
  PROVINCES,
  OWNERSHIP_TYPES,
  SCHOOL_TYPES,
  CHURCH_DENOMINATIONS,
  REGIONS,
  DISTRICTS_BY_PROVINCE,
  useSchool,
  useSchools,
} from "~/api/schools";
import { CONTACT_ROLES, PREFERRED_CONTACT_METHODS } from "~/api/contacts";
import { useProducts } from "~/api/products";
import { Plus, Trash2, Save, Building2, Users } from "lucide-react";
import { toast } from "sonner";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import { StaffCombobox } from "~/components/staff-combobox";
import { useAuthStore } from "~/stores/use-auth-store";
import { useRbacStore } from "~/stores/use-rbac-store";
import { useCampaigns } from "~/api/campaigns";
import { DuplicateWarningBanner } from "~/components/duplicates/duplicate-warning-banner";
import type { DuplicateCandidate } from "~/api/duplicates";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";

export default function CreateNewLeadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillSchoolId = searchParams.get("school_id");
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // DUP3: likely-duplicate confirm-to-proceed gate. The banner already peeks
  // for duplicates as the rep types; we lift its flagged candidates here so
  // the first save attempt on a clear duplicate is intercepted with a confirm.
  const [duplicateCandidates, setDuplicateCandidates] = useState<
    DuplicateCandidate[]
  >([]);
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<AddLeadValues | null>(
    null,
  );
  const [schoolSearchTerm, setSchoolSearchTerm] = useState("");
  const [hydratedSchoolId, setHydratedSchoolId] = useState<string | null>(null);
  const createLead = useCreateLead();
  const { data: campaignsData } = useCampaigns();
  const campaigns = campaignsData ?? [];
  const currentUser = useAuthStore((state) => state.user);
  const ability = useRbacStore((state) => state.ability);
  const isSalesRep = currentUser?.roles?.includes("sales_rep") ?? false;
  const cannotAssignToUser = ability.cannot("create", "Lead", "assigned_to");
  const canAssign = !isSalesRep && !cannotAssignToUser;
  const { data: productsData } = useProducts({
    page: 1,
    limit: 100,
    is_active: true,
  });
  const productOptions = productsData?.data ?? [];

  const form = useForm<AddLeadValues>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: {
      lead: {
        name: "",
        source: "Website",
        school_name: "",
        estimated_value: 0,
        notes: "",
        assigned_to: undefined,
      },
      contacts: [
        {
          first_name: "",
          last_name: "",
          email: undefined,
          phone: undefined,
          role: "Head",
          is_primary: true,
          preferred_contact_method: "Email",
        },
      ],
    },
  });

  const province = form.watch("lead.province");
  const selectedSchoolId = form.watch("lead.school_id");
  const watchedContacts = form.watch("contacts");

  const { data: schoolsData, isFetching: isSchoolsLoading } = useSchools({
    page: 1,
    limit: 20,
    search: schoolSearchTerm || undefined,
  });

  const selectedSchoolFromList = (schoolsData?.data || []).find(
    (school) => school.id === selectedSchoolId,
  );

  const { data: selectedSchoolData } = useSchool(selectedSchoolId || "");

  const selectedSchool = useMemo(
    () => selectedSchoolData?.data || selectedSchoolFromList,
    [selectedSchoolData?.data, selectedSchoolFromList],
  );

  const filteredSchools = useMemo(() => {
    if (!schoolSearchTerm.trim() || selectedSchoolId) {
      return [];
    }
    return schoolsData?.data || [];
  }, [schoolSearchTerm, selectedSchoolId, schoolsData?.data]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "contacts",
  });

  useEffect(() => {
    if (!selectedSchoolId) {
      setHydratedSchoolId(null);
      return;
    }

    if (!selectedSchool || hydratedSchoolId === selectedSchoolId) {
      return;
    }

    // Wait for school details that include contacts before hydrating.
    if (!Array.isArray(selectedSchool.contacts)) {
      return;
    }

    const inheritedContact =
      selectedSchool.contacts.find((contact) => contact.is_primary) ||
      selectedSchool.contacts[0];

    if (!inheritedContact) {
      setHydratedSchoolId(selectedSchoolId);
      return;
    }

    form.setValue("contacts.0.contact_id", inheritedContact.id);
    form.setValue("contacts.0.first_name", inheritedContact.first_name || "");
    form.setValue("contacts.0.last_name", inheritedContact.last_name || "");
    form.setValue("contacts.0.email", inheritedContact.email || "");
    form.setValue("contacts.0.phone", inheritedContact.phone || "");
    form.setValue(
      "contacts.0.secondary_phone",
      inheritedContact.secondary_phone || "",
    );
    form.setValue(
      "contacts.0.whatsapp_number",
      inheritedContact.whatsapp_number || "",
    );
    form.setValue("contacts.0.role", inheritedContact.role || "Head");
    form.setValue(
      "contacts.0.preferred_contact_method",
      inheritedContact.preferred_contact_method || "Email",
    );
    form.setValue("contacts.0.notes", inheritedContact.notes || "");
    form.setValue("contacts.0.is_primary", true);
    setHydratedSchoolId(selectedSchoolId);
  }, [form, hydratedSchoolId, selectedSchool, selectedSchoolId]);

  // SCHLEAD2: when the page is opened from a school's "Create lead" button
  // (?school_id=<id>), lock the new lead to that school and fill its
  // details once the record loads. Contacts are inherited by the
  // hydration effect above; here we fill the school-level fields, mirroring
  // what picking a school from the search list does. One-shot so the user
  // can still clear and change the school afterwards.
  useEffect(() => {
    if (!prefillSchoolId || prefillApplied) return;
    if (selectedSchoolId !== prefillSchoolId) {
      form.setValue("lead.school_id", prefillSchoolId);
      return;
    }
    const school = selectedSchoolData?.data;
    if (!school || school.id !== prefillSchoolId) return;
    form.setValue("lead.school_name", school.name);
    form.setValue("lead.city", school.city || undefined);
    form.setValue("lead.province", school.province || undefined);
    form.setValue("lead.region", school.region || undefined);
    form.setValue("lead.school_type", school.school_type || undefined);
    form.setValue("lead.ownership_type", school.ownership_type || undefined);
    form.setValue(
      "lead.church_denomination",
      school.church_denomination || undefined,
    );
    form.setValue("lead.district", school.district || undefined);
    setSchoolSearchTerm(school.name);
    setPrefillApplied(true);
  }, [
    prefillSchoolId,
    prefillApplied,
    selectedSchoolId,
    selectedSchoolData?.data,
    form,
  ]);

  const clearInheritedContactIfEditing = (index: number) => {
    const currentContactId = form.getValues(`contacts.${index}.contact_id`);
    if (currentContactId) {
      form.setValue(`contacts.${index}.contact_id`, undefined);
    }
  };

  useEffect(() => {
    if (isSalesRep) {
      form.setValue("lead.assigned_to", undefined);
    } else if (canAssign && currentUser?.id) {
      form.setValue("lead.assigned_to", currentUser.id);
    }
  }, [canAssign, isSalesRep, currentUser?.id, form]);

  const handleDuplicateCandidatesChange = useCallback(
    (candidates: DuplicateCandidate[]) => {
      setDuplicateCandidates(candidates);
    },
    [],
  );

  const doCreate = async (values: AddLeadValues) => {
    setIsSubmitting(true);
    try {
      const payload = isSalesRep
        ? {
            ...values,
            lead: {
              ...values.lead,
              assigned_to: undefined,
            },
          }
        : !canAssign && currentUser?.id
          ? {
              ...values,
              lead: {
                ...values.lead,
                assigned_to: currentUser.id,
              },
            }
          : values;
      await createLead.mutateAsync(payload);
      toast.success("Lead created successfully!");
      navigate("/leads");
    } catch (error) {
      toast.error("Failed to create lead");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (values: AddLeadValues) => {
    // DUP3: a clear duplicate (the peek only returns candidates at/above the
    // flag threshold — the same ones the banner shows) requires an explicit
    // confirm before we create. Not a hard block: the rep can still proceed.
    if (duplicateCandidates.length > 0) {
      setPendingValues(values);
      setDuplicateConfirmOpen(true);
      return;
    }
    await doCreate(values);
  };

  // Top flagged duplicate, used to name the record in the confirm prompt.
  const topDuplicateName = useMemo(() => {
    const record = duplicateCandidates[0]?.record as
      | { lead_name?: string }
      | undefined;
    return record?.lead_name?.trim() || "an existing lead";
  }, [duplicateCandidates]);

  return (
    <div>
      <PageHeader hasBackButton title="Create New Lead" />
      <Container className="p-4 max-w-4xl mx-auto">
        {/* <pre>{JSON.stringify(form.formState.errors, null, 2)}</pre> */}
        {/* Phase 8 — peek for duplicates as the rep types. The
            banner renders nothing until a candidate is found, so the
            page stays empty when nothing looks suspicious. */}
        <DuplicateBannerBridge
          form={form}
          className="mb-4"
          onCandidatesChange={handleDuplicateCandidatesChange}
        />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Lead Information Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Lead Information
                </CardTitle>
                <CardDescription>
                  Basic information about the lead and school
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <FormField
                    control={form.control}
                    name="lead.name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lead Name *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., St. Mary's School Lead"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lead.product_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product interest</FormLabel>
                        <Select
                          value={field.value ?? "none"}
                          onValueChange={(value) => {
                            const productId =
                              value === "none" ? undefined : value;
                            field.onChange(productId);
                            const product = productOptions.find(
                              (option) => option.id === productId,
                            );
                            if (product && !form.getValues("lead.name").trim()) {
                              form.setValue("lead.name", product.name, {
                                shouldValidate: true,
                              });
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Pick from the catalogue (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No product selected</SelectItem>
                            {productOptions.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
                                {product.sku ? ` (${product.sku})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Optional catalogue link for product reporting.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lead.source"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Source *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select source" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {LEAD_SOURCES.map((source) => (
                              <SelectItem key={source} value={source}>
                                {source}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {campaigns.length > 0 && (
                    <FormField
                      control={form.control}
                      name="lead.source_campaign_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Source campaign</FormLabel>
                          <Select
                            onValueChange={(v) =>
                              field.onChange(v === "none" ? undefined : v)
                            }
                            value={field.value ?? "none"}
                          >
                            <FormControl>
                              <SelectTrigger
                                className="w-full"
                                data-testid="lead-source-campaign"
                              >
                                <SelectValue placeholder="No campaign" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No campaign</SelectItem>
                              {campaigns.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="lead.school_name"
                    render={({ field }) => (
                      <FormItem className="">
                        <FormLabel>School Name *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Search or type school name..."
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              const newSchoolName = e.target.value;
                              setSchoolSearchTerm(newSchoolName);

                              if (selectedSchoolId) {
                                form.setValue("lead.school_id", undefined);
                                setHydratedSchoolId(null);
                              }
                            }}
                          />
                        </FormControl>
                        {isSchoolsLoading && !selectedSchoolId && (
                          <p className="text-xs text-muted-foreground">
                            Searching schools...
                          </p>
                        )}
                        {filteredSchools.length > 0 && (
                          <div className="space-y-2 w-full border border-input rounded-md p-2.5 max-h-48 overflow-y-auto">
                            <p className="text-xs text-muted-foreground mb-2">
                              Select an existing school:
                            </p>
                            {filteredSchools.map((school) => (
                              <Button
                                key={school.id}
                                type="button"
                                className="w-full justify-start capitalize"
                                variant="secondary"
                                onClick={() => {
                                  form.setValue("lead.school_id", school.id);
                                  form.setValue(
                                    "lead.school_name",
                                    school.name,
                                  );
                                  form.setValue(
                                    "lead.city",
                                    school.city || undefined,
                                  );
                                  form.setValue(
                                    "lead.province",
                                    school.province || undefined,
                                  );
                                  form.setValue(
                                    "lead.region",
                                    school.region || undefined,
                                  );
                                  form.setValue(
                                    "lead.school_type",
                                    school.school_type || undefined,
                                  );
                                  form.setValue(
                                    "lead.ownership_type",
                                    school.ownership_type || undefined,
                                  );
                                  form.setValue(
                                    "lead.church_denomination",
                                    school.church_denomination || undefined,
                                  );
                                  form.setValue(
                                    "lead.district",
                                    school.district || undefined,
                                  );
                                  setSchoolSearchTerm(school.name);
                                }}
                              >
                                {school.name}
                              </Button>
                            ))}
                          </div>
                        )}
                        {selectedSchoolId && (
                          <p className="text-xs text-muted-foreground">
                            School selected. Clear the field to search for a
                            different school.
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lead.estimated_value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estimated Value</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseFloat(e.target.value) || 0)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* LNAME2: capture what the client wants / is interested
                      in, on the lead itself. */}
                  <FormField
                    control={form.control}
                    name="lead.notes"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>What the client wants / Interest</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="e.g. interested in interactive boards for 850 students; wants a demo next term"
                            rows={3}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lead.province"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Province</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select province" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PROVINCES.map((province) => (
                              <SelectItem key={province} value={province}>
                                {province}
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
                    name="lead.district"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>District</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!province}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select district" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(province
                              ? DISTRICTS_BY_PROVINCE[province]
                              : []
                            ).map((district) => (
                              <SelectItem key={district} value={district}>
                                {district}
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
                    name="lead.city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter city" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lead.region"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Region</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select region" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {REGIONS.map((region) => (
                              <SelectItem key={region} value={region}>
                                {region.charAt(0).toUpperCase() +
                                  region.slice(1)}
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
                    name="lead.school_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>School Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select school type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SCHOOL_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
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
                    name="lead.ownership_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ownership Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select ownership type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {OWNERSHIP_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
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
                    name="lead.church_denomination"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Church Denomination</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={
                            form.watch("lead.ownership_type") !==
                            "Mission / Church"
                          }
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select denomination" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CHURCH_DENOMINATIONS.map((denom) => (
                              <SelectItem key={denom} value={denom}>
                                {denom}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {!isSalesRep && (
                    <FormField
                      control={form.control}
                      name="lead.assigned_to"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assigned To</FormLabel>
                          <FormControl>
                            <StaffCombobox
                              value={field.value}
                              onValueChange={field.onChange}
                              placeholder="Select user to assign..."
                              disabled={!canAssign}
                              fetchEnabled={canAssign}
                            />
                          </FormControl>

                          {canAssign && (
                            <FormDescription>
                              For managers/admins to assign to sales agents
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Contacts Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Contacts
                    </CardTitle>
                    <CardDescription>
                      Add at least one contact person for this lead
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="relative p-4 border rounded-lg space-y-4"
                  >
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}

                    {watchedContacts?.[index]?.contact_id && (
                      <p className="text-xs text-muted-foreground">
                        Using an existing school contact. Editing this row will
                        create a new additional contact.
                      </p>
                    )}

                    <FormField
                      control={form.control}
                      name={`contacts.${index}.role`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role *</FormLabel>

                          <FormControl>
                            <RadioGroup
                              value={field.value}
                              onValueChange={(value) => {
                                field.onChange(value);
                                clearInheritedContactIfEditing(index);
                              }}
                              className="flex flex-wrap gap-2"
                            >
                              {CONTACT_ROLES.map((role) => (
                                <FormItem key={role} className="space-y-0">
                                  <FormControl>
                                    {/* Hide the actual radio */}
                                    <RadioGroupItem
                                      value={role}
                                      id={`contact-${index}-role-${role}`}
                                      className="sr-only"
                                    />
                                  </FormControl>

                                  {/* This label becomes the pill */}
                                  <Label
                                    htmlFor={`contact-${index}-role-${role}`}
                                    className={cn(
                                      "cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition",
                                      "hover:bg-muted",
                                      field.value === role
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "bg-background text-foreground",
                                    )}
                                  >
                                    {role}
                                  </Label>
                                </FormItem>
                              ))}
                            </RadioGroup>
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`contacts.${index}.first_name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter first name"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  clearInheritedContactIfEditing(index);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`contacts.${index}.last_name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter last name"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  clearInheritedContactIfEditing(index);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`contacts.${index}.email`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="email@example.com"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  clearInheritedContactIfEditing(index);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`contacts.${index}.phone`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="+263..."
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  clearInheritedContactIfEditing(index);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`contacts.${index}.secondary_phone`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Second phone (optional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="+263..."
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => {
                                  field.onChange(e);
                                  clearInheritedContactIfEditing(index);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`contacts.${index}.whatsapp_number`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>WhatsApp Number</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="+263..."
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  clearInheritedContactIfEditing(index);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`contacts.${index}.preferred_contact_method`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Preferred Contact Method *</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                field.onChange(value);
                                clearInheritedContactIfEditing(index);
                              }}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select method" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {PREFERRED_CONTACT_METHODS.map((method) => (
                                  <SelectItem key={method} value={method}>
                                    {method}
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
                        name={`contacts.${index}.is_primary`}
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-8">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={(value) => {
                                  field.onChange(value);
                                  clearInheritedContactIfEditing(index);
                                }}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Primary Contact</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name={`contacts.${index}.notes`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Additional notes about this contact..."
                              className="resize-none"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                clearInheritedContactIfEditing(index);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
                <div className="w-full flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({
                        first_name: "",
                        last_name: "",
                        email: "",
                        phone: "",
                        role: "Teacher",
                        is_primary: false,
                        preferred_contact_method: "Email",
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Contact
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Form Actions */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/leads")}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                <Save className="h-4 w-4 mr-2" />
                {isSubmitting ? "Creating..." : "Create Lead"}
              </Button>
            </div>
          </form>
        </Form>
      </Container>

      {/* DUP3: confirm-to-proceed on a likely duplicate. Graceful, per owner —
          the rep can still create the lead, but must acknowledge first. */}
      <AlertDialog
        open={duplicateConfirmOpen}
        onOpenChange={(open) => {
          setDuplicateConfirmOpen(open);
          if (!open) setPendingValues(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This looks like a duplicate</AlertDialogTitle>
            <AlertDialogDescription>
              This looks like a duplicate of {topDuplicateName}
              {duplicateCandidates.length > 1
                ? ` (and ${duplicateCandidates.length - 1} other likely match${
                    duplicateCandidates.length - 1 > 1 ? "es" : ""
                  })`
                : ""}
              . Are you sure you want to create it anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              Go back
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              onClick={(e) => {
                // Keep the dialog logic in our hands: run the create with the
                // values captured at submit time, then close.
                e.preventDefault();
                const values = pendingValues;
                setDuplicateConfirmOpen(false);
                setPendingValues(null);
                if (values) void doCreate(values);
              }}
            >
              Create anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Thin wrapper that subscribes to the live form values relevant to
 * duplicate detection and pipes them into the banner. Kept at the
 * bottom of the file so the main component stays readable.
 */
function DuplicateBannerBridge({
  form,
  className,
  onCandidatesChange,
}: {
  form: ReturnType<typeof useForm<AddLeadValues>>;
  className?: string;
  onCandidatesChange?: (candidates: DuplicateCandidate[]) => void;
}) {
  const leadName = form.watch("lead.name");
  const schoolId = form.watch("lead.school_id");
  const primaryContact = form.watch("contacts.0");
  const phone = primaryContact?.phone;
  const email = primaryContact?.email;
  return (
    <DuplicateWarningBanner
      kind="lead"
      className={className}
      onCandidatesChange={onCandidatesChange}
      value={{
        lead_name: leadName,
        school_id: schoolId ?? null,
        phone: phone ?? null,
        email: email ?? null,
      }}
    />
  );
}
