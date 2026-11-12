import { useMemo, useState } from "react";
import { Plus, Trash2, Send, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import {
  useCashRequisitions,
  useEntityCostSummary,
  useCreateCashRequisition,
  useSubmitCashRequisition,
} from "~/api/cash-requisitions";
import {
  REQUISITION_CATEGORIES,
  REQUISITION_CURRENCIES,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type CashRequisition,
  type CreateLineItemDto,
  type RequisitionCategory,
  type RequisitionCurrency,
  type RequisitionStatus,
  type RequisitionType,
} from "~/api/cash-requisitions";
import { handleApiError } from "~/api/axios";

const STATUS_BADGE: Record<RequisitionStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground border",
  SUBMITTED: "bg-amber-50 text-amber-700 border border-amber-200",
  MANAGER_APPROVED: "bg-blue-50 text-blue-700 border border-blue-200",
  FINANCE_APPROVED: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  PAID: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border border-red-200",
};

const money = (amount: string | number, currency: string) =>
  `${currency} ${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

interface DraftItem extends CreateLineItemDto {
  key: number;
}

const emptyItem = (key: number): DraftItem => ({
  key,
  category: "FUEL",
  description: "",
  amount: 0,
});

/**
 * Costs panel for a deal, a lead, OR a campaign — pass exactly one id.
 * The same requisition model backs all three; only the linkage column
 * differs. After a lead converts, its requisitions gain deal_id
 * (carry-over in deals.service.create) and appear on the deal's panel
 * too. Campaign costs stay on the campaign — they are shared event
 * spend, never attached to any single lead/deal.
 */
export function DealCostsSection({
  dealId,
  leadId,
  campaignId,
  readOnly = false,
}: {
  dealId?: string;
  leadId?: string;
  campaignId?: string;
  readOnly?: boolean;
}) {
  const { data: summary } = useEntityCostSummary({ dealId, leadId, campaignId });
  const { data: listData, isLoading } = useCashRequisitions({
    ...(dealId
      ? { deal_id: dealId }
      : leadId
        ? { lead_id: leadId }
        : { campaign_id: campaignId }),
    limit: 50,
  });
  const createMutation = useCreateCashRequisition();
  const submitMutation = useSubmitCashRequisition();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RequisitionType>("PRE_APPROVAL");
  const [currency, setCurrency] = useState<RequisitionCurrency>("USD");
  const [reason, setReason] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyItem(0)]);

  const requisitions = listData?.data ?? [];

  const draftTotal = useMemo(
    () => items.reduce((acc, i) => acc + (Number(i.amount) || 0), 0),
    [items],
  );

  const resetForm = () => {
    setType("PRE_APPROVAL");
    setCurrency("USD");
    setReason("");
    setItems([emptyItem(0)]);
  };

  const setItem = (key: number, patch: Partial<DraftItem>) =>
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    );

  const validate = (): string | null => {
    if (!reason.trim()) return "Reason is required";
    if (items.length === 0) return "Add at least one line item";
    for (const i of items) {
      if (!i.description.trim()) return "Every line item needs a description";
      if (!(Number(i.amount) > 0)) return "Every line item needs an amount > 0";
    }
    return null;
  };

  const handleCreate = async (thenSubmit: boolean) => {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        type,
        ...(dealId
          ? { deal_id: dealId }
          : leadId
            ? { lead_id: leadId }
            : { campaign_id: campaignId }),
        currency,
        reason: reason.trim(),
        line_items: items.map(({ category, description, amount }) => ({
          category,
          description: description.trim(),
          amount: Number(amount),
        })),
      });
      if (thenSubmit) {
        await submitMutation.mutateAsync(created.id);
        toast.success("Requisition submitted for approval");
      } else {
        toast.success("Requisition saved as draft");
      }
      setOpen(false);
      resetForm();
    } catch (error) {
      toast.error("Could not save requisition", {
        description: handleApiError(error),
      });
    }
  };

  const handleSubmitExisting = async (req: CashRequisition) => {
    try {
      await submitMutation.mutateAsync(req.id);
      toast.success("Requisition submitted for approval");
    } catch (error) {
      toast.error("Could not submit requisition", {
        description: handleApiError(error),
      });
    }
  };

  const busy = createMutation.isPending || submitMutation.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />{" "}
            {dealId ? "Deal costs" : leadId ? "Lead costs" : "Campaign costs"}
          </CardTitle>
          <CardDescription>
            Cash requisitions raised against this{" "}
            {dealId ? "deal" : leadId ? "lead" : "campaign"}. Totals are kept
            per-currency — USD and ZWG are never combined.
            {leadId &&
              " When this lead converts, its costs follow the new deal."}
            {campaignId &&
              " Stand fees, travel and other shared event spend live here — not on any single lead."}
          </CardDescription>
        </div>
        {!readOnly && (
          <Button size="sm" onClick={() => setOpen(true)} data-testid="new-requisition">
            <Plus className="mr-1.5 h-4 w-4" /> New requisition
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Per-currency rollup */}
        <div className="grid gap-3 sm:grid-cols-2">
          {(summary ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              No committed costs yet (drafts and rejections don't count).
            </p>
          ) : (
            (summary ?? []).map((row) => (
              <div
                key={row.currency}
                className="rounded-md border bg-muted/30 px-4 py-3"
                data-testid={`cost-summary-${row.currency}`}
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {row.currency}
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {money(row.total, row.currency)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  In approval {money(row.in_approval, row.currency)} · Paid{" "}
                  {money(row.paid, row.currency)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Requisition list */}
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : requisitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No requisitions yet. Raise one before travelling (pre-approval) or
            claim back money already spent (reimbursement).
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Raised</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Items</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {requisitions.map((req) => (
                  <tr key={req.id} data-testid="requisition-row">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {format(new Date(req.created_at), "MMM d, yyyy")}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {req.type === "PRE_APPROVAL" ? "Pre-approval" : "Reimbursement"}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2" title={req.reason}>
                      {req.reason}
                    </td>
                    <td className="px-3 py-2">{req.line_items?.length ?? 0}</td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {money(req.total_amount, req.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={STATUS_BADGE[req.status]}
                        title={
                          req.status === "REJECTED" && req.rejection_reason
                            ? `Rejected (${req.rejected_stage}): ${req.rejection_reason}`
                            : undefined
                        }
                      >
                        {STATUS_LABELS[req.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {req.status === "DRAFT" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => handleSubmitExisting(req)}
                          data-testid="submit-requisition"
                        >
                          <Send className="mr-1 h-3.5 w-3.5" /> Submit
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New cash requisition</DialogTitle>
            <DialogDescription>
              Itemise what the money is for. Submitting sends it to your
              manager, then finance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Type</span>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2"
                  value={type}
                  onChange={(e) => setType(e.target.value as RequisitionType)}
                  data-testid="req-type"
                >
                  <option value="PRE_APPROVAL">Pre-approval (before spending)</option>
                  <option value="REIMBURSEMENT">Reimbursement (already spent)</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Currency</span>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2"
                  value={currency}
                  onChange={(e) =>
                    setCurrency(e.target.value as RequisitionCurrency)
                  }
                  data-testid="req-currency"
                >
                  {REQUISITION_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Reason *</span>
              <Textarea
                rows={2}
                placeholder="e.g. Demo visit to QA Test Academy — travel and subsistence"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                data-testid="req-reason"
              />
            </label>

            <div className="space-y-2">
              <span className="text-sm font-medium">Line items *</span>
              {items.map((item) => (
                <div
                  key={item.key}
                  className="grid grid-cols-[140px_1fr_110px_32px] items-center gap-2"
                  data-testid="line-item-row"
                >
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={item.category}
                    onChange={(e) =>
                      setItem(item.key, {
                        category: e.target.value as RequisitionCategory,
                      })
                    }
                  >
                    {REQUISITION_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) =>
                      setItem(item.key, { description: e.target.value })
                    }
                  />
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={item.amount || ""}
                    onChange={(e) =>
                      setItem(item.key, { amount: Number(e.target.value) })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={items.length === 1}
                    onClick={() =>
                      setItems((prev) => prev.filter((i) => i.key !== item.key))
                    }
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setItems((prev) => [
                      ...prev,
                      emptyItem(Math.max(...prev.map((i) => i.key)) + 1),
                    ])
                  }
                  data-testid="add-line-item"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add item
                </Button>
                <span className="text-sm font-semibold">
                  Total: {money(draftTotal, currency)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => handleCreate(false)}
              data-testid="save-draft"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save draft
            </Button>
            <Button
              disabled={busy}
              onClick={() => handleCreate(true)}
              data-testid="save-submit"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save & submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
