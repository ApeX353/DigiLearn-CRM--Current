import { useParams, Link, useSearchParams } from "react-router";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Badge } from "~/components/ui/badge";
import { useLead, isTerminalStatus } from "~/api/leads";
import {
  OverviewTab,
  TasksTab,
  NotesTab,
  PeopleTab,
  TimelineTab,
} from "~/components/leads/tabs";
import { ActivitiesTab } from "~/components/activities/activities-tab";
import {
  Loader2,
  AlertCircle,
  MapPin,
  TriangleAlert,
  Activity,
  User,
  Calendar1,
  ListCheck,
  Users,
  Paperclip,
  ArrowRightLeft,
  Phone,
  Clock,
  FileText,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LeadQualificationModal } from "~/components/leads/lead-qualification-modal";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import PulsingAlert from "~/components/alerts/pusling-alert";
import { Card, CardContent } from "~/components/ui/card";
import { format } from "date-fns";
import { useActivities } from "~/api/activities";
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
} from "~/components/leads/lead-actions";
import { FilesTab } from "~/components/deals/tabs/files-tab";
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

  const { data: leadData, isLoading, error } = useLead(id);
  const lead = leadData?.data;
  const currentUserId = useAuthStore((state) => state.user?.id);
  const canAdminOrSalesManager = useAnyRole(["admin", "sales_manager"]);
  const canReassignLead = canAdminOrSalesManager;
  const canApproveReversalRequest = canAdminOrSalesManager;
  const { data: reversalRequests = [], isLoading: isLoadingReversalRequests } =
    useLeadReversalRequests(id);

  const { isLoading: isLoadingActivityLogs } = useActivities({
    page: 1,
    limit: 20,
    entity_id: id,
  });

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
  const showConvert = isQualified || isConverted;
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

  const schoolCity = lead.school?.city || "--";
  const schoolProvince = lead.school?.province || "--";
  const assigneeName =
    [lead.assignee?.first_name, lead.assignee?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "--";

  return (
    <div>
      <PageHeader
        hasBackButton
        title={
          <div className="flex items-center gap-2">
            <h3 className="text-xl">{lead.lead_name}</h3>
            <Badge>{lead.status}</Badge>
            {lead.sla_breached && (
              <Badge variant="destructive">SLA Breached</Badge>
            )}
          </div>
        }
        subtitle={
          <div className="flex items-center gap-2 ">
            <div className="flex items-center text-muted-foreground">
              <MapPin className="h-4 w-4 mr-2" />
              <p className="text-sm">
                {schoolCity}, {schoolProvince}
              </p>
            </div>
            <Badge variant="outline">{lead.source}</Badge>
          </div>
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
      <Container className="p-4 space-y-6">
        {lead.sla_breached && (
          <PulsingAlert
            title="SLA Breached"
            icon={TriangleAlert}
            description="This lead has exceeded the allowed response time. Please take action immediately."
          />
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
                {formatOptionalDateTime(pendingReversalRequest.requested_at)}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Target status:</span>{" "}
                {pendingReversalRequest.target_status}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Reason:</span>{" "}
                {pendingReversalRequest.reason}
              </p>
            </CardContent>
          </Card>
        )}
        <div className="grid md:grid-cols-4 grid-cols-2 gap-4">
          <Card>
            <CardContent className="space-y-2">
              <p className="text-muted-foreground font-semibold">Location</p>
              <div className="flex items-center">
                <MapPin className="h-4 w-4 mr-2" />
                {lead?.school?.city}
              </div>
              <p>{lead?.school?.province}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2">
              <p className="text-muted-foreground font-semibold">
                Last Activity
              </p>
              <div className="flex items-center">
                <Activity className="h-4 w-4 mr-2" />
                {lead?.last_action_at
                  ? format(lead.last_action_at, "MMM, dd")
                  : "No last activiy"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2">
              <p className="text-muted-foreground font-semibold">Assigned To</p>
              <div className="flex items-center">
                <User className="h-4 w-4 mr-2" />
                {assigneeName}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2">
              <p className="text-muted-foreground font-semibold">
                Next Follow-up
              </p>
              <div className="flex items-center">
                <Calendar1 className="h-4 w-4 mr-2" />
                Not Scheduled
              </div>
            </CardContent>
          </Card>
        </div>
        <Tabs defaultValue="overview">
          <TabsList className="">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="tasks">
              <ListCheck className="h-4 w-4 mr-2" /> Tasks
            </TabsTrigger>
            {/* <TabsTrigger value="notes">
              <FilePen className="h-4 w-4 mr-2" />
              Notes
            </TabsTrigger> */}
            <TabsTrigger value="files">
              <Paperclip className="h-4 w-4 mr-2" />
              Files
            </TabsTrigger>
            <TabsTrigger value="people">
              <Users className="h-4 w-4 mr-2" />
              People
            </TabsTrigger>
            <TabsTrigger value="timeline">Qualification</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="overview">
              <OverviewTab
                lead={lead}
                onEditQualification={
                  !isReadonly && lead.status !== "New"
                    ? () => setQualificationOpen(true)
                    : undefined
                }
              />
            </TabsContent>

            <TabsContent value="activity">
              <ActivitiesTab leadId={lead.id} isReadonly={isReadonly} />
            </TabsContent>

            <TabsContent value="tasks">
              <TasksTab lead={lead} isReadonly={isReadonly} />
            </TabsContent>

            <TabsContent value="notes">
              <NotesTab lead={lead} />
            </TabsContent>

            <TabsContent value="files">
              <FilesTab
                entityId={lead.id}
                entity="lead"
                isReadonly={isReadonly}
              />
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
      </Container>

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

      <AddDealModalContainer onDealCreated={handleDealCreated} />
    </div>
  );
};
