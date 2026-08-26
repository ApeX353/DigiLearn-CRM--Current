import { useMemo, useState } from "react";
import { Plus, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { CreateActivityModal } from "~/components/activities/create-activity-modal";
import { ActivityTaskSheet } from "~/components/activities/activity-task-sheet";
import {
  useActivityList,
  useUpdateActivity,
  useDeleteActivity,
} from "~/api/activities";
import type { TaskStatus } from "~/api/activities/types";
import type { Lead } from "~/api/leads";
import { TaskListItem, type TaskItemData } from "~/components/tasks/task-list-item";
import { activityToTaskItem } from "~/lib/task-helpers";

interface LeadTasksTabProps {
  lead: Lead;
  isReadonly?: boolean;
}

export function TasksTab({ lead, isReadonly = false }: LeadTasksTabProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: activitiesData, isLoading } = useActivityList({
    page: 1,
    limit: 50,
    lead_id: lead.id,
    type: "task",
  });

  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();

  const tasks = useMemo<TaskItemData[]>(
    () =>
      (activitiesData?.data || []).map((activity) => activityToTaskItem(activity)),
    [activitiesData, lead],
  );

  const openTasks = tasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  );
  const closedTasks = tasks.filter(
    (task) => task.status === "done" || task.status === "cancelled",
  );

  const toggleTaskComplete = (taskId: string, currentStatus: TaskStatus) => {
    if (isReadonly) return;

    const newStatus: TaskStatus =
      currentStatus === "done" || currentStatus === "cancelled"
        ? "todo"
        : "done";
    updateActivity.mutate(
      {
        id: taskId,
        data: { task: { status: newStatus } },
      },
      {
        onSuccess: () => {
          toast.success(
            newStatus === "done" ? "Task completed" : "Task reopened",
          );
        },
        onError: () => {
          toast.error("Failed to update task status");
        },
      },
    );
  };

  const handleArchiveTask = (taskId: string) => {
    if (isReadonly) return;

    deleteActivity.mutate(taskId, {
      onSuccess: () => {
        toast.success("Task deleted");
      },
      onError: () => {
        toast.error("Failed to delete task");
      },
    });
  };

  const handleEditTask = (task: TaskItemData) => {
    setSelectedTaskId(task.id);
    setSheetOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>
            {openTasks.length} open task{openTasks.length !== 1 ? "s" : ""}
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateModalOpen(true)}
          disabled={isReadonly}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No tasks for this lead</p>
            <p className="text-sm mt-1">Create a task to track follow-ups</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Open Tasks */}
            {openTasks.length > 0 && (
              <div className="space-y-2">
                {openTasks.map((task) => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    onToggleComplete={toggleTaskComplete}
                    onEdit={handleEditTask}
                    onDelete={handleArchiveTask}
                    isReadonly={isReadonly}
                  />
                ))}
              </div>
            )}

            {/* Completed Tasks */}
            {closedTasks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Completed / Cancelled ({closedTasks.length})
                </h4>
                {closedTasks.map((task) => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    onToggleComplete={toggleTaskComplete}
                    onEdit={handleEditTask}
                    onDelete={handleArchiveTask}
                    isReadonly={isReadonly}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CreateActivityModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        leadId={lead.id}
        defaultType="task"
        isReadonly={isReadonly}
      />

      <ActivityTaskSheet
        activityId={selectedTaskId}
        open={sheetOpen}
        isReadonly={isReadonly}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSelectedTaskId(null);
        }}
      />
    </Card>
  );
}
