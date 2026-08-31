import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { subMonths, format, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { KpiPill } from "~/components/layout/kpi-pill";
import PipelinesSelector from "~/components/pipelines-selector";
import PipelineKanban from "~/components/pipeline/pipeline-kanban";
import PipelineTable from "~/components/pipeline/pipeline-table";
import { Card } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Target,
  DollarSign,
  Clock,
  Users,
  Flame,
  Plus,
  LayoutGrid,
  LayoutList,
  Trophy,
  CalendarIcon,
  AlertTriangle,
} from "lucide-react";
import {
  useDealsSummary,
  useBulkUpdateDeals,
  useDeleteDeal,
  type Deal,
  usePipelineDeals,
  useArchivedDeals,
} from "~/api/deals";
import {
  type DealRollbackRequest,
  useDealRollbackRequests,
} from "~/api/deal-rollback-requests";
import { usePipelineStages, type Stage } from "~/api/pipelines";
import { useCheckDealSlaBreaches, useDealSlaBreaches } from "~/api/sla";
import PulsingAlert from "~/components/alerts/pusling-alert";
import { useCurrency } from "~/hooks/use-currency";
import { useAnyRole } from "~/hooks/use-permission";
import { toast } from "sonner";
import { Skeleton } from "~/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import AddDealModalContainer from "~/components/deals/add-deal-modal-container";
import { PendingDealRollbackRequestsCard } from "~/components/deals/pending-deal-rollback-requests-card";
import { RequestDealRollbackDialog } from "~/components/deals/request-deal-rollback-dialog";
import { ReviewDealRollbackRequestDialog } from "~/components/deals/review-deal-rollback-request-dialog";
import { useAddDealModalStore } from "~/stores/use-add-deal-modal-store";
import {
  formatDealStageBlock,
  type BlockedActionMessage,
} from "~/lib/blocked-action-messages";

type ViewMode = "kanban" | "list";

interface RollbackRequestContext {
  deal: Deal;
  fromStage: Stage;
  toStage: Stage;
}

