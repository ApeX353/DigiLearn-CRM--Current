import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  User,
  Phone,
  Mail,
  MessageSquare,
  Star,
  Plus,
  AlertTriangle,
  CheckCircle,
  UserCheck,
  MoreVertical,
  Pencil,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { handleApiError } from "~/api/axios";
import {
  CONTACT_ROLES,
  PREFERRED_CONTACT_METHODS,
  type ContactRole,
  type PreferredContactMethod,
} from "~/api/contacts";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Alert, AlertDescription } from "~/components/ui/alert";
import Modal from "~/components/ui/modal";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { Textarea } from "~/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  DECISION_ROLES,
  INFLUENCE_LEVELS,
  useCreateLeadStakeholder,
  useUpdateLeadStakeholder,
  useLeadStakeholders,
} from "~/api/leads";
import { checkStakeholderCoverage } from "~/lib/lead-helpers";
import type { Lead, LeadStakeholder } from "~/api/leads";
import type { DecisionRole, InfluenceLevel } from "~/api/leads";
import { cn } from "~/lib/utils";

interface LeadPeopleTabProps {
  lead: Lead;
}

const coverageRoles: Array<{
  role: ContactRole;
  key:
    | "hasHead"
    | "hasBursar"
    | "hasSDCChair"
    | "hasICT"
    | "hasTeacher"
    | "hasProcurement";
  required?: boolean;
}> = [
  { role: "Head", key: "hasHead", required: true },
  { role: "Bursar", key: "hasBursar", required: true },
  { role: "SDC Chair", key: "hasSDCChair" },
  { role: "ICT Coordinator", key: "hasICT" },
  { role: "Teacher", key: "hasTeacher" },
  { role: "Procurement", key: "hasProcurement" },
];

const roleColors: Partial<Record<ContactRole, string>> = {
  Head: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Bursar: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "SDC Chair":
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "ICT Coordinator":
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  Teacher:
    "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Procurement:
    "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
};

const preferredChannelLabels: Record<PreferredContactMethod, string> = {
  Email: "Email",
  Phone: "Call",
  WhatsApp: "WhatsApp",
  SMS: "SMS",
};

const preferredChannelIcons: Record<
  PreferredContactMethod,
  React.ComponentType<{ className?: string }>
> = {
  Email: Mail,
  Phone: Phone,
  WhatsApp: MessageSquare,
  SMS: MessageSquare,
};

const formatDecisionRole = (role?: DecisionRole) => {
  if (!role) return null;
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const formatInfluence = (level?: InfluenceLevel) => {
  if (!level) return null;
  return level.charAt(0).toUpperCase() + level.slice(1);
};

const buildFullName = (stakeholder: LeadStakeholder) => {
  const first = stakeholder.contact?.first_name;
  const last = stakeholder.contact?.last_name;
  if (first || last) return `${first ?? ""} ${last ?? ""}`.trim();
  return "Unknown Contact";
};

const addStakeholderSchema = z.object({
  first_name: z.string().min(2, "First name is required"),
  last_name: z.string().min(2, "Last name is required"),
  email: z.string().email("Invalid email address").or(z.literal("")),
  phone: z.string(),
  secondary_phone: z.string(),
  whatsapp_number: z.string(),
  role: z.enum(CONTACT_ROLES),
  preferred_contact_method: z.enum(PREFERRED_CONTACT_METHODS),
  decision_role: z.enum(DECISION_ROLES),
  influence_level: z.enum(INFLUENCE_LEVELS),
  is_primary: z.boolean(),
  notes: z.string(),
});

type AddStakeholderFormValues = z.infer<typeof addStakeholderSchema>;

const addStakeholderDefaults: AddStakeholderFormValues = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  secondary_phone: "",
  whatsapp_number: "",
  role: "Teacher",
  preferred_contact_method: "Email",
  decision_role: "influencer",
  influence_level: "medium",
  is_primary: false,
  notes: "",
};

