import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { format } from "date-fns";
import {
  Plus,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  CreditCard,
  AlertCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { RecordDetailLayout } from "~/components/layout/record-detail-layout";
import { DealAtAGlance } from "~/components/deals/deal-at-a-glance";
import { Badge } from "~/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Skeleton } from "~/components/ui/skeleton";
import { useDeal, useUpdateDeal, useCloseDeal } from "~/api/deals";
import { handleApiError } from "~/api/axios";
import {
  formatDealStageBlock,
  type BlockedActionMessage,
} from "~/lib/blocked-action-messages";
// Activity hooks are no longer consumed on this page — the filtered
// EngagementWorkspace tabs below own every activity query/mutation.
// The stray `TaskListItem` and `TaskStatus` imports went with the
// retired standalone Task tab.
import { CreateActivityModal } from "~/components/activities/create-activity-modal";
import { ActivityTaskSheet } from "~/components/activities/activity-task-sheet";
import { DealActivitiesTab } from "~/components/deals/tabs/activities-tab";
import { useActivityList } from "~/api/activities";
import {
  pickPivotalActivities,
  activityTouchDate,
} from "~/components/activities/activity-kit";
import { FilesTab } from "~/components/deals/tabs/files-tab";
import { useCurrency } from "~/hooks/use-currency";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { usePipelineStages, type Stage } from "~/api/pipelines";
import { useStaff } from "~/api/users";
import type { Quote } from "~/api/quotes";
import { useConvertQuoteToInvoice, type Invoice } from "~/api/invoices";
import { useAgingReport } from "~/api/collections";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { MarkDealLostModal } from "~/components/deals/mark-deal-lost-modal";
import { RelatedLeadsSection } from "~/components/leads/related-leads";
import { QuotePreviewModal } from "~/components/quotes/quote-preview-modal";
import { InvoicePreviewModal } from "~/components/invoices/invoice-preview-modal";
import { AddPaymentModal } from "~/components/invoices/add-payment-modal";
import {
  type DealRollbackRequest,
  useDealRollbackRequestsByDeal,
} from "~/api/deal-rollback-requests";
import { RequestDealRollbackDialog } from "~/components/deals/request-deal-rollback-dialog";
import { ReviewDealRollbackRequestDialog } from "~/components/deals/review-deal-rollback-request-dialog";
import { DealCostsSection } from "~/components/deals/deal-costs-section";
import { useAnyRole } from "~/hooks/use-permission";
import { useAuthStore } from "~/stores/use-auth-store";
import { isDealReadonly } from "~/stores/use-is-readonly";

const formatDate = (value?: string, fallback = "--") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return format(date, "MMM d, yyyy");
};

const formatDateTime = (value?: string, fallback = "--") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return format(date, "MMM d, yyyy 'at' h:mm a");
};

const formatRollbackActor = (actor?: {
  first_name?: string;
  last_name?: string;
  email?: string;
} | null) => {
  if (!actor) return "--";
  const fullName = `${actor.first_name || ""} ${actor.last_name || ""}`.trim();
  return fullName || actor.email || "--";
};

const getInvoiceOutstanding = (invoice: Invoice) =>
  Math.max(Number(invoice.total || 0) - Number(invoice.amount_paid || 0), 0);

