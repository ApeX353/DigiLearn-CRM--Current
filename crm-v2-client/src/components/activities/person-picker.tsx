import { useLead, useLeadStakeholders } from "~/api/leads";
import type { Contact } from "~/api/contacts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Checkbox } from "~/components/ui/checkbox";
import { Badge } from "~/components/ui/badge";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import { User, Loader2 } from "lucide-react";

interface PersonPickerBaseProps {
  leadId?: string;
  dealId?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

interface SingleModeProps extends PersonPickerBaseProps {
  mode?: "single";
  label?: string;
  value?: string;
  onChange: (contactId: string | undefined, contact?: Contact) => void;
  values?: never;
  onMultiChange?: never;
}

interface MultiModeProps extends PersonPickerBaseProps {
  mode: "multi";
  label?: string;
  values: string[];
  onMultiChange: (contactIds: string[], contacts: Contact[]) => void;
  value?: never;
  onChange?: never;
}

type PersonPickerProps = SingleModeProps | MultiModeProps;

export function PersonPicker(props: PersonPickerProps) {
  const {
    leadId,
    dealId,
    error,
    disabled,
    required,
    label,
  } = props;

  const { data: stakeholdersResponse, isLoading } = useLeadStakeholders(
    leadId || ""
  );
  const { data: leadResponse, isLoading: isLeadLoading } = useLead(
    leadId || "",
  );

  const directStakeholders = stakeholdersResponse?.data || [];
  const primaryContact = leadResponse?.data?.primary_contact;
  const stakeholders =
    directStakeholders.length > 0
      ? directStakeholders
      : primaryContact
        ? [
            {
              id: `primary-${primaryContact.id}`,
              contact_id: primaryContact.id,
              contact: primaryContact,
              role: primaryContact.role ?? "Other",
              decision_role: "decision_maker",
              is_primary: true,
            },
          ]
        : [];

  const displayLabel = label || "Person Contacted";

  if (!leadId && !dealId) {
    return (
      <div>
        <Label className="text-muted-foreground">
          {displayLabel} {required && <span className="text-destructive">*</span>}
        </Label>
        <p className="text-sm text-muted-foreground mt-1">
          Select a lead or deal first to see available contacts
        </p>
      </div>
    );
  }

  if (isLoading || isLeadLoading) {
    return (
      <div>
        <Label>
          {displayLabel} {required && <span className="text-destructive">*</span>}
        </Label>
        <div className="flex items-center gap-2 h-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading contacts...</span>
        </div>
      </div>
    );
  }

  if (stakeholders.length === 0) {
    return (
      <div>
        <Label className="text-muted-foreground">
          {displayLabel} {required && <span className="text-destructive">*</span>}
        </Label>
        <p className="text-sm text-muted-foreground mt-1">
          No stakeholders found for this lead. Add contacts before logging
          contact-specific calls, emails, meetings, or WhatsApp activity.
        </p>
      </div>
    );
  }

  // Multi-select checkbox mode
  if (props.mode === "multi") {
    const { values, onMultiChange } = props;

    const handleToggle = (contactId: string) => {
      const stakeholder = stakeholders.find((s) => s.contact_id === contactId);
      const contact = stakeholder?.contact;
      if (!contact) return;

      let newIds: string[];
      if (values.includes(contactId)) {
        newIds = values.filter((id) => id !== contactId);
      } else {
        newIds = [...values, contactId];
      }

      const newContacts = newIds
        .map((id) => stakeholders.find((s) => s.contact_id === id)?.contact)
        .filter((c): c is Contact => !!c);

      onMultiChange(newIds, newContacts);
    };

    return (
      <div>
        <Label>
          {displayLabel} {required && <span className="text-destructive">*</span>}
        </Label>
        <div className={cn(
          "mt-1 space-y-2 rounded-md border p-3",
          error && "border-destructive",
        )}>
          {stakeholders.map((stakeholder) => {
            const contact = stakeholder.contact;
            if (!contact) return null;
            const fullName = `${contact.first_name} ${contact.last_name}`;

            return (
              <label
                key={stakeholder.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 cursor-pointer",
                  disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                <Checkbox
                  checked={values.includes(stakeholder.contact_id)}
                  onCheckedChange={() => handleToggle(stakeholder.contact_id)}
                  disabled={disabled}
                />
                <span className="text-sm">{fullName}</span>
                {contact.email && (
                  <span className="text-xs text-muted-foreground">
                    {contact.email}
                  </span>
                )}
                {contact.role && (
                  <Badge variant="secondary" className="text-xs">
                    {contact.role}
                  </Badge>
                )}
                {stakeholder.is_primary && (
                  <Badge variant="outline" className="text-xs">
                    Primary
                  </Badge>
                )}
              </label>
            );
          })}
        </div>
        {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      </div>
    );
  }

  // Single-select mode (default)
  const { value, onChange } = props;

  return (
    <div>
      <Label>
        {displayLabel} {required && <span className="text-destructive">*</span>}
      </Label>
      <Select
        value={value || ""}
        onValueChange={(v) => {
          const stakeholder = stakeholders.find((s) => s.contact_id === v);
          onChange(v || undefined, stakeholder?.contact);
        }}
        disabled={disabled}
      >
        <SelectTrigger className={cn('w-full', error && "border-destructive")}>
          <SelectValue placeholder="Select person contacted">
            {value && stakeholders.find((s) => s.contact_id === value) && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>
                  {stakeholders.find((s) => s.contact_id === value)?.contact
                    ?.first_name}{" "}
                  {stakeholders.find((s) => s.contact_id === value)?.contact
                    ?.last_name}
                </span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {stakeholders.map((stakeholder) => (
            <SelectItem key={stakeholder.id} value={stakeholder.contact_id}>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <div className="flex flex-col">
                  <span>
                    {stakeholder.contact?.first_name}{" "}
                    {stakeholder.contact?.last_name}
                    {stakeholder.is_primary && (
                      <span className="ml-1 text-xs text-primary">(Primary)</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {stakeholder.role} &bull; {stakeholder.decision_role.replace("_", " ")}
                  </span>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
}