export default function PipelineStagesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const canRunSlaCheck = useAnyRole([
    "admin",
    "sales_manager",
    "sale_manager",
    "manager",
  ]);
  const canReviewRollbacks = useAnyRole([
    "admin",
    "sales_manager",
    "sale_manager",
  ]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>();
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [showWonLost, setShowWonLost] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subMonths(new Date(), 6),
    to: new Date(),
  });
  const [rollbackRequestContext, setRollbackRequestContext] =
    useState<RollbackRequestContext | null>(null);
  const [reviewRequest, setReviewRequest] =
    useState<DealRollbackRequest | null>(null);
  const [stageMoveError, setStageMoveError] =
    useState<BlockedActionMessage | null>(null);

  const { data: summary } = useDealsSummary(selectedPipelineId);
  const { data: stagesData, isLoading: stagesLoading } = usePipelineStages(
    selectedPipelineId || "",
  );
  const { data: dealsData, isLoading: dealsLoading } = usePipelineDeals(
    selectedPipelineId ?? "",
  );
  const archivedDealsParams = useMemo(() => {
    if (!showWonLost || !selectedPipelineId || !dateRange.from || !dateRange.to) {
      return null;
    }

    return {
      pipeline_id: selectedPipelineId,
      page: 1,
      limit: 100,
      date_from: startOfDay(dateRange.from).toISOString(),
      date_to: endOfDay(dateRange.to).toISOString(),
    };
  }, [dateRange.from, dateRange.to, selectedPipelineId, showWonLost]);
  const { data: archivedDealsData } =
    useArchivedDeals(archivedDealsParams, {
      enabled: Boolean(archivedDealsParams),
      fetchAllPages: true,
    });
  const { data: dealBreaches } = useDealSlaBreaches();
  const { data: pendingRollbackRequests = [] } = useDealRollbackRequests(
    {
      status: "pending",
      pipeline_id: selectedPipelineId || undefined,
    },
    { enabled: canReviewRollbacks },
  );
  useCheckDealSlaBreaches({ enabled: canRunSlaCheck });

  const bulkUpdate = useBulkUpdateDeals();
  const deleteDeal = useDeleteDeal();

  const stages = stagesData?.data || [];
  const deals = dealsData?.data || [];
  const archivedDeals = archivedDealsData?.data || [];
  const breachedDealsCount = dealBreaches?.data?.totalBreached ?? 0;

  const pipelineSummary = summary?.data || {
    total_deals: 0,
    pipeline_value: 0,
    deals_with_overdue_invoices: 0,
    avg_deal_health: 0,
  };

  // Build pipelineStages with deals grouped by stage
  const pipelineStages = useMemo((): (Stage & { deals: Deal[] })[] => {
    const stageMap = new Map<string, Deal[]>();

    // Initialize all stages
    for (const stage of stages) {
      stageMap.set(stage.name, []);
    }

    // Group deals into stages. A deal whose stage is NOT in the active
    // list is not dropped — it is collected so a retired column can be
    // rendered for it below. Silently skipping them is what let a
    // retired stage hide 12 open deals worth $148,200 while the pipeline
    // header kept counting them: the board summed $100,500 and the header
    // read $248,700, and nobody could see the difference.
    const strandedByStage = new Map<string, { stage: Stage; deals: Deal[] }>();
    for (const deal of deals) {
      const stage = stages.find((s) => s.id === deal.current_stage_id);
      if (stage) {
        stageMap.get(stage.name)?.push(deal);
        continue;
      }
      const stageId = deal.current_stage_id;
      if (!stageId) continue;
      const existing = strandedByStage.get(stageId);
      if (existing) {
        existing.deals.push(deal);
        continue;
      }
      // The deals API embeds the stage row, so a retired column can be
      // drawn with its real name, colour and order even though the
      // active-stages endpoint no longer returns it.
      const embedded = (deal as Deal & { current_stage?: Stage })
        .current_stage;
      strandedByStage.set(stageId, {
        stage: {
          ...(embedded ?? ({} as Stage)),
          id: stageId,
          pipeline_id: selectedPipelineId || "",
          name: embedded?.name || deal.currentStatus || "Retired stage",
          order: embedded?.order ?? 0,
          sla_days: 0,
          probability: embedded?.probability ?? 0,
          color: embedded?.color || "#94a3b8",
          is_active: false,
          created_at: embedded?.created_at || "",
          updated_at: embedded?.updated_at || "",
        } as Stage,
        deals: [deal],
      });
    }

    const regularStages = stages.map((stage) => ({
      ...stage,
      deals: stageMap.get(stage.name) || [],
    }));

    // Retired-but-occupied columns sit at the end of the live board, in
    // stage order, so the work in them is visible and can be dragged out.
    const retiredStages = [...strandedByStage.values()]
      .sort((a, b) => a.stage.order - b.stage.order)
      .map(({ stage, deals: stageDeals }) => ({ ...stage, deals: stageDeals }));

    if (!showWonLost) {
      return [...regularStages, ...retiredStages];
    }

    const wonDeals: Deal[] = [];
    const lostDeals: Deal[] = [];

    for (const deal of archivedDeals) {
      const closeStatus = String(
        (deal as Deal & { close_status?: string }).closeStatus ??
          (deal as Deal & { close_status?: string }).close_status ??
          "",
      ).toLowerCase();

      if (closeStatus === "won") {
        wonDeals.push(deal);
      } else if (closeStatus === "lost") {
        lostDeals.push(deal);
      }
    }

    const maxOrder = regularStages.length
      ? Math.max(...regularStages.map((stage) => stage.order))
      : 0;

    return [
      ...regularStages,
      ...retiredStages,
      {
        id: "__won",
        pipeline_id: selectedPipelineId || "",
        name: "Won",
        order: maxOrder + 1,
        sla_days: 0,
        probability: 100,
        color: "#22c55e",
        is_active: true,
        created_at: "",
        updated_at: "",
        deals: wonDeals,
      },
      {
        id: "__lost",
        pipeline_id: selectedPipelineId || "",
        name: "Lost",
        order: maxOrder + 2,
        sla_days: 0,
        probability: 0,
        color: "#ef4444",
        is_active: true,
        created_at: "",
        updated_at: "",
        deals: lostDeals,
      },
    ];
  }, [stages, deals, showWonLost, archivedDeals, selectedPipelineId]);

  const handleOnPipelineChange = useCallback(
    (updates: { id: string; position: number; status: string }[]) => {
      if (updates.length === 0) return;
      bulkUpdate.mutate(
        { deals: updates },
        {
          onSuccess: () => {
            setStageMoveError(null);
          },
          onError: (error) => {
            const message = formatDealStageBlock(error, updates[0]?.status);
            setStageMoveError(message);
            toast.error(message.title, {
              description: message.description,
            });
            queryClient.invalidateQueries({ queryKey: ["deals"] });
          },
        },
      );
    },
    [bulkUpdate, queryClient],
  );

  const handleEditDeal = useCallback(
    (deal: Deal) => {
      navigate(`/deals/${deal.id}/edit`);
    },
    [navigate],
  );

  const handleRequestRollback = useCallback((context: RollbackRequestContext) => {
    setRollbackRequestContext(context);
  }, []);

  const handleDeleteDeal = useCallback(
    (dealId: string) => {
      if (confirm("Are you sure you want to delete this deal?")) {
        deleteDeal.mutate(dealId, {
          onSuccess: () => toast.success("Deal deleted"),
          onError: () => toast.error("Failed to delete deal"),
        });
      }
    },
    [deleteDeal],
  );

  const isLoading =
    stagesLoading || dealsLoading

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="shrink-0 w-75">
              <Skeleton className="h-16 mb-3" />
              <Skeleton className="h-125" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="px-3 md:px-4 pt-2 pb-3 space-y-2 overflow-x-hidden">
        {/* KPI strip — compact pill-style tiles so the pipeline sits
            higher on the screen and reps see Kanban columns without
            scrolling. Was an oversized 4-up card grid. */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <KpiPill
            label="Total deals"
            value={String(pipelineSummary.total_deals)}
            icon={<Target className="h-3.5 w-3.5 text-primary" />}
            accent="bg-primary/10"
          />
          <KpiPill
            label="Pipeline value"
            value={formatCurrency(pipelineSummary.pipeline_value)}
            icon={<DollarSign className="h-3.5 w-3.5 text-[oklch(0.5_0.16_150)] dark:text-[oklch(0.72_0.17_150)]" />}
            accent="bg-[oklch(0.64_0.17_150_/_0.12)]"
          />
          {/* `deal.value` is typed `number` on the client but the API sends a
              STRING: the column is @Column({ type: 'decimal' }) with no
              transformer, and TypeORM returns Postgres numerics as strings.
              So `acc + cur.value` concatenated instead of adding — 0 + "39000.00"
              is "039000.00", the next one appends, and Intl.format of that is
              NaN. Hence "ZARNaN" on the Won and Lost tiles. One closed deal
              would have looked right by accident. Coerce before adding. */}
          {showWonLost && (
            <>
              <KpiPill
                label="Won"
                value={formatCurrency(
                  (archivedDealsData?.data || [])
                    .filter((deal) => deal.closeStatus === "won")
                    .reduce((acc, cur) => acc + (Number(cur.value) || 0), 0),
                )}
              />
              <KpiPill
                label="Lost"
                value={formatCurrency(
                  (archivedDealsData?.data || [])
                    .filter((deal) => deal.closeStatus === "lost")
                    .reduce((acc, cur) => acc + (Number(cur.value) || 0), 0),
                )}
              />
            </>
          )}
          <KpiPill
            label="Overdue"
            value={String(pipelineSummary.deals_with_overdue_invoices)}
            icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" />}
            accent="bg-muted"
          />
          <KpiPill
            label="Avg health"
            value={`${pipelineSummary.avg_deal_health}%`}
            icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
            accent="bg-muted"
          />
        </div>

        {breachedDealsCount > 0 && (
          <PulsingAlert
            icon={Flame}
            title="Deal SLA Breach Alert"
            description={`${breachedDealsCount} deal${breachedDealsCount > 1 ? "s have" : " has"} exceeded stage SLA and ${breachedDealsCount > 1 ? "require" : "requires"} immediate attention`}
          />
        )}

        {canReviewRollbacks && pendingRollbackRequests.length > 0 && (
          <PendingDealRollbackRequestsCard
            requests={pendingRollbackRequests}
            onReview={setReviewRequest}
          />
        )}

        {/* Pipeline Controls — selector lives inline with the
            create/view toggles instead of in a dedicated header row
            above, so no horizontal band of empty space sits between
            the topbar and the KPI strip. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => useAddDealModalStore.getState().onOpen()}>
              <Plus className="mr-2 h-4 w-4" />
              Create Deal
            </Button>
            <PipelinesSelector
              value={selectedPipelineId}
              onValueChange={setSelectedPipelineId}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Won & Lost toggle */}
            <Button
              variant={showWonLost ? "default" : "outline"}
              size="sm"
              onClick={() => setShowWonLost(!showWonLost)}
            >
              <Trophy className="mr-2 h-4 w-4" />
              Won & Lost
            </Button>

            {showWonLost && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from && dateRange.to
                      ? `${format(dateRange.from, "MMM dd")} - ${format(dateRange.to, "MMM dd, yyyy")}`
                      : "Select date range"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => {
                      if (range) setDateRange(range);
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            )}

            <div className="border-l h-6 mx-1" />

            {/* View toggle */}
            <Button
              variant={viewMode === "kanban" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("kanban")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("list")}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {stageMoveError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{stageMoveError.title}</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{stageMoveError.description}</p>
              {stageMoveError.missingItems.length > 0 && (
                <ul className="list-disc space-y-1 pl-4">
                  {stageMoveError.missingItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Kanban / List */}
        {viewMode === "kanban" && (
          <div className="max-w-full overflow-hidden">
            <PipelineKanban
              onChange={handleOnPipelineChange}
              onEditDeal={handleEditDeal}
              onDeleteDeal={handleDeleteDeal}
              onRequestRollback={handleRequestRollback}
              pipelineStages={pipelineStages}
              // showWonLost={showWonLost}
              isLoading={isLoading}
            />
          </div>
        )}
        {viewMode === "list" && (
          <Card className="max-w-full overflow-hidden">
            <PipelineTable
              pipelineStages={pipelineStages}
              onView={(deal) => navigate(`/deals/${deal.id}`)}
              onEdit={handleEditDeal}
              onDelete={(deal) => handleDeleteDeal(deal.id)}
            />
          </Card>
        )}
      </section>
      <AddDealModalContainer />
      <RequestDealRollbackDialog
        deal={rollbackRequestContext?.deal ?? null}
        fromStage={rollbackRequestContext?.fromStage ?? null}
        toStage={rollbackRequestContext?.toStage ?? null}
        open={!!rollbackRequestContext}
        onOpenChange={(open) => {
          if (!open) setRollbackRequestContext(null);
        }}
      />
      <ReviewDealRollbackRequestDialog
        request={reviewRequest}
        open={!!reviewRequest}
        onOpenChange={(open) => {
          if (!open) setReviewRequest(null);
        }}
      />
    </>
  );
}
