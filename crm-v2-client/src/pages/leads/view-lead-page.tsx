import { useParams, Link, useSearchParams } from "react-router";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { RecordDetailLayout } from "~/components/layout/record-detail-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Badge } from "~/components/ui/badge";
import { useLead, isTerminalStatus } from "~/api/leads";
import { useBreadcrumbStore } from "~/stores/use-breadcrumb-store";
import {
  PeopleTab,
  TimelineTab,
} from "~/components/leads/tabs";
import { ActivitiesTab } from "~/components/activities/activities-tab";
import { LeadAtAGlance } from "~/components/leads/lead-at-a-glance";
import {
  Loader2,
  AlertCircle,
  TriangleAlert,
  User,
  ListCheck,
  Users,
  Paperclip,
  ArrowRightLeft,
  Phone,
  Clock,
  FileText,
  Undo2,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LeadQualificationModal } from "~/components/leads/lead-qualification-modal";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import PulsingAlert from "~/components/alerts/pusling-alert";
import { Card, CardContent } from "~/components/ui/card";
import { format } from "date-fns";
import {
  useActivities,
  useActivityList,
  type Activity,
} from "~/api/activities";
import { useLeadQualification } from "~/api/lead-qualification";
import { useUpdateLead } from "~/api/leads";
import { useAddDealModalStore } from "~/stores/use-add-deal-modal-store";
import AddDealModalContainer from "~/components/deals/add-deal-modal-container";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import {
  MarkContactedDialog,
  NurtureLeadDialog,
  DisqualifyLeadDialog,
  ConvertLeadDialog,
  QualifyLeadDialog,
  RequestReversalDialog,
  ReviewReversalRequestDialog,
  EscalateLeadDialog,
  RequestTacticalDisqualifyDialog,
  RequestReassignmentDialog,
} from "~/components/leads/lead-actions";
import { LeadControlPanel } from "~/components/leads/lead-control-panel";
import { useLeadEscalations } from "~/api/lead-escalations";
import { FilesTab } from "~/components/deals/tabs/files-tab";
import { DealCostsSection } from "~/components/deals/deal-costs-section";
import { isLeadReadonly } from "~/stores/use-is-readonly";
import { useAnyRole } from "~/hooks/use-permission";
import { AssignLeadsDialog } from "~/components/leads/assign-leads-dialog";
import { useAuthStore } from "~/stores/use-auth-store";
import { useLeadReversalRequests } from "~/api/lead-reversal-requests";

const formatOptionalDateTime = (value?: string | null, fallback = "--") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return format(date, "MMM d, yyyy h:mm a");
};

const formatReversalRequester = (request?: {
  requested_by?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
} | null) => {
  if (!request?.requested_by) return "--";
  const fullName =
    `${request.requested_by.first_name || ""} ${request.requested_by.last_name || ""}`.trim();
  return fullName || request.requested_by.email || "--";
};

export default function ViewLeadPage() {
  const { id } = useParams();

  if (!id) {
    return (
      <div>
        <PageHeader hasBackButton title="View Lead" />
        <Container className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Lead ID is required to view this page.
            </AlertDescription>
          </Alert>
        </Container>
      </div>
    );
  }

  //  if (!canView) {
  //   return (
  //     <div>
  //       <PageHeader
  //         title="Lead"
  //         hasBackButton
  //         subtitle="You don't have permission to view this lead."
  //       />
  //       <Container className="p-4">
  //         <p className="text-sm text-destructive">
  //           You don't have permission to view this lead.
  //         </p>
  //       </Container>
  //     </div>
  //   );
  // }

  return <ViewLead id={id} />;
}

