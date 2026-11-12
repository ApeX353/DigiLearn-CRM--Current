import { Link } from "react-router";
import { format } from "date-fns";
import {
  MoreHorizontal,
  Calendar,
  Flag,
  Building2,
  Pencil,
  Magnet,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import type { TaskStatus, TaskPriority } from "~/api/activities/types";
import type { User } from "~/stores/use-auth-store";

export interface TaskItemData {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
  lead?: { id: string; lead_name: string };
  deal?: { id: string; deal_name: string };
  school?: { id: string; name: string };
  created_at: string;
  created_by?: User;
}

interface TaskListItemProps {
  task: TaskItemData;
  onToggleComplete: (taskId: string, currentStatus: TaskStatus) => void;
  onEdit: (task: TaskItemData) => void;
  onDelete: (taskId: string) => void;
  isReadonly?: boolean;
}

const statusConfig: Record<TaskStatus, { label: string; className: string }> = {
  todo: { label: "To Do", className: "bg-muted text-muted-foreground" },
  in_progress: {
    label: "In Progress",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  done: {
    label: "Completed",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
  },
};

const priorityConfig: Record<
  TaskPriority,
  { label: string; className: string }
> = {
  low: { label: "Low", className: "text-muted-foreground" },
  medium: { label: "Medium", className: "text-blue-500" },
  high: { label: "High", className: "text-amber-500" },
  urgent: { label: "Urgent", className: "text-destructive" },
};

export function TaskListItem({
  task,
  onToggleComplete,
  onEdit,
  onDelete,
  isReadonly = false,
}: TaskListItemProps) {
  const isCompleted = task.status === "done";
  const link = !!task.deal
    ? `/deals/${task.deal.id}`
    : !!task.lead
      ? `/leads/${task.lead.id}`
      : "#";

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-lg border transition-colors",
        isCompleted && "bg-muted/50",
      )}
    >
      <Checkbox
        checked={isCompleted}
        onCheckedChange={() => {
          if (isReadonly) return;
          onToggleComplete(task.id, task.status);
        }}
        disabled={isReadonly}
      />
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "font-medium",
            isCompleted && "line-through text-muted-foreground",
          )}
        >
          {task.title}
        </div>
        {task.description && (
          <div className="text-sm text-muted-foreground truncate">
            {task.description}
          </div>
        )}
        {(task.lead || task.deal || task.school) && (
          <div className="flex flex-wrap items-center gap-2 text-xs mt-1">
            <Link
              to={link}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Magnet className="h-3 w-3" />
              {task.lead?.lead_name}
            </Link>
            {task.school && (
              <Link
                to={`/schools/${task.school.id}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Building2 className="h-3 w-3" />
                {task.school.name}
              </Link>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <p className="flex items-center gap-1 text-xs text-muted-foreground text-right">
          {format(new Date(task.created_at), "MMM dd, yyyy")}
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-sm">
            <Flag
              className={cn(
                "h-4 w-4",
                priorityConfig[task.priority]?.className,
              )}
            />
            <span className="hidden sm:inline text-muted-foreground">
              {priorityConfig[task.priority]?.label}
            </span>
          </div>
          {task.due_date && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">
                {format(new Date(task.due_date), "MMM dd, yyyy")}
              </span>
            </div>
          )}
          <Badge className={statusConfig[task.status]?.className}>
            {statusConfig[task.status]?.label}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit(task)}>
                <Pencil className="h-4 w-4 mr-2" />
                {isReadonly ? "View Task" : "Edit Task"}
              </DropdownMenuItem>
              {!isReadonly && (
                <DropdownMenuItem
                  onClick={() => onToggleComplete(task.id, task.status)}
                >
                  {isCompleted ? "Mark as Pending" : "Mark as Complete"}
                </DropdownMenuItem>
              )}
              {!isReadonly && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete(task.id)}
                >
                  Delete Task
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
