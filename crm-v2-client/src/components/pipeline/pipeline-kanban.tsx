import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Inbox } from "lucide-react";
import CompactDealCard from "~/components/pipeline/compact-deal-card";
import { KanbanHeader } from "~/components/pipeline/kanban-header";
import type { Deal } from "~/api/deals";
import type { Stage } from "~/api/pipelines";
import { useActivityList, type Activity } from "~/api/activities";
import { cn } from "~/lib/utils";

interface PipelineKanbanProps {
  onChange: (deals: { id: string; position: number; status: string }[]) => void;
  onEditDeal?: (deal: Deal) => void;
  onDeleteDeal?: (dealId: string) => void;
  onRequestRollback?: (request: {
    deal: Deal;
    fromStage: Stage;
    toStage: Stage;
  }) => void;
  pipelineStages: (Stage & { deals: Deal[] })[];
  isLoading?: boolean;
}

type PipelineState = Record<string, Deal[]>;

/**
 * PipelineKanban — redesigned kanban surface.
 *
 * UX improvements in this pass:
 *   - columns render on a subtle neutral surface so the deal cards visually
 *     "float" above the board
 *   - active drop target highlights with a primary-tinted ring, not a raw
 *     blue background
 *   - empty columns have a real empty state with icon + helper copy
 *   - columns are a touch wider (w-72 → w-76) and use consistent rhythm
 *   - business logic (drag, rollback, positions) is preserved 1:1
 */