export default function ViewDealDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const user = useAuthStore((state) => state.user);
  const hasPrivilegedRole = useAnyRole([
    "admin",
    "sales_manager",
    "sale_manager",
    "manager",
  ]);
  const canReviewRollbackRequests = useAnyRole([
    "admin",
    "sales_manager",
    "sale_manager",
  ]);

  // `createTaskOpen` / `createNoteOpen` were modal triggers for the
  // retired standalone Task and Note tabs — both tabs now route into
  // the shared EngagementWorkspace pre-filtered, so the per-type
  // modals are gone and the `createActivityOpen` single entry point
  // covers scheduling any activity type.
  const [createActivityOpen, setCreateActivityOpen] = useState(false);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [markLostOpen, setMarkLostOpen] = useState(false);
  const [previewQuoteId, setPreviewQuoteId] = useState<string | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [convertingQuoteId, setConvertingQuoteId] = useState<string | null>(
    null,
  );
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentDefaultAmount, setPaymentDefaultAmount] = useState<
    number | undefined
  >(undefined);
  const [paymentDescription, setPaymentDescription] = useState<
    string | undefined
  >(undefined);
  const [rollbackTargetStage, setRollbackTargetStage] = useState<Stage | null>(null);
  const [reviewRollbackRequest, setReviewRollbackRequest] =
    useState<DealRollbackRequest | null>(null);
  const [stageBlockedMessage, setStageBlockedMessage] =
    useState<BlockedActionMessage | null>(null);

  const { data: deal, isLoading, error } = useDeal(id || "");
  const { data: rollbackRequests = [] } = useDealRollbackRequestsByDeal(id || "");

  // Feed the "at a glance" panel with real activity: without this the deal
  // page never passed nextActivity/lastActivityAt, so every deal showed
  // "No activity yet". Same touch rule as leads (see pickPivotalActivities).
  const { data: dealActivitiesData } = useActivityList({
    deal_id: id || "",
    limit: 50,
    page: 1,
  });
  const { nextActivity: dealNextActivity, lastActivity: dealLastActivity } =
    useMemo(
      () => pickPivotalActivities(dealActivitiesData?.data ?? []),
      [dealActivitiesData],
    );
  const isReadonly = isDealReadonly(
    deal?.closeStatus ||
      (deal as { close_status?: string } | undefined)?.close_status ||
      (deal as { status?: string } | undefined)?.status,
  );
  const updateDeal = useUpdateDeal();
  const closeDeal = useCloseDeal();
  const convertQuoteToInvoice = useConvertQuoteToInvoice();
  const { data: agingReportData, isLoading: installmentsLoading } =
    useAgingReport();

  const pipelineId =
    deal?.pipeline_id ||
    (deal as any)?.pipelineId ||
    deal?.current_stage?.pipeline_id ||
    "";
  const currentStageId =
    deal?.current_stage_id || deal?.current_stage?.id || "";
  const assignedUserId =
    deal?.assigned_to ||
    deal?.owner_id ||
    deal?.assigned_user?.id ||
    deal?.owner?.id ||
    "";

  const { data: stagesData } = usePipelineStages(pipelineId);
  const stages = stagesData?.data || [];
  const pendingRollbackRequest = useMemo(
    () => rollbackRequests.find((request) => request.status === "pending") ?? null,
    [rollbackRequests],
  );

  const { data: staffData } = useStaff({
    page: 1,
    limit: 200,
    status: "active",
  });
  const staff = staffData?.data || [];

  // The bespoke per-deal Task + Note queries + mutation handlers
  // that used to live here were consumed only by the now-retired
  // standalone tabs. The Notes / Emails / Calls tabs underneath are
  // filtered views of the shared EngagementWorkspace, which owns its
  // own data fetching and mutations — no duplicate wiring needed on
  // this page.

  const handleStageChange = (value: string) => {
    if (isReadonly) return;
    if (!deal || !value || value === currentStageId) return;

    const targetStage = stages.find((stageOption) => stageOption.id === value);
    const currentStage =
      stages.find((stageOption) => stageOption.id === currentStageId) ||
      deal.current_stage;

    if (targetStage && currentStage && targetStage.order < currentStage.order) {
      setRollbackTargetStage(targetStage);
      return;
    }

    updateDeal.mutate(
      { id: deal.id, data: { stage_id: value } },
      {
        onSuccess: () => {
          setStageBlockedMessage(null);
          toast.success("Stage updated");
        },
        onError: (error) => {
          const message = formatDealStageBlock(error, targetStage?.name);
          setStageBlockedMessage(message);
          toast.error(message.title, {
            description: message.description,
          });
        },
      },
    );
  };

  const handleAssignRep = (value: string) => {
    if (isReadonly) return;
    if (!deal || !value || value === assignedUserId) return;
    updateDeal.mutate(
      { id: deal.id, data: { assigned_to: value } },
      {
        onSuccess: () => toast.success("Deal owner updated"),
        onError: () => toast.error("Failed to update owner"),
      },
    );
  };

  const handleConvertQuoteToInvoice = (quoteId: string) => {
    if (isReadonly) return;
    if (!deal) return;
    setConvertingQuoteId(quoteId);
    convertQuoteToInvoice.mutate({quoteId, dealId: deal.id }, {
      onSuccess: (invoice) => {
        const createdInvoice =
          (invoice as { data?: Invoice } | undefined)?.data ??
          (invoice as Invoice | undefined);
        toast.success("Invoice created from quote");
        queryClient.invalidateQueries({ queryKey: ["deals"] });
        if (createdInvoice?.id) {
          setPreviewInvoiceId(createdInvoice.id);
        }
      },
      onError: () => {
        toast.error("Failed to create invoice from quote");
      },
      onSettled: () => {
        setConvertingQuoteId(null);
      },
    });
  };

  const openPaymentModal = ({
    invoice,
    defaultAmount,
    description,
  }: {
    invoice: Invoice;
    defaultAmount?: number;
    description?: string;
  }) => {
    if (isReadonly) return;
    setPaymentInvoice(invoice);
    setPaymentDefaultAmount(defaultAmount);
    setPaymentDescription(description);
  };

  const closePaymentModal = () => {
    setPaymentInvoice(null);
    setPaymentDefaultAmount(undefined);
    setPaymentDescription(undefined);
  };

  // `handleDeleteTask` / `openTaskSheet` / `handleEditTask` — all
  // retired along with the standalone Task tab. `selectedTaskId` +
  // `taskSheetOpen` state remain because the `ActivityTaskSheet` is
  // still rendered as a controlled sheet below (future entry points
  // can reopen it), even though no row currently triggers it.
  const stage = deal?.current_stage;
  const dealTitle =
    deal?.deal_name ||
    deal?.title ||
    ((deal?.lead as { lead_name?: string } | undefined)?.lead_name ?? "") ||
    "Deal";
  const stageLabel = deal?.currentStatus || stage?.name || "Stage";
  const rollbackCount = Number(
    deal?.rollback_count ?? deal?.stage_data?.backward_moves ?? 0,
  );
  // `stageColor`, `expectedCloseDate`, `statusClassName`, `stageSince`,
  // `lastContacted` derivations were consumed only by the retired
  // duplicate identity/metrics strip. Surfaces that still need any of
  // those values (DealAtAGlance, audit timeline, Overview tab) read
  // the raw `deal.*` fields directly.
  const createdAt = deal?.created_at || deal?.createdAt || undefined;
  const updatedAt = deal?.updated_at || deal?.updatedAt || undefined;
  const quotes = (deal?.quotes || []) as Quote[];
  const invoices = (deal?.invoices || []) as Invoice[];
  const statusLabel = deal?.closeStatus
    ? deal.closeStatus.charAt(0).toUpperCase() + deal.closeStatus.slice(1)
    : "Ongoing";
  const ownerSource = deal?.assigned_user || deal?.owner;
  const ownerName = ownerSource
    ? `${ownerSource.first_name || ""} ${ownerSource.last_name || ""}`.trim() ||
      ownerSource.email ||
      "--"
    : "--";
  const description = (deal as { description?: string } | undefined)
    ?.description;
  const dealSchool = deal?.school as { id?: string; name?: string } | undefined;
  const relatedSchoolId = deal?.school_id || dealSchool?.id;
  const relatedSchoolName = dealSchool?.name || "this school";
  const hasPosOrAcceptedQuotes = useMemo(() => {
    return quotes.some(
      (quote) => ["accepted"].includes(quote.status) || quote.po_received,
    );
  }, [quotes]);
  const canManageAssignee =
    hasPrivilegedRole ||
    !!user?.roles?.some((role) =>
      ["admin", "sales_manager", "sale_manager", "manager"].includes(role),
    );
  const invoiceById = useMemo(
    () => new Map(invoices.map((invoice) => [invoice.id, invoice] as const)),
    [invoices],
  );
  const convertedQuoteIds = useMemo(
    () =>
      new Set(
        invoices
          .map((invoice) => invoice.quote_id)
          .filter((quoteId): quoteId is string => !!quoteId),
      ),
    [invoices],
  );
  const dealInvoiceIdSet = useMemo(
    () => new Set(invoices.map((invoice) => invoice.id)),
    [invoices],
  );
  const installments = useMemo(
    () =>
      (agingReportData?.installments || []).filter((installment) =>
        dealInvoiceIdSet.has(installment.invoice_id),
      ),
    [agingReportData, dealInvoiceIdSet],
  );
  const installmentsOutstanding = useMemo(
    () =>
      installments.reduce(
        (sum, installment) => sum + Number(installment.balance || 0),
        0,
      ),
    [installments],
  );

  if (!id) {
    return (
      <Container className="p-4">
        <div className="flex flex-col items-center justify-center py-16">
          <h2 className="text-2xl font-bold mb-2">Deal not found</h2>
          <p className="text-muted-foreground mb-4">
            The deal you are looking for does not exist.
          </p>
          <Button onClick={() => navigate("/pipeline")}>
            Back to Pipeline
          </Button>
        </div>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container className="p-4 space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-[420px] w-full" />
      </Container>
    );
  }

  if (error || !deal) {
    return (
      <Container className="p-4">
        <div className="flex flex-col items-center justify-center py-16">
          <h2 className="text-2xl font-bold mb-2">Deal not found</h2>
          <p className="text-muted-foreground mb-4">
            The deal you are looking for does not exist.
          </p>
          <Button onClick={() => navigate("/pipeline")}>
            Back to Pipeline
          </Button>
        </div>
      </Container>
    );
  }

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-64px)] lg:overflow-hidden">
      <PageHeader
        hasBackButton
        sticky
        wide
        eyebrow="Deal"
        // IDENTITY TRIM — the previous header paired the deal name
        // with decorative status + stage badges and a full subtitle
        // row carrying value, school link, owner, and close date.
        // Every one of those values is already surfaced on the
        // left-pane DealAtAGlance (Commercial / Ownership / Timing
        // sections), so repeating them above the workspace violated
        // the product rule — LEFT owns context, RIGHT owns work.
        // Rollback-count badge is a rare flag that isn't duplicated,
        // so it survives as an operational marker when > 0.
        title={
          rollbackCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-xl tracking-tight">
                {dealTitle}
              </span>
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
              >
                Rolled back {rollbackCount}x
              </Badge>
            </div>
          ) : (
            dealTitle
          )
        }
        actions={
          <div className="flex gap-x-2">
            {deal.closeStatus === "ongoing" && (
              <div className="flex gap-x-2">
                <ConfirmDialog
                  title="Mark Deal as Won"
                  hasError={!invoices.length}
                  description={
                    !invoices.length ? (
                      <span className="text-destructive">
                        Cannot mark deal as won without invoices. Add at least 1
                        invoice.
                      </span>
                    ) : (
                      "Are you sure you want to mark this deal as won? This action cannot be undone."
                    )
                  }
                  btnText={
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Mark Won
                    </>
                  }
                  variant="outline"
                  className="text-green-600 hover:text-green-600/80"
                  isProcessing={closeDeal.isPending}
                  onConfirm={() => {
                    if (!deal) return;
                    if (!invoices.length) return;
                    closeDeal.mutate(
                      { id: deal.id, data: { close_status: "won" } },
                      {
                        onSuccess: () => toast.success("Deal marked as won"),
                        onError: (error) =>
                          toast.error("Could not mark deal as won", {
                            description: handleApiError(error),
                          }),
                      },
                    );
                  }}
                />
                <Button
                  variant="outline"
                  className="text-red-600"
                  onClick={() => setMarkLostOpen(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Mark Lost
                </Button>
              </div>
            )}
            <Button
              size="sm"
              onClick={() => setCreateActivityOpen(true)}
              disabled={isReadonly}
            >
              <Plus className="mr-2 h-4 w-4" />
              Log Activity
            </Button>
          </div>
        }
      />

      {/* Metrics strip wrapper — plain full-width div. Was
          `<Container className="p-3 space-y-2">` which a) re-narrowed
          content below a `wide` PageHeader via `container mx-auto`
          and b) added 12px top + bottom padding. Both compounded the
          dead band the user was circling. */}
      <div className="px-3 md:px-4 pt-1.5 pb-2 space-y-2">
        {!hasPosOrAcceptedQuotes && !invoices.length && (
          <div className="bg-amber-500/20 text-amber-600 border border-amber-400 rounded-md p-4">
            <p className="flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              No Purchases orders are available, although you can proceed to
              creating an invoice, you first need to flag the Quote as accepted
            </p>
          </div>
        )}
        {pendingRollbackRequest && (
          <Alert className="border-amber-300 bg-amber-50/70">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Rollback request pending</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <span>
                {formatRollbackActor(pendingRollbackRequest.requested_by)} requested
                moving this deal from {pendingRollbackRequest.from_stage?.name || pendingRollbackRequest.from_stage_id} to {pendingRollbackRequest.to_stage?.name || pendingRollbackRequest.to_stage_id} on {formatDateTime(pendingRollbackRequest.requested_at)}.
              </span>
              {canReviewRollbackRequests && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReviewRollbackRequest(pendingRollbackRequest)}
                >
                  Review Request
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {deal.closeStatus === "ongoing" && (
          <MarkDealLostModal
            dealId={deal.id}
            isOpen={markLostOpen}
            onClose={() => setMarkLostOpen(false)}
          />
        )}
        {/* Previous "In stage / Last contact / Health / Created"
            metrics strip was removed here — every one of those values
            already lives in the left-pane DealAtAGlance summary
            (Commercial / Ownership / Engagement / Timing sections).
            Duplicating them above the workspace wasted vertical space
            and broke the product rule: LEFT owns context, RIGHT owns
            work. Only operationally-important alerts (missing POs,
            pending rollback) remain in this pre-workspace area. */}
      </div>

      {/* Split workspace: left = DealAtAGlance read-only summary,
          right = tabbed content. Alerts + metrics strip above the
          split so they don't compete for pane width. */}
      <RecordDetailLayout
        fillViewport={false}
        className="flex-1 min-h-0"
        left={
          <DealAtAGlance
            deal={deal}
            nextActivity={dealNextActivity}
            lastActivityAt={activityTouchDate(dealLastActivity)}
          />
        }
        right={
        /* Default landing tab is Activities — the rep needs to see
            "what's next?" first. Overview keeps its full edit form
            behind the Overview tab for when the rep needs it. Tasks
            and Notes tabs retired: they were activity types, not
            separate modules, and the Activities workspace exposes
            them through its unified type filter. */
        <Tabs defaultValue="activities" className="space-y-3">
          <div className="sticky top-0 z-10 -mx-3 md:-mx-4 px-3 md:px-4 py-1.5 bg-background/95 backdrop-blur-sm border-b">
            <TabsList className="w-full justify-start overflow-x-auto bg-transparent">
              <TabsTrigger value="activities">Activities</TabsTrigger>
              {/* Fast-paths into the activity feed pre-filtered by
                  type — reps usually want to jump straight to "show
                  me the calls" or "show me the notes" rather than
                  open Activities and then click the Type chip. */}
              {/* Calls / Emails are activity types — they live in the
                  composer's type strip under Activity now. */}
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="installments">
                Installments ({installments.length})
              </TabsTrigger>
              <TabsTrigger value="costs">Costs</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-4">
            {relatedSchoolId && (
              <RelatedLeadsSection
                schoolId={relatedSchoolId}
                schoolName={relatedSchoolName}
                currentLeadId={deal.lead_id}
              />
            )}

            <Card>
              <CardHeader>
                <CardTitle>Manage Deal</CardTitle>
                <CardDescription>
                  Update stage and owner. Stage gates remain enforced; blocked
                  moves leave the deal in its current stage.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {stageBlockedMessage && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{stageBlockedMessage.title}</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>{stageBlockedMessage.description}</p>
                      {stageBlockedMessage.missingItems.length > 0 && (
                        <ul className="list-disc space-y-1 pl-4">
                          {stageBlockedMessage.missingItems.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Stage
                    </span>
                    <Select
                      value={currentStageId}
                      onValueChange={handleStageChange}
                      disabled={!pipelineId || updateDeal.isPending || isReadonly}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={stageLabel} />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.length === 0 ? (
                          <SelectItem value={currentStageId || "none"} disabled>
                            No stages available
                          </SelectItem>
                        ) : (
                          stages.map((stageOption) => (
                            <SelectItem
                              key={stageOption.id}
                              value={stageOption.id}
                            >
                              {stageOption.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Owner
                    </span>
                    {canManageAssignee ? (
                      <Select
                        value={assignedUserId}
                        onValueChange={handleAssignRep}
                        disabled={updateDeal.isPending || isReadonly}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              ownerName !== "--" ? ownerName : "Assign owner"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {staff.length === 0 ? (
                            <SelectItem value={assignedUserId || "none"} disabled>
                              No staff available
                            </SelectItem>
                          ) : (
                            staff.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.first_name} {user.last_name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                        {ownerName}
                      </div>
                    )}
                    {!canManageAssignee && (
                      <p className="text-xs text-muted-foreground">
                        Only sales managers and admins can reassign a deal owner.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Deal Details</CardTitle>
                <CardDescription>
                  Key information about this deal
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Pipeline
                    </dt>
                    <dd className="font-medium">
                      {deal.pipeline?.name || "--"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Stage
                    </dt>
                    <dd className="font-medium">{stageLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Status
                    </dt>
                    <dd className="font-medium">{statusLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Health Score
                    </dt>
                    <dd className="font-medium">
                      {deal.healthScore !== null &&
                      deal.healthScore !== undefined
                        ? `${deal.healthScore}%`
                        : deal.healthScore !== null &&
                            deal.healthScore !== undefined
                          ? `${deal.healthScore}%`
                          : "--"}
                    </dd>
                  </div>
                  {/* <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Risk Score
                    </dt>
                    <dd className="font-medium">
                      {deal.risk_score !== null && deal.risk_score !== undefined
                        ? `${deal.risk_score}%`
                        : "--"}
                    </dd>
                  </div> */}
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Created
                    </dt>
                    <dd className="font-medium">{formatDate(createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">
                      Updated
                    </dt>
                    <dd className="font-medium">{formatDate(updatedAt)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {description && (
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{description}</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {deal.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{deal.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No notes added yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1.5">
                    <CardTitle>Quotes</CardTitle>
                    <CardDescription>
                      Quotes linked to this deal
                    </CardDescription>
                  </div>
                  {isReadonly ? (
                    <Button size="sm" disabled>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Quote
                    </Button>
                  ) : (
                    <Button size="sm" asChild>
                      <Link
                        to={`/quotes/new?dealId=${deal.id}&schoolId=${deal.school_id}`}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create Quote
                      </Link>
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {quotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No quotes available
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {quotes.map((quote) => {
                        const invoiceAlreadyCreated = convertedQuoteIds.has(
                          quote.id,
                        );
                        const isConvertingThisQuote =
                          convertingQuoteId === quote.id;

                        return (
                          <div
                            key={quote.id}
                            className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="space-y-1">
                              <p className="font-medium">
                                {quote.quote_number || "Quote"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Status: {quote.status}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Created:{" "}
                                {formatDate(
                                  quote.created_at ||
                                    (quote as { createdAt?: string }).createdAt,
                                )}
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 sm:items-end">
                              <span className="font-semibold">
                                {formatCurrency(Number(quote.total || 0))}
                              </span>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPreviewQuoteId(quote.id)}
                                >
                                  View
                                </Button>
                                {invoiceAlreadyCreated ? (
                                  <Badge variant="outline" className="text-xs">
                                    Invoice created
                                  </Badge>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleConvertQuoteToInvoice(quote.id)
                                    }
                                    disabled={
                                      isReadonly ||
                                      convertQuoteToInvoice.isPending ||
                                      isConvertingThisQuote
                                    }
                                  >
                                    {convertQuoteToInvoice.isPending &&
                                      isConvertingThisQuote && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      )}
                                    Convert to Invoice
                                  </Button>
                                )}
                                {isReadonly ? (
                                  <Button variant="outline" size="sm" disabled>
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Manual Invoice
                                  </Button>
                                ) : (
                                  <Button variant="outline" size="sm" asChild>
                                    <Link
                                      to={`/invoices/new?dealId=${deal.id}&schoolId=${deal.school_id}&quoteId=${quote.id}`}
                                    >
                                      <ExternalLink className="mr-2 h-4 w-4" />
                                      Manual Invoice
                                    </Link>
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1.5">
                    <CardTitle>Invoices</CardTitle>
                    <CardDescription>
                      Invoices linked to this deal
                    </CardDescription>
                  </div>
                  {isReadonly ? (
                    <Button size="sm" disabled>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Invoice
                    </Button>
                  ) : (
                    <Button size="sm" asChild>
                      <Link
                        to={`/invoices/new?dealId=${deal.id}&schoolId=${deal.school_id}&quoteId=${quotes.length > 0 ? quotes[0].id : ""}`}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create Invoice
                      </Link>
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {invoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No invoices available
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {invoices.map((invoice) => {
                        const outstanding = getInvoiceOutstanding(invoice);
                        const canAddPayment =
                          outstanding > 0 && invoice.status !== "Cancelled";

                        return (
                          <div
                            key={invoice.id}
                            className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="space-y-1">
                              <p className="font-medium">
                                {invoice.invoice_number || "Invoice"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Status: {invoice.status}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Due:{" "}
                                {formatDate(
                                  invoice.due_date ||
                                    (invoice as { dueDate?: string }).dueDate,
                                )}
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 sm:items-end">
                              <span className="font-semibold">
                                {formatCurrency(Number(invoice.total || 0))}
                              </span>
                              {invoice.payment_status && (
                                <Badge variant="outline" className="text-xs">
                                  {invoice.payment_status}
                                </Badge>
                              )}
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setPreviewInvoiceId(invoice.id)
                                  }
                                >
                                  View
                                </Button>
                                {canAddPayment && !isReadonly && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      openPaymentModal({
                                        invoice,
                                        description: `Record a payment for invoice ${invoice.invoice_number}. Payments are applied using FIFO.`,
                                      })
                                    }
                                  >
                                    <CreditCard className="mr-2 h-4 w-4" />
                                    Add Payment
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="installments">
            <Card>
              <CardHeader>
                <CardTitle>Installments</CardTitle>
                <CardDescription>
                  Outstanding installments linked to this deal&apos;s invoices
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border bg-muted/40 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      Payments are applied using FIFO, starting with the oldest
                      overdue installment first.
                    </p>
                    <p className="text-sm font-semibold">
                      Outstanding: {formatCurrency(installmentsOutstanding)}
                    </p>
                  </div>
                </div>

                {installmentsLoading ? (
                  <div className="flex h-32 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : installments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No outstanding installments found for this deal.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {installments.map((installment) => {
                      const linkedInvoice = invoiceById.get(
                        installment.invoice_id,
                      );
                      const installmentBalance = Number(
                        installment.balance || 0,
                      );
                      const invoiceOutstanding = linkedInvoice
                        ? getInvoiceOutstanding(linkedInvoice)
                        : 0;
                      const canAddPayment =
                        !!linkedInvoice &&
                        installmentBalance > 0 &&
                        invoiceOutstanding > 0;
                      const suggestedAmount = Math.min(
                        installmentBalance,
                        invoiceOutstanding,
                      );

                      return (
                        <div
                          key={installment.installment_id}
                          className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="space-y-1">
                            <p className="font-medium">
                              {installment.invoice_number} - Installment #
                              {installment.installment_number}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Due: {formatDate(installment.due_date)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Status: {installment.status} | Days overdue:{" "}
                              {installment.days_overdue}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 sm:items-end">
                            <span className="font-semibold">
                              Balance: {formatCurrency(installmentBalance)}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {linkedInvoice && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setPreviewInvoiceId(linkedInvoice.id)
                                  }
                                >
                                  View Invoice
                                </Button>
                              )}
                              {canAddPayment &&
                                linkedInvoice &&
                                !isReadonly && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      openPaymentModal({
                                        invoice: linkedInvoice,
                                        defaultAmount: suggestedAmount,
                                        description: `Record payment for installment #${installment.installment_number} (${installment.invoice_number}). Allocation follows FIFO.`,
                                      })
                                    }
                                  >
                                    <CreditCard className="mr-2 h-4 w-4" />
                                    Add Payment
                                  </Button>
                                )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activities">
            {/* Composer opens on Call, matching the lead and school pages.
                The COMMERCIAL record locks when a deal closes (stage,
                value, quotes) — the CONVERSATION does not. A won deal
                still gets calls: instalments to chase, delivery to
                coordinate, training to schedule. Those must be logged
                where the relationship lives, so the activity log never
                inherits the record lock. Closed deals owe no next step
                (the completion policy already exempts them), so nothing
                nags — but nothing is forbidden either. */}
            <DealActivitiesTab
              dealId={deal.id}
              leadId={deal.lead_id}
              isReadonly={false}
              composeType="call"
              defaultAssigneeId={assignedUserId || undefined}
              onLogActivity={() => {
                setCreateActivityOpen(true);
              }}
            />
          </TabsContent>

          {/* Notes / Emails / Calls used to lock the workspace to a
              single type, which left the separate create modal as the
              only way to write anything. They now open the inline
              composer on that type instead — same as the lead page — so
              the log underneath stays complete while the rep writes.
              Saved work lands in Planned. */}
          <TabsContent value="notes">
            {/* Same rule as Activities: notes on a closed deal are records
                of a living relationship, never locked. */}
            <DealActivitiesTab
              dealId={deal.id}
              leadId={deal.lead_id}
              isReadonly={false}
              composeType="note"
              defaultAssigneeId={assignedUserId || undefined}
            />
          </TabsContent>


          <TabsContent value="costs">
            <DealCostsSection dealId={deal.id} />
          </TabsContent>

          <TabsContent value="costs">
            <DealCostsSection dealId={deal.id} />
          </TabsContent>

          <TabsContent value="files">
            <FilesTab
              entityId={deal.id}
              entity="deal"
              isReadonly={isReadonly}
            />
          </TabsContent>

        </Tabs>
        }
      />

      {/* Per-type `CreateActivityModal` instances for Task and Note
          were retired along with those standalone tabs — the single
          generic `CreateActivityModal` below covers every activity
          type via the type picker inside it. */}
      <CreateActivityModal
        isOpen={createActivityOpen}
        onClose={() => setCreateActivityOpen(false)}
        dealId={deal.id}
        isReadonly={isReadonly}
      />
      <ActivityTaskSheet
        activityId={selectedTaskId}
        open={taskSheetOpen}
        isReadonly={isReadonly}
        onOpenChange={(open) => {
          setTaskSheetOpen(open);
          if (!open) setSelectedTaskId(null);
        }}
      />
      {paymentInvoice && (
        <AddPaymentModal
          isOpen={!!paymentInvoice}
          onClose={closePaymentModal}
          invoice={paymentInvoice}
          defaultAmount={paymentDefaultAmount}
          description={paymentDescription}
        />
      )}
      <QuotePreviewModal
        open={!!previewQuoteId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPreviewQuoteId(null);
        }}
        quoteId={previewQuoteId}
      />
      <InvoicePreviewModal
        open={!!previewInvoiceId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPreviewInvoiceId(null);
        }}
        invoiceId={previewInvoiceId}
      />
      <RequestDealRollbackDialog
        deal={deal}
        fromStage={
          stages.find((stageOption) => stageOption.id === currentStageId) ||
          deal.current_stage ||
          null
        }
        toStage={rollbackTargetStage}
        open={!!rollbackTargetStage}
        onOpenChange={(open) => {
          if (!open) setRollbackTargetStage(null);
        }}
      />
      <ReviewDealRollbackRequestDialog
        request={reviewRollbackRequest}
        open={!!reviewRollbackRequest}
        onOpenChange={(open) => {
          if (!open) setReviewRollbackRequest(null);
        }}
      />
    </div>
  );
}
