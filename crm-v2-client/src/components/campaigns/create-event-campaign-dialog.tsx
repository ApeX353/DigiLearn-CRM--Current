import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { DateField } from "~/components/ui/date-field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "~/components/ui/dialog";
import { useCreateCampaign, CAMPAIGN_TYPES, CAMPAIGN_TYPE_LABELS, type Campaign, type CampaignType } from "~/api/campaigns";
import { EVENT_CATEGORY_LABELS, type EventCategory } from "~/api/campaigns/event-categories";
import { handleApiError } from "~/api/axios";

export function CreateEventCampaignDialog({ category, customName, onClose, onCreated }: {
  category: EventCategory; customName?: string;
  onClose: () => void; onCreated: (campaign: Campaign) => void;
}) {
  const create = useCreateCampaign();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState<CampaignType>("OTHER");
  const [currency, setCurrency] = useState("USD");
  const [entry, setEntry] = useState(format(new Date(), "yyyy-MM-dd"));
  const save = async () => {
    if (!name.trim() || !start || (end && end < start)) {
      toast.error("Enter a campaign name and valid event dates"); return;
    }
    try {
      const campaign = await create.mutateAsync({
        name: name.trim(), type, start_date: start, end_date: end || start,
        entry_date: entry || undefined, currency, event_category: category,
        custom_event_name: category === "CUSTOM" ? customName?.trim() : null,
      });
      onCreated(campaign); onClose(); toast.success("Campaign created and selected");
    } catch (error) { toast.error(handleApiError(error)); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !create.isPending) onClose(); }}>
    <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>New event campaign</DialogTitle>
        <DialogDescription>{category === "CUSTOM" ? customName : EVENT_CATEGORY_LABELS[category]} — create the specific event occurrence. Costs and leads will link here.</DialogDescription>
      </DialogHeader>
      <label htmlFor="event-campaign-name">Campaign name *</label>
      <Input id="event-campaign-name" maxLength={200} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. NASH Congress 2026" />
      <label htmlFor="event-campaign-type">Campaign type</label>
      <select id="event-campaign-type" className="h-9 rounded-md border bg-background px-2" value={type} onChange={e => setType(e.target.value as CampaignType)}>
        {CAMPAIGN_TYPES.map(t => <option key={t} value={t}>{CAMPAIGN_TYPE_LABELS[t]}</option>)}
      </select>
      <DateField label="Event start date" required value={start} onChange={setStart} />
      <DateField label="Event end date (blank means same day)" value={end} onChange={setEnd} min={start || undefined} />
      <DateField label="Date of entry" value={entry} onChange={setEntry} />
      <label htmlFor="event-campaign-currency">Currency</label>
      <select id="event-campaign-currency" className="h-9 rounded-md border bg-background px-2" value={currency} onChange={e => setCurrency(e.target.value)}>
        <option value="USD">USD</option><option value="ZWG">ZWG</option>
      </select>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={create.isPending} onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={create.isPending} onClick={save}>{create.isPending ? "Saving..." : "Create campaign"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
