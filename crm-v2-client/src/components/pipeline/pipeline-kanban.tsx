import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import CompactDealCard from "~/components/pipeline/compact-deal-card";
import { KanbanHeader } from "~/components/pipeline/kanban-header";
import type { Deal } from "~/api/deals";
import type { Stage } from "~/api/pipelines";

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

        const updatedMovedDeal =
          sourceStatus !== destStatus
            ? { ...movedDeal, current_status: destStatus }
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
      <div className="w-full max-w-full overflow-x-auto min-h-50">
        <div className="flex min-w-max gap-2 min-h-150 pb-4">
          {sortedStages.map((stage) => {
            const isSpecialColumn = specialStageNames.has(stage.name);
            return (
            <div key={stage.id} className="min-w-72">
              <div className="flex flex-col h-full bg-white border border-input rounded-md">
                <KanbanHeader
                  deals={pipelines[stage.name] || []}
                  stage={{
                    name: stage.name,
                    description: stage.description,
                    color: stage.color,
                    sla_days: stage.sla_days,
                    probability: stage.probability,
                  }}
                />
                <Droppable droppableId={stage.name} isDropDisabled={isSpecialColumn}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 p-1.5 space-y-1.5 overflow-y-auto min-h-0 transition-colors ${
                        snapshot.isDraggingOver ? "bg-blue-50" : ""
                      }`}
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
                              className="min-w-55"
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
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {(pipelines[stage.name] || []).length === 0 && (
                        <div className="text-center py-4 text-black/70">
                          <p className="text-xs">No deals</p>
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            </div>
          )})}
        </div>
      </div>
    </DragDropContext>
  );
}
