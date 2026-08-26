import { useState, useMemo } from "react";
import { Label } from "~/components/ui/label";
import { Autocomplete, type AutocompleteOption } from "~/components/ui/autocomplete";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { useLeads } from "~/api/leads";
import { useDeals } from "~/api/deals";
import { cn } from "~/lib/utils";

type EntityType = "lead" | "deal";

interface LeadDealPickerProps {
  leadId?: string;
  dealId?: string;
  onLeadChange: (leadId: string | undefined) => void;
  onDealChange: (dealId: string | undefined) => void;
  error?: string;
  disabled?: boolean;
}

export function LeadDealPicker({
  leadId,
  dealId,
  onLeadChange,
  onDealChange,
  error,
  disabled,
}: LeadDealPickerProps) {
  const [entityType, setEntityType] = useState<EntityType>(
    dealId ? "deal" : "lead"
  );
  const [searchQuery, setSearchQuery] = useState("");

  const { data: leadsData, isLoading: leadsLoading } = useLeads({
    search: searchQuery,
    limit: 20,
    page: 1
  });

  const { data: dealsData, isLoading: dealsLoading } = useDeals({
    search: searchQuery,
    close_status: 'ongoing',
    limit: 20,
    page: 1
  });

  const leadOptions: AutocompleteOption[] = useMemo(() => {
    const leads = leadsData?.data || [];
    return leads.map((lead) => ({
      value: lead.id,
      label: lead.lead_name,
      subtitle: lead.school?.name || lead.source,
    }));
  }, [leadsData]);

  const dealOptions: AutocompleteOption[] = useMemo(() => {
    const deals = dealsData?.data || [];
    return deals.map((deal) => ({
      value: deal.id,
      label: deal.title ?? "Untitled Deal",
      subtitle: deal.school?.name,
    }));
  }, [dealsData]);

  const handleEntityTypeChange = (type: EntityType) => {
    setEntityType(type);
    // Clear the other entity when switching
    if (type === "lead") {
      onDealChange(undefined);
    } else {
      onLeadChange(undefined);
    }
  };

  const handleValueChange = (value: string) => {
    if (entityType === "lead") {
      onLeadChange(value || undefined);
    } else {
      onDealChange(value || undefined);
    }
  };

  const currentValue = entityType === "lead" ? leadId : dealId;
  const options = entityType === "lead" ? leadOptions : dealOptions;
  const isLoading = entityType === "lead" ? leadsLoading : dealsLoading;

  return (
    <div className="space-y-3">
      <Label>
        Related To <span className="text-destructive">*</span>
      </Label>

      <RadioGroup
        value={entityType}
        onValueChange={(v) => handleEntityTypeChange(v as EntityType)}
        className="flex flex-wrap gap-4"
        disabled={disabled}
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="lead" id="entity-lead" />
          <Label htmlFor="entity-lead" className="cursor-pointer font-normal">
            Lead
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="deal" id="entity-deal" />
          <Label htmlFor="entity-deal" className="cursor-pointer font-normal">
            Deal
          </Label>
        </div>
      </RadioGroup>

      <Autocomplete
        value={currentValue}
        onValueChange={handleValueChange}
        options={options}
        placeholder={`Select a ${entityType}...`}
        searchPlaceholder={`Search ${entityType}s...`}
        emptyText={`No active ${entityType}s found. Check filters or create the record first.`}
        isLoading={isLoading}
        disabled={disabled}
        onSearchChange={setSearchQuery}
        searchValue={searchQuery}
        className={cn(error && "border-destructive")}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        This connection controls where the activity appears in timelines,
        dashboard metrics, and manager views.
      </p>
    </div>
  );
}
