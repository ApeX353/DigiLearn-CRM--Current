import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Card } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Calendar } from "~/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  CalendarIcon,
  Clock,
  User,
  CheckCircle2,
  Loader2,
  Flag,
  Users,
  Briefcase,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useActivity, useUpdateActivity } from "~/api/activities";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  type TaskStatus,
  type TaskPriority,
} from "~/api/activities/types";

interface TaskSheetProps {
  taskId: string;
}

const statusConfig: Record<TaskStatus, { label: string; className: string }> = {
  todo: { label: "To Do", className: "text-muted-foreground" },
  in_progress: { label: "In Progress", className: "text-blue-600" },
  done: { label: "Done", className: "text-emerald-600" },
  cancelled: { label: "Cancelled", className: "text-muted-foreground" },
};

const priorityConfig: Record<TaskPriority, { label: string; className: string }> = {
  low: { label: "Low", className: "text-muted-foreground" },
  medium: { label: "Medium", className: "text-blue-500" },
  high: { label: "High", className: "text-amber-500" },
  urgent: { label: "Urgent", className: "text-destructive" },
};

export function TaskSheet({ taskId }: TaskSheetProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionDirty, setDescriptionDirty] = useState(false);

  const { data: task, isLoading } = useActivity(taskId);
  const updateActivity = useUpdateActivity();

  // Sync local state when task loads
  useEffect(() => {
    if (task) {
      setTempTitle(task.subject);
      setDescription(task.description || "");
      setDescriptionDirty(false);
    }
  }, [task]);

  const handleTitleSave = () => {
    if (tempTitle && tempTitle !== task?.subject) {
      updateActivity.mutate(
        { id: taskId, data: { subject: tempTitle } },
        {
          onSuccess: () => toast.success("Title updated"),
          onError: () => toast.error("Failed to update title"),
        }
      );
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTitleSave();
    } else if (e.key === "Escape") {
      setTempTitle(task?.subject || "");
      setIsEditingTitle(false);
    }
  };

  const handleStatusChange = (status: TaskStatus) => {
    updateActivity.mutate(
      { id: taskId, data: { task: { status } } },
      {
        onSuccess: () => toast.success(`Status updated to ${statusConfig[status].label}`),
        onError: () => toast.error("Failed to update status"),
      }
    );
  };

  const handlePriorityChange = (priority: TaskPriority) => {
    updateActivity.mutate(
      { id: taskId, data: { task: { priority } } },
      {
        onSuccess: () => toast.success(`Priority updated to ${priorityConfig[priority].label}`),
        onError: () => toast.error("Failed to update priority"),
      }
    );
  };

  const handleDueDateChange = (date: Date | undefined) => {
    if (!date) return;
    updateActivity.mutate(
      { id: taskId, data: { due_at: date.toISOString() } },
      {
        onSuccess: () => toast.success("Due date updated"),
        onError: () => toast.error("Failed to update due date"),
      }
    );
  };

  const handleDescriptionBlur = () => {
    if (descriptionDirty && description !== task?.description) {
      updateActivity.mutate(
        { id: taskId, data: { description } },
        {
          onSuccess: () => {
            toast.success("Description updated");
            setDescriptionDirty(false);
          },
          onError: () => toast.error("Failed to update description"),
        }
      );
    }
  };

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-border/40">
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  if (!task) {
    return (
      <Card className="overflow-hidden border-border/40">
        <div className="p-8">
          <p className="text-muted-foreground">Task not found</p>
        </div>
      </Card>
    );
  }

  const taskStatus = task.task?.status || "todo";
  const taskPriority = task.task?.priority || "medium";

  return (
    <Card className="overflow-hidden border-border/40">
      <div className="p-8">
        {/* Title Section */}
        <div className="mb-8">
          {isEditingTitle ? (
            <Input
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="text-3xl font-semibold border-0 px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
          ) : (
            <h2
              className="text-3xl font-semibold tracking-tight cursor-text hover:bg-muted/50 rounded px-3 py-2 -mx-3 transition-colors"
              onClick={() => {
                setIsEditingTitle(true);
                setTempTitle(task.subject);
              }}
            >
              {task.subject}
            </h2>
          )}
        </div>

        {/* Properties Section */}
        <div className="space-y-4 mb-8">
          {/* Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 w-32 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <span>Status</span>
            </div>
            <Select
              value={taskStatus}
              onValueChange={(v) => handleStatusChange(v as TaskStatus)}
              disabled={updateActivity.isPending}
            >
              <SelectTrigger className="w-48 h-8 border-0 bg-muted/50 hover:bg-muted focus:ring-1">
                <SelectValue>
                  <span className={statusConfig[taskStatus]?.className}>
                    {statusConfig[taskStatus]?.label}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    <span className={statusConfig[status].className}>
                      {statusConfig[status].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 w-32 text-sm text-muted-foreground">
              <Flag className="h-4 w-4" />
              <span>Priority</span>
            </div>
            <Select
              value={taskPriority}
              onValueChange={(v) => handlePriorityChange(v as TaskPriority)}
              disabled={updateActivity.isPending}
            >
              <SelectTrigger className="w-48 h-8 border-0 bg-muted/50 hover:bg-muted focus:ring-1">
                <SelectValue>
                  <span className={priorityConfig[taskPriority]?.className}>
                    {priorityConfig[taskPriority]?.label}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    <span className={priorityConfig[priority].className}>
                      {priorityConfig[priority].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Due Date */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 w-32 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Due Date</span>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-48 h-8 justify-start border-0 bg-muted/50 hover:bg-muted px-3"
                  disabled={updateActivity.isPending}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {task.due_at ? (
                    format(new Date(task.due_at), "MMM dd, yyyy")
                  ) : (
                    <span className="text-muted-foreground">Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={task.due_at ? new Date(task.due_at) : undefined}
                  onSelect={handleDueDateChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Assignee (read-only) */}
          {task.assigned_to && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 w-32 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Assignee</span>
              </div>
              <div className="text-sm">
                {task.assigned_to.first_name} {task.assigned_to.last_name}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border/40 my-8" />

        {/* Description Section */}
        <div className="space-y-2 mb-8">
          <label className="text-sm font-medium">Description</label>
          <Textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setDescriptionDirty(true);
            }}
            onBlur={handleDescriptionBlur}
            placeholder="Add a description..."
            className="min-h-[120px] resize-none"
            disabled={updateActivity.isPending}
          />
        </div>

        {/* Links to Lead/Deal */}
        {(task.lead_id || task.deal_id) && (
          <>
            <div className="border-t border-border/40 my-8" />
            <div className="space-y-2">
              <label className="text-sm font-medium">Linked To</label>
              <div className="flex flex-wrap gap-4">
                {task.lead_id && (
                  <Link
                    to={`/leads/${task.lead_id}`}
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Users className="h-4 w-4" />
                    View Lead
                  </Link>
                )}
                {task.deal_id && (
                  <Link
                    to={`/deals/${task.deal_id}`}
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Briefcase className="h-4 w-4" />
                    View Deal
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
