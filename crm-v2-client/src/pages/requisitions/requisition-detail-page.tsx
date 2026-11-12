import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { format } from "date-fns";
import {
  ArrowLeft,
  Check,
  X,
  Banknote,
  Loader2,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import Container from "~/components/container";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Textarea } from "~/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import {
  useCashRequisition,
  useRequisitionAction,
  useSubmitCashRequisition,
  CATEGORY_LABELS,
  STATUS_LABELS,
} from "~/api/cash-requisitions";
import { useAnyRole } from "~/hooks/use-permission";
import { useAuthStore } from "~/stores/use-auth-store";
import { handleApiError } from "~/api/axios";

const money = (amount: string | number, currency: string) =>
  `${currency} ${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function RequisitionDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: req, isLoading } = useCashRequisition(id);
  const actionMutation = useRequisitionAction();
  const submitMutation = useSubmitCashRequisition();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const isManagerApprover = useAnyRole(["admin", "manager", "sales_manager"]);
  const isFinanceApprover = useAnyRole(["admin", "finance"]);

  const [rejectOpen, setRejectOpen] = useState<null | "manager" | "finance">(null);
  const [rejectReason, setRejectReason] = useState("");

  if (isLoading || !req) {
    return (
      <Container>
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Container>
    );
  }

  const busy = actionMutation.isPending || submitMutation.isPending;

  const runAction = async (
    action:
      | "manager-approve"
      | "manager-reject"
      | "finance-approve"
      | "finance-reject"
      | "mark-paid",
    reason?: string,
  ) => {
    try {
      await actionMutation.mutateAsync({ id: req.id, action, reason });
      toast.success(
        action === "mark-paid"
          ? "Marked as paid"
          : action.endsWith("approve")
            ? "Approved"
            : "Rejected",
      );
      setRejectOpen(null);
      setRejectReason("");
    } catch (error) {
      toast.error("Action failed", { description: handleApiError(error) });
    }
  };

  const handleSubmit = async () => {
    try {
      await submitMutation.mutateAsync(req.id);
      toast.success("Submitted for approval");
    } catch (error) {
      toast.error("Could not submit", { description: handleApiError(error) });
    }
  };

  const trail: Array<{ label: string; detail: string }> = [];
  if (req.submitted_at) {
    trail.push({
      label: "Submitted",
      detail: format(new Date(req.submitted_at), "MMM d, yyyy HH:mm"),
    });
  }
  if (req.manager_actioned_at) {
    trail.push({
      label:
        req.rejected_stage === "manager" ? "Rejected by manager" : "Manager approved",
      detail: `${req.manager_actioned_by ? `${req.manager_actioned_by.first_name} ${req.manager_actioned_by.last_name} · ` : ""}${format(new Date(req.manager_actioned_at), "MMM d, yyyy HH:mm")}`,
    });
  }
  if (req.finance_actioned_at) {
    trail.push({
      label:
        req.rejected_stage === "finance" ? "Rejected by finance" : "Finance approved",
      detail: `${req.finance_actioned_by ? `${req.finance_actioned_by.first_name} ${req.finance_actioned_by.last_name} · ` : ""}${format(new Date(req.finance_actioned_at), "MMM d, yyyy HH:mm")}`,
    });
  }
  if (req.paid_at) {
    trail.push({
      label: "Paid",
      detail: format(new Date(req.paid_at), "MMM d, yyyy HH:mm"),
    });
  }

  return (
    <Container>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle data-testid="req-title">
                {req.type === "PRE_APPROVAL" ? "Pre-approval" : "Reimbursement"}{" "}
                · {money(req.total_amount, req.currency)}
              </CardTitle>
              <Badge variant="outline" data-testid="req-status">
                {STATUS_LABELS[req.status]}
              </Badge>
            </div>
            <CardDescription>
              Raised by{" "}
              {req.requested_by
                ? `${req.requested_by.first_name} ${req.requested_by.last_name}`
                : "—"}{" "}
              on {format(new Date(req.created_at), "MMM d, yyyy")} ·{" "}
              {req.deal ? (
                <Link className="text-primary hover:underline" to={`/deals/${req.deal.id}`}>
                  {req.deal.title}
                </Link>
              ) : req.lead ? (
                <Link className="text-primary hover:underline" to={`/leads/${req.lead.id}`}>
                  {req.lead.lead_name}
                </Link>
              ) : req.campaign ? (
                <Link
                  className="text-primary hover:underline"
                  to={`/campaigns/${req.campaign.id}`}
                >
                  {req.campaign.name}
                </Link>
              ) : (
                "unlinked"
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="mb-1 text-sm font-semibold">Reason</h4>
              <p className="text-sm text-muted-foreground">{req.reason}</p>
            </div>

            {req.status === "REJECTED" && req.rejection_reason && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Rejected at {req.rejected_stage} stage: {req.rejection_reason}
              </div>
            )}

            <div>
              <h4 className="mb-2 text-sm font-semibold">Line items</h4>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {req.line_items?.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {CATEGORY_LABELS[item.category]}
                        </td>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {money(item.amount, req.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-semibold">
                      <td className="px-3 py-2" colSpan={2}>
                        Total
                      </td>
                      <td className="px-3 py-2 text-right">
                        {money(req.total_amount, req.currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {req.status === "DRAFT" && req.requested_by_id === currentUserId && (
                <Button disabled={busy} onClick={handleSubmit} data-testid="action-submit">
                  <Send className="mr-1.5 h-4 w-4" /> Submit for approval
                </Button>
              )}

              {req.status === "SUBMITTED" && isManagerApprover && (
                <>
                  <Button
                    disabled={busy}
                    onClick={() => runAction("manager-approve")}
                    data-testid="action-manager-approve"
                  >
                    <Check className="mr-1.5 h-4 w-4" /> Approve (manager)
                  </Button>
                  <Button
                    variant="outline"
                    className="text-red-600"
                    disabled={busy}
                    onClick={() => setRejectOpen("manager")}
                    data-testid="action-manager-reject"
                  >
                    <X className="mr-1.5 h-4 w-4" /> Reject
                  </Button>
                </>
              )}

              {req.status === "MANAGER_APPROVED" && isFinanceApprover && (
                <>
                  <Button
                    disabled={busy}
                    onClick={() => runAction("finance-approve")}
                    data-testid="action-finance-approve"
                  >
                    <Check className="mr-1.5 h-4 w-4" /> Approve (finance)
                  </Button>
                  <Button
                    variant="outline"
                    className="text-red-600"
                    disabled={busy}
                    onClick={() => setRejectOpen("finance")}
                    data-testid="action-finance-reject"
                  >
                    <X className="mr-1.5 h-4 w-4" /> Reject
                  </Button>
                </>
              )}

              {req.status === "FINANCE_APPROVED" && isFinanceApprover && (
                <Button
                  disabled={busy}
                  onClick={() => runAction("mark-paid")}
                  data-testid="action-mark-paid"
                >
                  <Banknote className="mr-1.5 h-4 w-4" /> Mark as paid
                </Button>
              )}

              {["PAID", "REJECTED"].includes(req.status) && (
                <p className="text-sm text-muted-foreground">
                  This requisition is closed.
                </p>
              )}
              {req.status === "SUBMITTED" && !isManagerApprover && (
                <p className="text-sm text-muted-foreground">
                  Awaiting manager approval.
                </p>
              )}
              {req.status === "MANAGER_APPROVED" && !isFinanceApprover && (
                <p className="text-sm text-muted-foreground">
                  Awaiting finance approval.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Approval trail</CardTitle>
            </CardHeader>
            <CardContent>
              {trail.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not submitted yet.</p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {trail.map((t) => (
                    <li key={t.label}>
                      <span className="font-medium">{t.label}</span>
                      <div className="text-xs text-muted-foreground">{t.detail}</div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={rejectOpen !== null}
        onOpenChange={(next) => !next && setRejectOpen(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject requisition</DialogTitle>
            <DialogDescription>
              A reason is required — the requester sees it verbatim.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="Why is this being rejected?"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            data-testid="reject-reason"
          />
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setRejectOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !rejectReason.trim()}
              onClick={() =>
                runAction(
                  rejectOpen === "manager" ? "manager-reject" : "finance-reject",
                  rejectReason.trim(),
                )
              }
              data-testid="confirm-reject"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
