import { useState } from "react";
import { DateField } from "~/components/ui/date-field";
import { Link } from "react-router";
import { format } from "date-fns";
import { Megaphone, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import {
  useCampaigns,
  useCreateCampaign,
  CAMPAIGN_TYPES,
  CAMPAIGN_TYPE_LABELS,
  type CampaignType,
} from "~/api/campaigns";
import { useAnyRole } from "~/hooks/use-permission";
import { handleApiError } from "~/api/axios";

export default function CampaignsPage() {
  const { data: campaigns, isLoading } = useCampaigns();
  const createMutation = useCreateCampaign();
  const canCreate = useAnyRole(["admin", "manager", "sales_manager"]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<CampaignType>("CONFERENCE");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currency, setCurrency] = useState("USD");

  const handleCreate = async () => {
    if (!name.trim() || !startDate) {
      toast.error("Name and start date are required");
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        type,
        start_date: startDate,
        end_date: endDate || undefined,
        currency,
      });
      toast.success("Campaign created");
      setOpen(false);
      setName("");
      setStartDate("");
      setEndDate("");
    } catch (error) {
      toast.error("Could not create campaign", {
        description: handleApiError(error),
      });
    }
  };

  return (
    <Container>
      <PageHeader
        title="Campaigns"
        subtitle="Conferences, roadshows and events — track spend, sourced leads, and cost per won deal."
      />
      <div className="mb-4 flex justify-end">
        {canCreate && (
          <Button onClick={() => setOpen(true)} data-testid="new-campaign">
            <Plus className="mr-1.5 h-4 w-4" /> New campaign
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (campaigns ?? []).length === 0 ? (
        <div className="rounded-md border px-4 py-12 text-center text-sm text-muted-foreground">
          <Megaphone className="mx-auto mb-2 h-8 w-8 opacity-40" />
          No campaigns yet. Create one for your next event (e.g. NASH
          congress) and tag leads captured there.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Campaign</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Dates</th>
                <th className="px-3 py-2">Created by</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(campaigns ?? []).map((c) => (
                <tr key={c.id} className="hover:bg-muted/30" data-testid="campaign-row">
                  <td className="px-3 py-2">
                    <Link
                      to={`/campaigns/${c.id}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{CAMPAIGN_TYPE_LABELS[c.type]}</Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {format(new Date(c.start_date), "MMM d, yyyy")}
                    {c.end_date && ` – ${format(new Date(c.end_date), "MMM d, yyyy")}`}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.created_by
                      ? `${c.created_by.first_name} ${c.created_by.last_name}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={(next) => !createMutation.isPending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>
              Costs and sourced leads attach to this campaign for ROI tracking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="NASH Congress 2026"
                data-testid="campaign-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Type</label>
                <select
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value as CampaignType)}
                  data-testid="campaign-type"
                >
                  {CAMPAIGN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CAMPAIGN_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Default currency
                </label>
                <select
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="USD">USD</option>
                  <option value="ZWG">ZWG</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DateField
                label="Start date"
                required
                value={startDate}
                onChange={setStartDate}
                data-testid="campaign-start"
              />
              <DateField
                label="End date"
                value={endDate}
                onChange={setEndDate}
                min={startDate || undefined}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={createMutation.isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={createMutation.isPending} onClick={handleCreate} data-testid="campaign-create">
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
