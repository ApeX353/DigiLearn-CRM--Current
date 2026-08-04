import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import Modal from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { DateField } from "~/components/ui/date-field";
import {
  useUpdateCampaign,
  CAMPAIGN_TYPES,
  CAMPAIGN_TYPE_LABELS,
} from "~/api/campaigns";
import type { Campaign, CampaignType } from "~/api/campaigns";

interface Props {
  campaign: Campaign;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Edit a campaign — fixes a wrong date/name/type after creation (#16/#17). */
export function CampaignEditDialog({ campaign, open, onOpenChange }: Props) {
  const update = useUpdateCampaign();
  const [name, setName] = useState(campaign.name);
  const [type, setType] = useState<CampaignType>(campaign.type);
  const [startDate, setStartDate] = useState(campaign.start_date?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(campaign.end_date?.slice(0, 10) ?? "");
  const [entryDate, setEntryDate] = useState(campaign.entry_date?.slice(0, 10) ?? "");
  const [currency, setCurrency] = useState(campaign.currency ?? "USD");

  const save = () => {
    if (!name.trim() || !startDate) {
      toast.error("Name and start date are required");
      return;
    }
    update.mutate(
      {
        id: campaign.id,
        dto: {
          name: name.trim(),
          type,
          start_date: startDate,
          end_date: endDate || undefined,
          entry_date: entryDate || undefined,
          currency,
        },
      },
      {
        onSuccess: () => {
          toast.success("Campaign updated");
          onOpenChange(false);
        },
        onError: (e: any) =>
          toast.error(e?.response?.data?.message ?? "Could not update campaign"),
      },
    );
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => !update.isPending && onOpenChange(false)}
      title="Edit campaign"
      description="Fix the name, type, dates or currency."
      size="md"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CampaignType)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CAMPAIGN_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="USD">USD</option>
              <option value="ZWG">ZWG</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DateField label="Start date" required value={startDate} onChange={setStartDate} />
          <DateField label="End date" value={endDate} onChange={setEndDate} min={startDate || undefined} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DateField label="Date of entry" value={entryDate} onChange={setEntryDate} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={update.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