export function PeopleTab({ lead }: LeadPeopleTabProps) {
  const { data: stakeholdersResponse, isLoading } = useLeadStakeholders(lead.id);
  const createStakeholder = useCreateLeadStakeholder(lead.id);
  const updateStakeholder = useUpdateLeadStakeholder(lead.id);
  // When set, the dialog is editing this stakeholder rather than adding one.
  const [editingStakeholder, setEditingStakeholder] =
    useState<LeadStakeholder | null>(null);
  const stakeholders = stakeholdersResponse?.data || [];
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const addStakeholderForm = useForm<AddStakeholderFormValues>({
    resolver: zodResolver(addStakeholderSchema),
    defaultValues: addStakeholderDefaults,
  });

  const coverage = useMemo(
    () => (stakeholders.length ? checkStakeholderCoverage(stakeholders) : null),
    [stakeholders],
  );

  const closeAddModal = () => {
    if (createStakeholder.isPending || updateStakeholder.isPending) return;
    setIsAddModalOpen(false);
    setEditingStakeholder(null);
    addStakeholderForm.reset(addStakeholderDefaults);
  };

  const handleAdd = () => {
    setIsAddModalOpen(true);
  };

  const handleCreateStakeholder = async (values: AddStakeholderFormValues) => {
    try {
      await createStakeholder.mutateAsync({
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
        secondary_phone: values.secondary_phone.trim() || undefined,
        whatsapp_number: values.whatsapp_number.trim() || undefined,
        role: values.role,
        preferred_contact_method: values.preferred_contact_method,
        decision_role: values.decision_role,
        influence_level: values.influence_level,
        is_primary: values.is_primary,
        notes: values.notes.trim() || undefined,
      });
      toast.success("Stakeholder added successfully.");
      closeAddModal();
    } catch (error) {
      toast.error(handleApiError(error));
    }
  };

  const handleSetPrimary = async (stakeholder: LeadStakeholder) => {
    try {
      await updateStakeholder.mutateAsync({
        stakeholderId: stakeholder.id,
        data: { is_primary: true },
      });
      toast.success(`${buildFullName(stakeholder)} is now the primary contact.`);
    } catch (error) {
      toast.error(handleApiError(error));
    }
  };

  const handleArchive = () => {
    toast.info("Removing stakeholders is not available yet.");
  };

  // Reuse the add dialog: same fields, prefilled, submitting a PATCH.
  const handleEdit = (stakeholder: LeadStakeholder) => {
    addStakeholderForm.reset({
      first_name: stakeholder.contact?.first_name ?? "",
      last_name: stakeholder.contact?.last_name ?? "",
      email: stakeholder.contact?.email ?? "",
      phone: stakeholder.contact?.phone ?? "",
      secondary_phone: stakeholder.contact?.secondary_phone ?? "",
      whatsapp_number: stakeholder.contact?.whatsapp_number ?? "",
      role: (stakeholder.role ??
        stakeholder.contact?.role ??
        "Teacher") as AddStakeholderFormValues["role"],
      preferred_contact_method: (stakeholder.contact
        ?.preferred_contact_method ??
        "Email") as AddStakeholderFormValues["preferred_contact_method"],
      decision_role: (stakeholder.decision_role ??
        "influencer") as AddStakeholderFormValues["decision_role"],
      influence_level: (stakeholder.influence_level ??
        "medium") as AddStakeholderFormValues["influence_level"],
      is_primary: !!stakeholder.is_primary,
      notes: stakeholder.notes ?? "",
    });
    setEditingStakeholder(stakeholder);
    setIsAddModalOpen(true);
  };

  const handleSaveStakeholder = async (values: AddStakeholderFormValues) => {
    if (!editingStakeholder) {
      await handleCreateStakeholder(values);
      return;
    }
    try {
      await updateStakeholder.mutateAsync({
        stakeholderId: editingStakeholder.id,
        data: {
          first_name: values.first_name.trim(),
          last_name: values.last_name.trim(),
          email: values.email.trim() || undefined,
          phone: values.phone.trim() || undefined,
          secondary_phone: values.secondary_phone.trim() || undefined,
          whatsapp_number: values.whatsapp_number.trim() || undefined,
          role: values.role,
          preferred_contact_method: values.preferred_contact_method,
          decision_role: values.decision_role,
          influence_level: values.influence_level,
          is_primary: values.is_primary,
          notes: values.notes.trim() || undefined,
        },
      });
      toast.success("Stakeholder updated.");
      closeAddModal();
    } catch (error) {
      toast.error(handleApiError(error));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      {/* Left Sidebar: Coverage Chips */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Role Coverage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {coverageRoles.map(({ role, key, required }) => {
              const hasRole = coverage?.[key];

              return (
                <div
                  key={role}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-md",
                    hasRole
                      ? "bg-green-100 dark:bg-green-900/30"
                      : required
                        ? "bg-red-100 dark:bg-red-900/30"
                        : "bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "text-sm font-medium",
                      hasRole
                        ? "text-green-800 dark:text-green-200"
                        : required
                          ? "text-red-800 dark:text-red-200"
                          : "text-muted-foreground",
                    )}
                  >
                    {role}
                  </span>
                  {hasRole ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : required ? (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Qualification Gate Warning */}
        {coverage && !coverage.isQualified && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Cannot qualify:</strong> Need Head or Bursar (Approver) +
              at least one other role (ICT, Teacher, etc.)
            </AlertDescription>
          </Alert>
        )}

        {coverage?.isQualified && (
          <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm text-green-800 dark:text-green-200">
              Stakeholder coverage complete
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Right: Stakeholder Cards */}
      <div className="lg:col-span-3 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">
            Stakeholders ({stakeholders.length})
          </h3>
          <Button onClick={handleAdd} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Stakeholder
          </Button>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : stakeholders.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {stakeholders.map((stakeholder) => (
              <StakeholderCard
                key={stakeholder.id}
                stakeholder={stakeholder}
                onSetPrimary={() => handleSetPrimary(stakeholder)}
                onArchive={handleArchive}
                onEdit={() => handleEdit(stakeholder)}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No stakeholders added yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleAdd}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add First Stakeholder
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Modal
        isOpen={isAddModalOpen}
        onClose={closeAddModal}
        title={editingStakeholder ? "Edit Stakeholder" : "Add Stakeholder"}
        description={
          editingStakeholder
            ? `Update ${buildFullName(editingStakeholder)} on ${lead.lead_name}`
            : `Create a stakeholder for ${lead.lead_name}`
        }
      >
        <Form {...addStakeholderForm}>
          <form
            className="space-y-4"
            onSubmit={addStakeholderForm.handleSubmit(handleSaveStakeholder)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={addStakeholderForm.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="First name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addStakeholderForm.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Last name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={addStakeholderForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CONTACT_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addStakeholderForm.control}
                name="decision_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Decision Role *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select decision role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DECISION_ROLES.map((decisionRole) => (
                          <SelectItem key={decisionRole} value={decisionRole}>
                            {formatDecisionRole(decisionRole) || decisionRole}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={addStakeholderForm.control}
                name="influence_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Influence Level *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select influence level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INFLUENCE_LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {formatInfluence(level) || level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addStakeholderForm.control}
                name="preferred_contact_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred Contact Method *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select contact method" />
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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={addStakeholderForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="name@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addStakeholderForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+263..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={addStakeholderForm.control}
              name="secondary_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Second phone (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="+263..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={addStakeholderForm.control}
              name="whatsapp_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp Number</FormLabel>
                  <FormControl>
                    <Input placeholder="+263..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={addStakeholderForm.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add context about this stakeholder..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={addStakeholderForm.control}
              name="is_primary"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(value) => field.onChange(value === true)}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Set as primary stakeholder</FormLabel>
                    <FormDescription>
                      This updates the lead&apos;s primary contact.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeAddModal}
                disabled={createStakeholder.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createStakeholder.isPending}>
                {createStakeholder.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Stakeholder
              </Button>
            </div>
          </form>
        </Form>
      </Modal>

    </div>
  );
}

interface StakeholderCardProps {
  stakeholder: LeadStakeholder;
  onSetPrimary: () => void;
  onArchive: () => void;
  onEdit: () => void;
}

function StakeholderCard({
  stakeholder,
  onSetPrimary,
  onArchive,
  onEdit,
}: StakeholderCardProps) {
  const preferredMethod = stakeholder.contact?.preferred_contact_method;
  const ChannelIcon = preferredMethod
    ? preferredChannelIcons[preferredMethod]
    : null;

  const decisionRole = formatDecisionRole(stakeholder.decision_role);
  const influenceLabel = formatInfluence(stakeholder.influence_level);

  return (
    <Card className={stakeholder.is_primary ? "ring-2 ring-primary" : ""}>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-muted">
              <User className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {buildFullName(stakeholder)}
                </span>
                {stakeholder.is_primary && (
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                )}
              </div>
              {decisionRole && (
                <Badge variant="outline" className="text-xs mt-0.5">
                  {decisionRole}
                </Badge>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              {!stakeholder.is_primary && (
                <DropdownMenuItem onClick={onSetPrimary}>
                  <Star className="h-4 w-4 mr-2" />
                  Make Primary
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onArchive} className="text-destructive">
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Roles */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge
            className={
              roleColors[stakeholder.role] || "bg-muted text-muted-foreground"
            }
          >
            {stakeholder.role}
          </Badge>
        </div>

        {/* Contact Info */}
        <div className="space-y-1.5 text-sm">
          {stakeholder.contact?.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <a
                href={`tel:${stakeholder.contact.phone}`}
                className="hover:text-primary"
              >
                {stakeholder.contact.phone}
              </a>
            </div>
          )}
          {stakeholder.contact?.secondary_phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <a
                href={`tel:${stakeholder.contact.secondary_phone}`}
                className="hover:text-primary"
              >
                {stakeholder.contact.secondary_phone}
              </a>
            </div>
          )}
          {stakeholder.contact?.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <a
                href={`mailto:${stakeholder.contact.email}`}
                className="hover:text-primary"
              >
                {stakeholder.contact.email}
              </a>
            </div>
          )}
          {stakeholder.contact?.whatsapp_number && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              <a
                href={`https://wa.me/${stakeholder.contact.whatsapp_number.replace(
                  /[^0-9]/g,
                  "",
                )}`}
                className="hover:text-primary"
                target="_blank"
                rel="noreferrer"
              >
                {stakeholder.contact.whatsapp_number}
              </a>
            </div>
          )}
        </div>

        {/* Bottom Row: Channel + Influence */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex items-center gap-2">
            {ChannelIcon && preferredMethod && (
              <Badge variant="secondary" className="text-xs">
                <ChannelIcon className="h-3 w-3 mr-1" />
                {preferredChannelLabels[preferredMethod]}
              </Badge>
            )}
            {influenceLabel && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  influenceLabel === "High" &&
                    "border-green-500 text-green-600",
                  influenceLabel === "Medium" &&
                    "border-amber-500 text-amber-600",
                )}
              >
                {influenceLabel} influence
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