const ViewLead = ({ id }: { id: string }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [qualificationOpen, setQualificationOpen] = useState(false);
  const [markContactedOpen, setMarkContactedOpen] = useState(false);
  const [nurtureOpen, setNurtureOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [requestReversalOpen, setRequestReversalOpen] = useState(false);
  const [reviewReversalOpen, setReviewReversalOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  // Phase C.1 — rep-side request dialogs.
  const [requestTacticalOpen, setRequestTacticalOpen] = useState(false);
  const [requestReassignOpen, setRequestReassignOpen] = useState(false);

  const { data: leadData, isLoading, error } = useLead(id);
  const lead = leadData?.data;

  // Publish the lead's name to the top breadcrumb so it shows the name
  // instead of the raw lead UUID; clear it when leaving the page.
  const setBreadcrumbLabel = useBreadcrumbStore((s) => s.setLabel);
  useEffect(() => {
    setBreadcrumbLabel(lead?.lead_name ?? null);
    return () => setBreadcrumbLabel(null);
  }, [lead?.lead_name, setBreadcrumbLabel]);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const canAdminOrSalesManager = useAnyRole(["admin", "sales_manager"]);
  const canReassignLead = canAdminOrSalesManager;
  const canApproveReversalRequest = canAdminOrSalesManager;
  const { data: reversalRequests = [], isLoading: isLoadingReversalRequests } =
    useLeadReversalRequests(id);
  const { data: escalations = [] } = useLeadEscalations(id);
  const hasOpenEscalation = escalations.some((e) => !e.resolved_at);

  const { isLoading: isLoadingActivityLogs } = useActivities({
    page: 1,
    limit: 20,
    entity_id: id,
  });

  const { data: activitiesData } = useActivityList({
    page: 1,
    limit: 50,
    lead_id: id,
  });
  // The 50 most recent rows are enough for "last touch", but NOT for "next
  // activity": an open item scheduled months ago (the meeting that was
  // never closed) falls off that window, and the sidebar then named a
  // different next step from the Planned slot below it. Fetch the open
  // set too and merge, so both read the same truth.
  const { data: openActivitiesData } = useActivityList({
    page: 1,
    limit: 50,
    lead_id: id,
    open_only: true,
  });
  const activities = useMemo(() => {
    const byId = new Map<string, Activity>();
    for (const a of [
      ...(activitiesData?.data ?? []),
      ...(openActivitiesData?.data ?? []),
    ]) {
      if (!byId.has(a.id)) byId.set(a.id, a);
    }
    return Array.from(byId.values());
  }, [activitiesData, openActivitiesData]);

  const { data: qualificationData } = useLeadQualification(id);
  const qualification = qualificationData?.data;
  const updateLead = useUpdateLead();
  const openWithValues = useAddDealModalStore((s) => s.openWithValues);

  const handleConvertToDeal = () => {
    if (!lead) return;

    const items: {
      description: string;
      quantity: number;
      discount: number;
      unit_price: number;
    }[] = [];
    if (qualification?.has_needs && qualification.needs) {
      qualification.needs.split(",").forEach((need) => {
        items.push({
          description: need.trim(),
          quantity: 1,
          discount: 0,
          unit_price: 0,
        });
      });
    }

    openWithValues({
      lead_id: lead.id,
      title: lead.lead_name,
      school_id: lead?.school?.id || "",
      description: lead.notes || "",
      value: Number(lead.estimated_value) || 0,
      assigned_to: lead.assignee?.id,
      isLeadReadOnly: true,
      isAssignedToReadOnly: true,
      isConverting: true,
      items: items.length > 0 ? items : undefined,
    });
  };

  const handleDealCreated = () => {
    updateLead.mutate(
      { id, data: { status: "Converted" } as any },
      {
        onSuccess: () => {
          toast.success("Lead converted to deal successfully");
        },
      },
    );
  };

  // Determine lead status states
  const isNew = lead?.status === "New";
  const isContacted = lead?.status === "Contacted";
  const isNurtured = lead?.status === "Nurture";
  const isQualified = lead?.status === "Qualified";
  const isConverted = lead?.status === "Converted";
  const isTerminal = lead ? isTerminalStatus(lead.status) : false;
  const isReadonly = isLeadReadonly(lead?.status);
  const isAssignee = !!currentUserId && lead?.assignee?.id === currentUserId;
  const canRequestReversal =
    isConverted && (isAssignee || canAdminOrSalesManager);

  const pendingReversalRequest =
    reversalRequests.find((request) => request.status === "pending") || null;
  // UX fix: a rep needs to know which kind of approval is in flight so
  // they don't keep submitting duplicates or wonder why they can't
  // disqualify / reassign. Surface kind-aware "Awaiting" badges.
  const pendingTacticalDisqualify =
    reversalRequests.find(
      (r) => r.status === "pending" && r.kind === "tactical_disqualify",
    ) || null;
  const pendingReassignment =
    reversalRequests.find(
      (r) => r.status === "pending" && r.kind === "reassignment",
    ) || null;
  const deepLinkedReversalRequestId = searchParams.get("reversalRequestId");
  const deepLinkedReversalRequest =
    reversalRequests.find((request) => request.id === deepLinkedReversalRequestId) ||
    null;
  const reviewableReversalRequest =
    deepLinkedReversalRequest || pendingReversalRequest;

  // Check if qualification is complete (all BANT criteria met)
  const isQualificationComplete =
    qualification?.has_budget &&
    qualification?.has_influential_contact &&
    qualification?.has_needs &&
    qualification?.has_timeline &&
    !!qualification?.decision_maker_name;

  // Show conditions for different actions
  const showMarkContacted = isNew;
  const showCompleteQualification =
    (isContacted || isNurtured) && !isQualificationComplete;
  const showQualify = (isContacted || isNurtured) && isQualificationComplete;
  const showNurture = isContacted || isNurtured || isQualified;
  // A Converted lead must never offer conversion again — the server would
  // reject it ("already converted") and the button contradicts the status
  // badge sitting right next to it. Converted leads link to their deal.
  const showConvert = isQualified && !isConverted;
  // Most recent deal, if several exist (re-conversions after reversal).
  const convertedDeal = isConverted
    ? [...(lead?.deals ?? [])].sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      )[0]
    : undefined;
  const showDisqualify = !isTerminal;
  const showStandardActions = !isTerminal;
  const showHeaderActions = showStandardActions || isConverted;

  useEffect(() => {
    if (!deepLinkedReversalRequestId) return;
    if (!canApproveReversalRequest) return;
    if (isLoadingReversalRequests) return;
    if (!deepLinkedReversalRequest) return;

    setReviewReversalOpen(true);
  }, [
    canApproveReversalRequest,
    deepLinkedReversalRequest,
    deepLinkedReversalRequestId,
    isLoadingReversalRequests,
  ]);

  const clearReversalQueryParam = () => {
    if (!searchParams.has("reversalRequestId")) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("reversalRequestId");
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleReviewDialogOpenChange = (open: boolean) => {
    setReviewReversalOpen(open);
    if (!open) {
      clearReversalQueryParam();
    }
  };

  if (isLoading || isLoadingActivityLogs) {
    return (
      <div>
        <PageHeader hasBackButton title="Loading..." />
        <Container className="p-4">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </Container>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div>
        <PageHeader hasBackButton title="Error" />
        <Container className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading Lead</AlertTitle>
            <AlertDescription>
              {error instanceof Error
                ? error.message
                : "Failed to load lead details."}
            </AlertDescription>
          </Alert>
        </Container>
      </div>
    );
  }

  // `schoolCity`, `schoolProvince`, `assigneeName` derivations were
  // consumed only by the retired PageHeader subtitle row. The same
  // values live on the LeadAtAGlance left pane, so nothing else on
  // this page reads them.

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-64px)] lg:overflow-hidden">
      <PageHeader
        hasBackButton
        wide
        eyebrow="Lead"
        // IDENTITY TRIM — same product rule as Deal detail. The
        // previous header rendered status / temperature / SLA-breach
        // badges under the name and a subtitle row with city,
        // province, source, and assignee. Every one of those values
        // is already on the LeadAtAGlance summary in the left pane,
        // and SLA breaches are surfaced via the standalone
        // PulsingAlert right above LeadAtAGlance. Duplicating them
        // above the workspace violated LEFT=context / RIGHT=work.
        title={
          <span
            className="font-semibold text-xl tracking-tight truncate"
            title={lead.lead_name}
          >
            {lead.lead_name}
          </span>
        }
        actions={
          showHeaderActions && (
            <div className="flex items-center gap-2">
              {showStandardActions && (
                <>
                  {canReassignLead && (
                    <Button
                      variant="outline"
                      onClick={() => setReassignOpen(true)}
                    >
                      <User className="mr-2 h-4 w-4" />
                      Reassign
                    </Button>
                  )}
                  {/* Phase C.1 — rep-side request paths. Hidden for
                      managers/admins (they have direct authority
                      above) and for terminal leads. The compliance
                      gate on the server still enforces; these just
                      give the rep a UI to ask for approval. When a
                      pending request of that kind already exists,
                      show an "Awaiting…" badge instead of the button
                      so reps don't double-submit. */}
                  {!canReassignLead && (
                    pendingReassignment ? (
                      <Badge
                        variant="outline"
                        className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900"
                        title={`Submitted ${pendingReassignment.created_at ? new Date(pendingReassignment.created_at).toLocaleString() : ""} — waiting for manager`}
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        Reassignment awaiting approval
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setRequestReassignOpen(true)}
                        data-testid="lead-request-reassign-btn"
                      >
                        <User className="mr-2 h-4 w-4" />
                        Request Reassignment
                      </Button>
                    )
                  )}
                  {!canReassignLead && (
                    pendingTacticalDisqualify ? (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900"
                        title={`Submitted ${pendingTacticalDisqualify.created_at ? new Date(pendingTacticalDisqualify.created_at).toLocaleString() : ""} — waiting for manager`}
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        Disqualify awaiting approval
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setRequestTacticalOpen(true)}
                        data-testid="lead-request-tactical-btn"
                      >
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        Request Disqualify Approval
                      </Button>
                    )
                  )}
                  {/* Phase 5 — reps and managers both see Escalate so
                      it's in the same place regardless of role. The
                      button is hidden once the lead is terminal. */}
                  {!hasOpenEscalation ? (
                    <Button
                      variant="outline"
                      className="border-amber-500/60 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                      onClick={() => setEscalateOpen(true)}
                    >
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Escalate
                    </Button>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900"
                    >
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Escalation open
                    </Badge>
                  )}
                  {/* Demo + Commercial-Intent badges. Surface lifecycle
                      state at the top of the lead page so reps see at a
                      glance whether a demo is scheduled / done and
                      whether the lead has cleared the commercial-intent
                      bar. */}
                  {lead.demo_status === 'demo_scheduled' && (
                    <Badge
                      variant="outline"
                      className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900"
                    >
                      <Clock className="mr-1 h-3 w-3" />
                      Demo Scheduled
                    </Badge>
                  )}
                  {lead.demo_status === 'demo_completed' && (
                    <Badge
                      variant="outline"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900"
                    >
                      <ListCheck className="mr-1 h-3 w-3" />
                      Demo Completed
                    </Badge>
                  )}
                  {lead.commercial_intent && (
                    <Badge
                      variant="outline"
                      className="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900"
                      title={
                        lead.commercial_intent_reason
                          ? `Triggered by: ${lead.commercial_intent_reason}`
                          : undefined
                      }
                    >
                      <ListCheck className="mr-1 h-3 w-3" />
                      Commercial Intent
                    </Badge>
                  )}
                  {lead.demo_followup_sla_breached && (
                    <Badge
                      variant="outline"
                      className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900"
                      title="Demo Delivery completed but no follow-up logged within SLA — notes don't count"
                    >
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Demo Follow-up Overdue
                    </Badge>
                  )}
                  {showMarkContacted && (
                    <Button onClick={() => setMarkContactedOpen(true)}>
                      <Phone className="mr-2 h-4 w-4" />
                      Mark Contacted
                    </Button>
                  )}
                  {showCompleteQualification && (
                    <Button
                      variant="outline"
                      className="border-green-500 text-green-500 hover:border-green-500/80 hover:text-green-500/80"
                      onClick={() => setQualificationOpen(true)}
                    >
                      <ListCheck className="mr-2 h-4 w-4" />
                      Complete Qualification
                    </Button>
                  )}
                  {showNurture && (
                    <Button
                      variant="outline"
                      onClick={() => setNurtureOpen(true)}
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      Nurture Lead
                    </Button>
                  )}

                  {(showQualify || showNurture) && (
                    <Button variant="outline" asChild>
                      <Link
                        to={`/quotes/new?leadId=${lead.id}&schoolId=${lead.school?.id}`}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Create Quote
                      </Link>
                    </Button>
                  )}

                  {showQualify && <QualifyLeadDialog lead={lead} />}

                  {showDisqualify && (
                    <DisqualifyLeadDialog
                      // open={disqualifyOpen}
                      //onOpenChange={setDisqualifyOpen}
                      lead={lead}
                    />
                  )}
                </>
              )}

              {showConvert && (
                <Button onClick={handleConvertToDeal}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Convert to Deal
                </Button>
              )}

              {isConverted && (
                <>
                  {convertedDeal && (
                    <Button asChild>
                      <Link to={`/deals/${convertedDeal.id}`}>
                        <ArrowRightLeft className="mr-2 h-4 w-4" />
                        View Deal
                      </Link>
                    </Button>
                  )}
                  {canRequestReversal && !pendingReversalRequest && (
                    <Button
                      variant="outline"
                      onClick={() => setRequestReversalOpen(true)}
                      disabled={isLoadingReversalRequests}
                    >
                      <Undo2 className="mr-2 h-4 w-4" />
                      Request Reversal
                    </Button>
                  )}

                  {canApproveReversalRequest && reviewableReversalRequest && (
                    <Button
                      onClick={() => setReviewReversalOpen(true)}
                      disabled={isLoadingReversalRequests}
                    >
                      <Undo2 className="mr-2 h-4 w-4" />
                      Review Reversal Request
                    </Button>
                  )}
                </>
              )}

              <ConvertLeadDialog
                open={convertOpen}
                onOpenChange={setConvertOpen}
                leadId={id}
                leadName={lead?.lead_name || ""}
                leadNotes={lead?.notes}
                estimatedValue={lead?.estimated_value}
                assigneeId={lead?.assignee?.id}
                qualificationNeeds={qualification?.needs ?? ""}
                hasNeeds={qualification?.has_needs}
              />
            </div>
          )
        }
      />
      {/* Lead Action Dialogs */}
      <MarkContactedDialog
        open={markContactedOpen}
        onClose={() => setMarkContactedOpen(false)}
        lead={lead}
      />
      <RecordDetailLayout
        fillViewport={false}
        className="flex-1 min-h-0"
        left={
          <>
            {lead.status === "Disqualified" ? (
              <Alert className="border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40">
                <AlertTitle>Archived — disqualified</AlertTitle>
                <AlertDescription>
                  This lead is no longer a potential deal. It is out of All
                  Leads, the totals, SLA alerts and the lead pickers, and no
                  next step is owed on it. Its history stays readable here.
                  {(lead.reason ?? "").trim() !== "" && (
                    <>
                      {" "}
                      <span className="font-medium">Why:</span> {lead.reason}
                    </>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              lead.sla_breached && (
                <PulsingAlert
                  title="SLA Breached"
                  icon={TriangleAlert}
                  description="This lead has exceeded the allowed response time. Please take action immediately."
                />
              )
            )}
            {isConverted && pendingReversalRequest && (
              <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/10">
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Reversal Request Pending</p>
                    <Badge variant="outline">Pending</Badge>
                  </div>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Requested by:</span>{" "}
                    {formatReversalRequester(pendingReversalRequest)}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Requested at:</span>{" "}
                    {formatOptionalDateTime(pendingReversalRequest.created_at)}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Target status:</span>{" "}
                    {pendingReversalRequest.requested_status}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Reason:</span>{" "}
                    {pendingReversalRequest.reason}
                  </p>
                </CardContent>
              </Card>
            )}
            <LeadAtAGlance
              layout="stack"
              lead={lead}
              qualification={qualification}
              activities={activities}
              onEditQualification={
                !isReadonly && lead.status !== "New"
                  ? () => setQualificationOpen(true)
                  : undefined
              }
            />
            {/* Phase 9 + 10 — hygiene score and compliance checklist
                live in the same left-pane "context" column so reps
                see every discipline signal in one scroll. */}
            <LeadControlPanel
              lead={lead}
              qualification={qualification}
              activities={activities}
              hasOpenEscalation={hasOpenEscalation}
            />
          </>
        }
        right={
          <Tabs defaultValue="activity" className="w-full">
            {/* Activity is now the default. Overview + Tasks tabs
                retired — overview lives on the left pane, tasks are
                a filterable activity type inside the workspace. The
                tab strip sticks to the top of the right pane so reps
                can scroll a long activity feed without losing the
                content-type switch. */}
            <div className="sticky top-0 z-10 -mx-3 md:-mx-4 px-3 md:px-4 py-1.5 bg-background/95 backdrop-blur-sm border-b">
              <TabsList className="w-full justify-start overflow-x-auto bg-transparent">
                <TabsTrigger value="activity">Activity</TabsTrigger>
                {/* Fast-paths into the same engagement workspace
                    pre-filtered by activity type so reps can jump
                    straight to a single conversation surface. Same
                    pattern used on Deal detail so the bar reads the
                    same across record pages. */}
                {/* Calls / Emails used to sit here too, but they are
                    activity types — they now live in the composer's own
                    type strip under Activity, so there is exactly one
                    place to log them. Notes keep their own tab because a
                    note isn't an activity (no follow-up, no outcome). */}
                <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="files">
                <Paperclip className="h-4 w-4 mr-2" />
                Files
              </TabsTrigger>
              <TabsTrigger value="people">
                <Users className="h-4 w-4 mr-2" />
                People
              </TabsTrigger>
              <TabsTrigger value="timeline">Qualification</TabsTrigger>
            {lead.pending_approval && (
              <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>
                  {lead.pending_approval.kind === "tactical_disqualify"
                    ? "Disqualification is waiting for approval"
                    : "This lead has a request waiting for approval"}
                </AlertTitle>
                <AlertDescription>
                  {lead.pending_approval.reason ? (
                    <span>Reason given: {lead.pending_approval.reason}. </span>
                  ) : null}
                  {lead.pending_approval.waiting_on === "rep"
                    ? "A manager has asked for more information — the rep needs to answer before this can be decided."
                    : "Waiting on a sales manager to decide."}
                  {lead.pending_approval.enquiry_count > 0
                    ? ` ${lead.pending_approval.enquiry_count} message(s) on the thread.`
                    : ""}
                </AlertDescription>
              </Alert>
            )}
              <TabsTrigger value="costs">Costs</TabsTrigger>
              </TabsList>
            </div>

            <div className="mt-3">
              {/* Activity opens the composer with the type strip visible
                  so a rep can pick what they're logging, exactly like the
                  Pipedrive detail view. The full log sits underneath. */}
              <TabsContent value="activity">
                <ActivitiesTab
                  leadId={lead.id}
                  isReadonly={isReadonly}
                  composeType="call"
                  defaultAssigneeId={lead.assignee?.id}
                />
              </TabsContent>

              {/* These tabs used to FILTER the activity log to a single
                  type, which meant the only way to write anything was the
                  separate create modal. They now open the inline composer
                  on that type instead — the log below stays complete, so
                  the rep keeps the whole conversation in view while
                  writing. Saved work lands in the Planned section. */}
              <TabsContent value="notes">
                <ActivitiesTab
                  leadId={lead.id}
                  isReadonly={isReadonly}
                  composeType="note"
                  defaultAssigneeId={lead.assignee?.id}
                />
              </TabsContent>


              <TabsContent value="files">
                <FilesTab
                  entityId={lead.id}
                  entity="lead"
                  isReadonly={isReadonly}
                />
              </TabsContent>

              <TabsContent value="costs">
                {/* Same panel the deal page uses; the requisition
                    model links to either record. Read-only once the
                    lead is converted/terminal — costs from then on
                    belong on the deal. */}
                <DealCostsSection leadId={lead.id} readOnly={isReadonly} />
              </TabsContent>

              <TabsContent value="people">
                <PeopleTab lead={lead} />
              </TabsContent>

              <TabsContent value="timeline">
                <TimelineTab
                  lead={lead}
                  isTerminal={isTerminal}
                  onEditQualification={
                    isReadonly ? undefined : () => setQualificationOpen(true)
                  }
                />
              </TabsContent>


            </div>
          </Tabs>
        }
      />

      <LeadQualificationModal
        isOpen={qualificationOpen}
        onClose={() => setQualificationOpen(false)}
        leadId={id}
      />

      <NurtureLeadDialog
        open={nurtureOpen}
        onClose={() => setNurtureOpen(false)}
        lead={lead}
      />

      <AssignLeadsDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        leadIds={[lead.id]}
        leadSummaryText={`${lead.lead_name} (${lead.school?.name ?? ""})`}
      />

      <RequestReversalDialog
        leadId={lead.id}
        leadName={lead.lead_name}
        open={requestReversalOpen}
        onOpenChange={setRequestReversalOpen}
      />

      <ReviewReversalRequestDialog
        request={reviewableReversalRequest}
        open={reviewReversalOpen}
        onOpenChange={handleReviewDialogOpenChange}
      />

      <EscalateLeadDialog
        leadId={lead.id}
        leadName={lead.lead_name}
        open={escalateOpen}
        onOpenChange={setEscalateOpen}
      />

      <RequestTacticalDisqualifyDialog
        leadId={lead.id}
        leadName={lead.lead_name}
        open={requestTacticalOpen}
        onOpenChange={setRequestTacticalOpen}
      />

      <RequestReassignmentDialog
        leadId={lead.id}
        leadName={lead.lead_name}
        currentAssigneeId={lead.assigned_to ?? null}
        currentUserId={currentUserId}
        open={requestReassignOpen}
        onOpenChange={setRequestReassignOpen}
      />

      <AddDealModalContainer onDealCreated={handleDealCreated} />
    </div>
  );
};
