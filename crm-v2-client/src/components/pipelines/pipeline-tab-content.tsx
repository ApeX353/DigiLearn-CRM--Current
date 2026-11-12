import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { DataTable } from "~/components/ui/data-table";
import { Plus, MoreVertical, Pencil, Trash2, Settings } from "lucide-react";
import {
  usePipelines,
  usePipelineStages,
  useDeleteStage,
  useReorderStages,
  useDeletePipeline,
  useSetDefaultPipeline,
  type Stage,
  type Pipeline,
} from "~/api/pipelines";
import { usePipelineStageStore } from "~/stores/pipeline-stage-store";
import { toast } from "sonner";

export function PipelineTabContent() {
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(
    null,
  );
  const { data: pipelinesData } = usePipelines();
  const { data, isLoading: stagesLoading } = usePipelineStages(
    selectedPipeline?.id || "",
  );
  const stages = data?.data || [];
  const deleteStage = useDeleteStage();
  const reorderStages = useReorderStages();
  const deletePipeline = useDeletePipeline();
  const setDefaultPipeline = useSetDefaultPipeline();
  const { openStageDialog, openPipelineDialog } = usePipelineStageStore();

  const pipelines = pipelinesData?.data || [];

  // Set the first pipeline as selected if none is selected
  if (!selectedPipeline && pipelines.length > 0) {
    setSelectedPipeline(pipelines[0]);
  }

  const handleAddStage = () => {
    if (!selectedPipeline) {
      toast.error("Please select a pipeline first");
      return;
    }
    openStageDialog(selectedPipeline.id, (stages?.length || 0) + 1);
  };

  const handleEditStage = (stage: Stage) => {
    openStageDialog(stage.pipeline_id, (stages.length || 0) + 1, stage);
  };

  const handleDeleteStage = async (stage: Stage) => {
    if (!selectedPipeline) return;

    if (confirm(`Are you sure you want to delete the stage "${stage.name}"?`)) {
      try {
        await deleteStage.mutateAsync({
          pipelineId: selectedPipeline.id,
          stageId: stage.id,
        });
        toast.success("Stage deleted successfully");
      } catch (error) {
        toast.error("Failed to delete stage");
      }
    }
  };

  const handleReorderStages = async (newData: Stage[]) => {
    if (!selectedPipeline) return;

    const reorderedStages = newData.map((stage, index) => ({
      id: stage.id,
      order: index + 1,
    }));

    try {
      await reorderStages.mutateAsync({
        pipelineId: selectedPipeline.id,
        data: { stages: reorderedStages },
      });
      toast.success("Stages reordered successfully");
    } catch (error) {
      toast.error("Failed to reorder stages");
    }
  };

  const handleEditPipeline = (pipeline: Pipeline) => {
    openPipelineDialog(pipeline);
  };

  const handleDeletePipeline = async (pipeline: Pipeline) => {
    if (
      confirm(
        `Are you sure you want to delete the pipeline "${pipeline.name}"?`,
      )
    ) {
      try {
        await deletePipeline.mutateAsync(pipeline.id);
        toast.success("Pipeline deleted successfully");
        if (selectedPipeline?.id === pipeline.id) {
          setSelectedPipeline(pipelines.length > 1 ? pipelines[0] : null);
        }
      } catch (error) {
        toast.error("Failed to delete pipeline");
      }
    }
  };

  const handleSetDefaultPipeline = async (pipeline: Pipeline) => {
    try {
      await setDefaultPipeline.mutateAsync(pipeline.id);
      toast.success("Default pipeline set successfully");
    } catch (error) {
      toast.error("Failed to set default pipeline");
    }
  };

  // Columns for the stages table
  const stageColumns: ColumnDef<Stage>[] = [
    {
      accessorKey: "color",
      header: "Color",
      cell: ({ row }) => (
        <div
          className="w-6 h-6 rounded-full border"
          style={{ backgroundColor: row.original.color || "#6b7280" }}
        />
      ),
    },
    {
      accessorKey: "name",
      header: "Stage Name",
      cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
    },
    {
      accessorKey: "sla_days",
      header: "SLA Days",
      cell: ({ row }) => (
        <div className="text-center">{row.original.sla_days} days</div>
      ),
    },
    {
      accessorKey: "probability",
      header: "Probability",
      cell: ({ row }) => (
        <div className="text-center">{row.original.probability}%</div>
      ),
    },
    {
      accessorKey: "order",
      header: "Order",
      cell: ({ row }) => (
        <div className="text-center">
          <Badge variant="secondary">Stage {row.original.order}</Badge>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEditStage(row.original)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDeleteStage(row.original)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <Tabs defaultValue="stages" className="space-y-4">
      <TabsList>
        <TabsTrigger value="stages">Pipeline Stages</TabsTrigger>
        <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
      </TabsList>

      <TabsContent value="stages" className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>Pipeline Stages</CardTitle>
              <CardDescription className="mt-1.5">
                Manage stages for{" "}
                {selectedPipeline?.name || "selected pipeline"}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {pipelines.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {selectedPipeline?.name || "Select Pipeline"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {pipelines.map((pipeline) => (
                      <DropdownMenuItem
                        key={pipeline.id}
                        onClick={() => setSelectedPipeline(pipeline)}
                      >
                        {pipeline.name} {pipeline.is_default && "(Default)"}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button onClick={handleAddStage} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Stage
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedPipeline ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  Please create a pipeline first
                </p>
                <Button onClick={() => openPipelineDialog()} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Pipeline
                </Button>
              </div>
            ) : stagesLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading stages...</p>
              </div>
            ) : stages.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  No pipeline stages configured yet.
                </p>
                <Button onClick={handleAddStage} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Stage
                </Button>
              </div>
            ) : (
              <DataTable
                columns={stageColumns}
                data={stages}
                enableSorting={true}
                onReorder={handleReorderStages}
                getRowId={(row) => row.id}
              />
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="pipelines" className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>Pipelines</CardTitle>
              <CardDescription className="mt-1.5">
                Manage your sales pipelines
              </CardDescription>
            </div>
            <Button onClick={() => openPipelineDialog()} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Pipeline
            </Button>
          </CardHeader>
          <CardContent>
            {pipelines.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  No pipelines configured yet.
                </p>
                <Button onClick={() => openPipelineDialog()} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Pipeline
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {pipelines.map((pipeline) => (
                  <div
                    key={pipeline.id}
                    className="flex items-center gap-4 p-4 rounded-lg border"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{pipeline.name}</div>
                        {pipeline.is_default && (
                          <Badge variant="default">Default</Badge>
                        )}
                        {!pipeline.is_active && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleEditPipeline(pipeline)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {!pipeline.is_default && (
                          <DropdownMenuItem
                            onClick={() => handleSetDefaultPipeline(pipeline)}
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            Set as Default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleDeletePipeline(pipeline)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
