import { useState } from "react";
import { Plus, Search, Loader2, Circle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "~/components/ui/pagination";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import PageHeader from "~/components/page-header";
import Container from "~/components/container";
import {
  useActivityList,
  useUpdateActivity,
  useDeleteActivity,
} from "~/api/activities";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  type TaskStatus,
  type TaskPriority,
} from "~/api/activities/types";
import { CreateActivityModal } from "~/components/activities/create-activity-modal";
import { ActivityTaskSheet } from "~/components/activities/activity-task-sheet";
import {
  TaskListItem,
  type TaskItemData,
} from "~/components/tasks/task-list-item";
import { activityToTaskItem } from "~/lib/task-helpers";
import { isDealReadonly, isLeadReadonly } from "~/stores/use-is-readonly";
import { Autocomplete } from "~/components/ui/autocomplete";
import { useDebounce } from "~/hooks/use-debounce";
import { useStaff } from "~/api/users";
import { usePermission } from "~/hooks/use-permission";

const priorityConfig: Record<TaskPriority, { label: string }> = {
  low: { label: "Low" },
  medium: { label: "Medium" },
  high: { label: "High" },
  urgent: { label: "Urgent" },
};

const statusConfig: Record<TaskStatus, { label: string }> = {
  todo: { label: "To Do" },
  in_progress: { label: "In Progress" },
  done: { label: "Done" },
  cancelled: { label: "Cancelled" },
};

export default function ViewTasksPage() {
  const canViewAllTasks = usePermission("Activity", "manage");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [repFilter, setRepFilter] = useState<string>("all");
  const limit = 25;

  const [staffSearch, setStaffSearch] = useState("");

  const debouncedStaffSearch = useDebounce(staffSearch, 700);
  const { data: staffData, isLoading: isLoadingStaff } = useStaff({
    page: 1,
    limit: 15,
    search: debouncedStaffSearch,
    status: "active",
  });

  const staff = staffData?.data || [];

  const { data: activitiesData, isLoading } = useActivityList({
    page,
    limit,
    type: "task",
    search: searchQuery || undefined,
    include_details: true,
    assigned_to_id: repFilter === "all" ? undefined : repFilter,
  });

  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();

  const activities = activitiesData?.data || [];
  const meta = activitiesData?.meta;
  const totalPages = meta?.totalPages ?? 1;

  // Client-side filtering for status/priority (API already filters by type=task)
  const filteredTasks = activities.filter((activity) => {
    const matchesStatus =
      statusFilter === "all" || activity.task?.status === statusFilter;
    const matchesPriority =
      priorityFilter === "all" || activity.task?.priority === priorityFilter;
    return matchesStatus && matchesPriority;
  });

  const openCount = activities.filter(
    (a) => a.task?.status !== "done" && a.task?.status !== "cancelled",
  ).length;
  const isTaskReadonly = (taskId: string) => {
    const activity = activities.find((item) => item.id === taskId);
    if (!activity) return false;
    return (
      isLeadReadonly(activity.lead?.status) ||
      isDealReadonly(
        activity.deal?.closeStatus ||
          (activity.deal as { close_status?: string } | undefined)
            ?.close_status ||
          (activity.deal as { status?: string } | undefined)?.status,
      )
    );
  };
  const selectedTaskReadonly = selectedTaskId
    ? isTaskReadonly(selectedTaskId)
    : false;

  const handleToggleComplete = (taskId: string, currentStatus: TaskStatus) => {
    if (isTaskReadonly(taskId)) {
      toast.error("Task is read-only");
      return;
    }

    const newStatus: TaskStatus = currentStatus === "done" ? "todo" : "done";
    updateActivity.mutate(
      {
        id: taskId,
        data: {
          task: { status: newStatus },
        },
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

  const handleEditTask = (task: TaskItemData) => {
    setSelectedTaskId(task.id);
    setSheetOpen(true);
  };

  const handleDeleteTask = (taskId: string) => {
    if (isTaskReadonly(taskId)) {
      toast.error("Task is read-only");
      return;
    }

    deleteActivity.mutate(taskId, {
      onSuccess: () => {
        toast.success("Task deleted");
      },
      onError: () => {
        toast.error("Failed to delete task");
      },
    });
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("ellipsis");
      for (
        let i = Math.max(2, page - 1);
        i <= Math.min(totalPages - 1, page + 1);
        i++
      ) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <Container>
      <PageHeader
        title="Tasks"
        subtitle={`${openCount} open task${openCount !== 1 ? "s" : ""}`}
        actions={
          <Button onClick={() => setCreateModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Task
          </Button>
        }
      />

      <section className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>All Tasks</CardTitle>
            <CardDescription>
              {meta?.totalItems ?? activities.length} total tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
              {canViewAllTasks && (
                <div>
                  <Autocomplete
                    value={repFilter}
                    options={[
                      { label: "All Sales Rep", value: "all" },
                      ...staff.map((rep) => ({
                        label: `${rep.first_name} ${rep.last_name}`,
                        value: rep.id,
                      })),
                    ]}
                    onValueChange={setRepFilter}
                    onSearchChange={setStaffSearch}
                    searchValue={staffSearch}
                    isLoading={isLoadingStaff}
                    emptyText="No Sale Rep of Staff found"
                    placeholder="All Staff/ Reps"
                  />
                </div>
              )}
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-30">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusConfig[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={priorityFilter}
                onValueChange={(v) => {
                  setPriorityFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-30">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {priorityConfig[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Task List */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Circle className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No tasks found</p>
                <p className="text-sm mt-1">
                  Create your first task to get started
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((activity) => (
                  <TaskListItem
                    key={activity.id}
                    task={activityToTaskItem(activity)}
                    onToggleComplete={handleToggleComplete}
                    onEdit={handleEditTask}
                    onDelete={handleDeleteTask}
                    isReadonly={isTaskReadonly(activity.id)}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 w-full flex items-center gap-x-4">
                <div>
                  <p className="text-center text-sm text-muted-foreground mt-2">
                    Page {page} of {totalPages} ({meta?.totalItems} tasks)
                  </p>
                </div>
                <div className="ml-auto">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          className={cn(
                            "cursor-pointer",
                            page === 1 && "pointer-events-none opacity-50",
                          )}
                        />
                      </PaginationItem>
                      {getPageNumbers().map((p, i) =>
                        p === "ellipsis" ? (
                          <PaginationItem key={`ellipsis-${i}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={p}>
                            <PaginationLink
                              isActive={page === p}
                              onClick={() => setPage(p)}
                              className="cursor-pointer"
                            >
                              {p}
                            </PaginationLink>
                          </PaginationItem>
                        ),
                      )}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                          }
                          className={cn(
                            "cursor-pointer",
                            page === totalPages &&
                              "pointer-events-none opacity-50",
                          )}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <CreateActivityModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        defaultType="task"
      />

      <ActivityTaskSheet
        activityId={selectedTaskId}
        open={sheetOpen}
        isReadonly={selectedTaskReadonly}
        onOpenChange={setSheetOpen}
      />
    </Container>
  );
}
