import { useState } from "react";
import { toast } from "sonner";
import { useParams, Link, useNavigate } from "react-router";
import { format } from "date-fns";
import {
  ArrowLeft,
  Loader2,
  TrendingUp,
  Upload,
  Pencil,
  Trash2,
} from "lucide-react";
import { ImportLeadsDialog } from "~/components/leads/import-leads-dialog";
import { CampaignEditDialog } from "~/components/campaigns/campaign-edit-dialog";
import Container from "~/components/container";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card";
import {
  useCampaign,
  useCampaignLeads,
  useCampaignRoi,
  useDeleteCampaign,
  CAMPAIGN_TYPE_LABELS,
} from "~/api/campaigns";
import { DealCostsSection } from "~/components/deals/deal-costs-section";
import { useAnyRole } from "~/hooks/use-permission";

const money = (amount: string | number, currency: string) =>
  `${currency} ${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function CampaignDetailPage() {
  // The URL param is the human slug (falls back to the raw UUID for older
  // links). The detail endpoint resolves either; sub-resource endpoints
  // (leads/roi) still take the UUID, so we key those off the resolved id.
  const { id: idOrSlug = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: campaign, isLoading } = useCampaign(idOrSlug);
  const campaignId = campaign?.id ?? "";
  const { data: leads } = useCampaignLeads(campaignId);
  const canSeeRoi = useAnyRole([
    "admin",
    "admin_support",
    "manager",
    "sales_manager",
    "finance",
  ]);
  const canImport = useAnyRole(["admin", "admin_support", "sales_manager"]);
  const { data: roi } = useCampaignRoi(canSeeRoi ? campaignId : "");
  const deleteCampaign = useDeleteCampaign();
  const [importOpen, setImportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const onDelete = () => {
    if (!campaign) return;
    if (
      !window.confirm(
        `Delete campaign "${campaign.name}"? This cannot be undone. (Blocked if leads or requisitions are still attached.)`,
      )
    )
      return;
    deleteCampaign.mutate(campaign.id, {
      onSuccess: () => {
        toast.success("Campaign deleted");
        navigate("/campaigns");
      },
      onError: (e: any) =>
        toast.error(e?.response?.data?.message ?? "Could not delete campaign"),
    });
  };

  if (isLoading || !campaign) {
    return (
      <Container>
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>
        {canImport && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              data-testid="campaign-edit"
            >
              <Pencil className="mr-1.5 h-4 w-4" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={deleteCampaign.isPending}
              data-testid="campaign-delete"
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          </div>
        )}
      </div>

      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold" data-testid="campaign-title">
            {campaign.name}
          </h1>
          <Badge variant="outline">{CAMPAIGN_TYPE_LABELS[campaign.type]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {format(new Date(campaign.start_date), "dd/MM/yyyy")}
          {campaign.end_date &&
            ` – ${format(new Date(campaign.end_date), "dd/MM/yyyy")}`}
          {campaign.entry_date &&
            ` · entered ${format(new Date(campaign.entry_date), "dd/MM/yyyy")}`}
          {" · created by "}
          {campaign.created_by
            ? `${campaign.created_by.first_name} ${campaign.created_by.last_name}`
            : "—"}
        </p>
      </div>

      <div className="space-y-4">
        {/* ROI (managers/finance) */}
        {canSeeRoi && roi && (
          <Card data-testid="campaign-roi">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" /> Campaign ROI
              </CardTitle>
              <CardDescription>
                {roi.leads_sourced} lead{roi.leads_sourced === 1 ? "" : "s"} sourced ·{" "}
                {roi.won_deals} won deal{roi.won_deals === 1 ? "" : "s"}. Cost per
                lead/deal uses committed spend (paid + in approval), split evenly
                across sourced leads.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {roi.per_currency.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No campaign spend recorded yet — raise a requisition below.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {roi.per_currency.map((row) => (
                    <div
                      key={row.currency}
                      className="rounded-md border p-3"
                      data-testid={`roi-${row.currency}`}
                    >
                      <div className="text-xs font-semibold uppercase text-muted-foreground">
                        {row.currency}
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-y-1 text-sm">
                        <span className="text-muted-foreground">Spend (committed)</span>
                        <span className="text-right font-medium">
                          {money(row.spend_committed, row.currency)}
                        </span>
                        <span className="text-muted-foreground">Spend (paid)</span>
                        <span className="text-right">{money(row.spend_paid, row.currency)}</span>
                        <span className="text-muted-foreground">Cost / lead</span>
                        <span className="text-right">
                          {row.cost_per_lead !== null
                            ? money(row.cost_per_lead, row.currency)
                            : "no leads sourced yet"}
                        </span>
                        <span className="text-muted-foreground">Cost / won deal</span>
                        <span className="text-right">
                          {row.cost_per_won_deal !== null
                            ? money(row.cost_per_won_deal, row.currency)
                            : "no won deals yet"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {roi.won_deal_costs.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">
                    True cost per won deal
                  </h4>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Even-split share of campaign spend (spend ÷ {roi.leads_sourced}{" "}
                    sourced lead{roi.leads_sourced === 1 ? "" : "s"}) plus the deal's
                    own direct costs.
                  </p>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Deal</th>
                          <th className="px-3 py-2">Currency</th>
                          <th className="px-3 py-2 text-right">Campaign share</th>
                          <th className="px-3 py-2 text-right">Direct costs</th>
                          <th className="px-3 py-2 text-right">True cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {roi.won_deal_costs.map((d) => (
                          <tr key={`${d.deal_id}-${d.currency}`}>
                            <td className="px-3 py-2">
                              <Link
                                to={`/deals/${d.deal_id}`}
                                className="text-primary underline-offset-2 hover:underline"
                              >
                                {d.title}
                              </Link>
                            </td>
                            <td className="px-3 py-2">{d.currency}</td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {money(d.campaign_share, d.currency)}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {money(d.direct_cost, d.currency)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                              {money(d.true_cost, d.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Campaign-level costs — same requisition panel, campaign linkage */}
        <DealCostsSection campaignId={campaign.id} />

        {/* Sourced leads */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base">
                Sourced leads ({(leads ?? []).length})
              </CardTitle>
              <CardDescription>
                Leads tagged with this campaign at capture. The tag follows the
                lead into any deal it converts to.
              </CardDescription>
            </div>
            {canImport && (
              <Button
                size="sm"
                onClick={() => setImportOpen(true)}
                data-testid="campaign-import-leads"
              >
                <Upload className="mr-1.5 h-4 w-4" /> Import Leads
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {(leads ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No leads sourced yet. Use <strong>Import Leads</strong> above to
                bring in a spreadsheet from this campaign — the rows go to the
                Approval Queue, and approved leads appear here.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Lead</th>
                      <th className="px-3 py-2">School</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Captured</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(leads ?? []).map((l) => (
                      <tr key={l.id} data-testid="campaign-lead-row">
                        <td className="px-3 py-2">
                          <Link
                            to={`/leads/${l.id}`}
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {l.lead_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{l.school?.name ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline">{l.status}</Badge>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {format(new Date(l.created_at), "dd/MM/yyyy")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ImportLeadsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        campaignId={campaign.id}
        campaignName={campaign.name}
      />
      <CampaignEditDialog
        campaign={campaign}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </Container>
  );
}