export default function PipelineKanban({
  onChange,
  onEditDeal,
  onDeleteDeal,
  onRequestRollback,
  pipelineStages,
  isLoading,
}: PipelineKanbanProps) {
  const [pipelines, setPipelines] = useState<PipelineState>(() => {
    const sorted = [...pipelineStages].sort((a, b) => a.order - b.order);
    return Object.fromEntries(
      sorted.map(({ name, deals }) => [
        name,
        [...deals].sort((a, b) => (a.position || 0) - (b.position || 0)),
      ]),
    );
  });

  useEffect(() => {
    const sorted = [...pipelineStages].sort((a, b) => a.order - b.order);
    const newPipeline = Object.fromEntries(
      sorted.map(({ name, deals }) => [
        name,
        [...deals].sort((a, b) => (a.position || 0) - (b.position || 0)),
      ]),
    );
    setPipelines(newPipeline);
  }, [pipelineStages]);

  const specialStageNames = useMemo(() => {
    return new Set(
      pipelineStages
        .filter((stage) => stage.id === "__won" || stage.id === "__lost")
        .map((stage) => stage.name),
    );
  }, [pipelineStages]);

  // Single batched fetch of every open activity in the system. Capped
  // at 500 to keep the response bounded; pipeline boards rarely exceed
  // ~100 deals per stage so this is more than enough headroom and
  // avoids the N+1 trap of one query per card.
  const { data: openActivitiesData } = useActivityList({
    open_only: true,
    limit: 500,
    page: 1,
    include_details: false,
  });

  // Per-deal current stage name, so we can drop "Advance <stage>"
  // tasks whose goal is already achieved.
  const currentStageNameByDeal = useMemo(() => {
    const out = new Map<string, string>();
    for (const stage of pipelineStages) {
      for (const deal of stage.deals ?? []) {
        out.set(deal.id, stage.name);
      }
    }
    return out;
  }, [pipelineStages]);

  // Map<dealId, soonest open activity> — `null` is allowed in the map
  // to fast-fail "no next step" without re-running the find().
  //
  // Satisfied-task rule: seeded and rep-authored "Advance {Stage}"
  // tasks mark the intent to move the deal INTO that stage. Once the
  // deal has reached the stage, the task is logically satisfied — the
  // move itself is the work product. Surfacing it as an overdue next
  // step on the new column's card is misleading and was the source of
  // the "overdue doesn't change after moving the deal" behaviour.
  // Filter matches "Advance <StageName>" (case-insensitive) against
  // the deal's current stage name.
  const nextActivityByDeal = useMemo<Map<string, Activity>>(() => {
    const out = new Map<string, Activity>();
    const all = openActivitiesData?.data ?? [];
    for (const act of all) {
      if (!act.deal_id) continue;
      // Product rule: Notes are context, not a committed next step.
      // Even if a rep set a due_at on a note, the pipeline card must
      // never render "overdue note" as the deal's real next action.
      if (act.type === "note") continue;
      const due = act.due_at ?? act.scheduled_at;
      if (!due) continue;
      const currentStageName = currentStageNameByDeal.get(act.deal_id);
      if (currentStageName && act.subject) {
        const advancePattern = new RegExp(
          `\\bAdvance\\s+${currentStageName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`,
          "i",
        );
        if (advancePattern.test(act.subject)) {
          // Deal is already in the stage this task was trying to reach.
          // Skip so the card surfaces the next meaningful follow-up
          // (or "No next step" if there isn't one yet).
          continue;
        }
      }
      const existing = out.get(act.deal_id);
      if (!existing) {
        out.set(act.deal_id, act);
        continue;
      }
      const existingDue = existing.due_at ?? existing.scheduled_at;
      if (!existingDue) {
        out.set(act.deal_id, act);
        continue;
      }
      if (new Date(due).getTime() < new Date(existingDue).getTime()) {
        out.set(act.deal_id, act);
      }
    }
    return out;
  }, [openActivitiesData, currentStageNameByDeal]);

  const stageByName = useMemo(
    () => new Map(pipelineStages.map((stage) => [stage.name, stage])),
    [pipelineStages],
  );

  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;

      const { source, destination } = result;
      const sourceStatus = source.droppableId;
      const destStatus = destination.droppableId;

      if (
        specialStageNames.has(sourceStatus) ||
        specialStageNames.has(destStatus)
      ) {
        return;
      }

      const sourceStage = stageByName.get(sourceStatus);
      const targetStage = stageByName.get(destStatus);
      const movedDealCandidate = (pipelines[sourceStatus] || [])[source.index];

      if (
        onRequestRollback &&
        movedDealCandidate &&
        sourceStage &&
        targetStage &&
        sourceStage.id !== targetStage.id &&
        targetStage.order < sourceStage.order
      ) {
        onRequestRollback({
          deal: movedDealCandidate,
          fromStage: sourceStage,
          toStage: targetStage,
        });
        return;
      }

      const updatesPayload: { id: string; status: string; position: number }[] =
        [];

      setPipelines((prev) => {
        const newDeals = { ...prev };

        const sourceColumn = [...(newDeals[sourceStatus] || [])];
        const [movedDeal] = sourceColumn.splice(source.index, 1);
        if (!movedDeal) return prev;

        // Optimistic update of the dragged deal. On a real stage
        // change we must ALSO reset the in-stage clock (`currentStageSince`)
        // so the card + the destination column's header recalculate
        // SLA / overdue from `now` instead of the previous stage's
        // timestamp. Without this the moved card kept reading as
        // overdue until the server round-trip + refetch completed
        // (sometimes noticeably lagged on slow connections), which
        // looked like "drag-drop doesn't update the overdue status".
        // Server-side `buildStageTransitionUpdatePayload` sets the
        // same field to `new Date()`, so this is just a matching
        // optimistic mirror.
        const updatedMovedDeal =
          sourceStatus !== destStatus
            ? {
                ...movedDeal,
                current_status: destStatus,
                currentStageSince: new Date().toISOString(),
                current_stage_since: new Date().toISOString(),
              }
            : movedDeal;

        newDeals[sourceStatus] = sourceColumn;

        const destColumn = [...(newDeals[destStatus] || [])];
        destColumn.splice(destination.index, 0, updatedMovedDeal);
        newDeals[destStatus] = destColumn;

        updatesPayload.push({
          id: updatedMovedDeal.id,
          status: destStatus,
          position: Math.min((destination.index + 1) * 1000, 1_000_000),
        });

        newDeals[destStatus].forEach((deal, index) => {
          if (deal && deal.id !== updatedMovedDeal.id) {
            const newPosition = Math.min((index + 1) * 1000, 1_000_000);
            if (deal.position !== newPosition) {
              updatesPayload.push({
                id: deal.id,
                status: destStatus,
                position: newPosition,
              });
            }
          }
        });

        if (sourceStatus !== destStatus) {
          newDeals[sourceStatus].forEach((deal, index) => {
            if (deal) {
              const newPosition = Math.min((index + 1) * 1000, 1_000_000);
              if (deal.position !== newPosition) {
                updatesPayload.push({
                  id: deal.id,
                  status: sourceStatus,
                  position: newPosition,
                });
              }
            }
          });
        }

        return newDeals;
      });

      onChange(updatesPayload);
    },
    [onChange, onRequestRollback, pipelines, specialStageNames, stageByName],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sortedStages = [...pipelineStages].sort((a, b) => a.order - b.order);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="w-full max-w-full overflow-x-auto scrollbar-thin snap-x snap-mandatory md:snap-none">
        <div className="flex min-w-max gap-3 min-h-[36rem] pb-4 pr-4">
          {sortedStages.map((stage) => {
            const isSpecialColumn = specialStageNames.has(stage.name);
            // A retired stage still holding deals is a read-only
            // parking bay: you may drag work OUT of it, never back in.
            const isRetiredColumn = stage.is_active === false;
            return (
              <div
                key={stage.id}
                className="w-[19rem] min-w-[19rem] snap-center md:snap-align-none"
              >
                <div className="flex flex-col h-full bg-muted/40 border border-border rounded-md overflow-hidden">
                  <KanbanHeader
                    deals={pipelines[stage.name] || []}
                    stage={{
                      name: stage.name,
                      description: stage.description,
                      color: stage.color,
                      sla_days: stage.sla_days,
                      probability: stage.probability,
                      is_active: stage.is_active,
                    }}
                  />
                  <Droppable
                    droppableId={stage.name}
                    isDropDisabled={isSpecialColumn || isRetiredColumn}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          "flex-1 p-2 space-y-2 overflow-y-auto scrollbar-thin min-h-0 transition-colors duration-150",
                          snapshot.isDraggingOver &&
                            !isSpecialColumn &&
                            "bg-primary/5 ring-2 ring-inset ring-primary/30",
                          snapshot.isDraggingOver &&
                            isSpecialColumn &&
                            "bg-destructive/5",
                        )}
                      >
                        {(pipelines[stage.name] || []).map((deal, index) => (
                          <Draggable
                            key={String(deal.id)}
                            draggableId={String(deal.id)}
                            index={index}
                            isDragDisabled={isSpecialColumn}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...(!isSpecialColumn
                                  ? provided.dragHandleProps
                                  : {})}
                              >
                                <CompactDealCard
                                  deal={deal}
                                  stage={stage}
                                  onEdit={onEditDeal}
                                  onDelete={
                                    onDeleteDeal
                                      ? (id) => onDeleteDeal(id)
                                      : undefined
                                  }
                                  isDragging={snapshot.isDragging}
                                  nextActivity={
                                    nextActivityByDeal.get(deal.id) ?? null
                                  }
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {(pipelines[stage.name] || []).length === 0 && (
                          <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-md border border-dashed border-border bg-background/50">
                            <Inbox className="h-6 w-6 text-muted-foreground/60 mb-2" />
                            <p className="text-xs font-medium text-muted-foreground">
                              No deals here
                            </p>
                            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                              Drag a deal in or create one
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DragDropContext>
  );
}
