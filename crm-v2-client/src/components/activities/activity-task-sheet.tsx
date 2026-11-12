import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
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
  Flag,
  User,
  CheckCircle2,
  Loader2,
  Users,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import { getActivityVisual } from "~/lib/activity-visuals";
import {
  useActivity,
  useAddActivityComment,
  useUpdateActivity,
  type Activity,
  type ActivityComment,
} from "~/api/activities";
import { useStaff } from "~/api/users";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  type TaskStatus,
  type TaskPriority,
} from "~/api/activities/types";

interface ActivityTaskSheetProps {
  activityId: string | null;
  initialActivity?: Activity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isReadonly?: boolean;
}

const statusConfig: Record<TaskStatus, { label: string; className: string }> = {
  todo: { label: "To Do", className: "text-muted-foreground" },
  in_progress: { label: "In Progress", className: "text-blue-600" },
  done: { label: "Done", className: "text-emerald-600" },
  cancelled: { label: "Cancelled", className: "text-muted-foreground" },
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

function parseValidDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function ActivityTaskSheet({
  activityId,
  initialActivity = null,
  open,
  onOpenChange,
  isReadonly = false,
}: ActivityTaskSheetProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const [newComment, setNewComment] = useState("");

  const { data: activity, isLoading } = useActivity(activityId || "");
  const updateActivity = useUpdateActivity();
  const addComment = useAddActivityComment();
  const { data: staffData, isLoading: isStaffLoading } = useStaff({
    page: 1,
    limit: 100,
    status: "active",
  });

  const resolvedActivity = useMemo(() => {
    if (!activity && !initialActivity) return null;
    if (!activity) return initialActivity;
    if (!initialActivity) return activity;

    return {
      ...initialActivity,
      ...activity,
      task: activity.task ?? initialActivity.task,
      assigned_to: activity.assigned_to ?? initialActivity.assigned_to,
      assigned_to_id: activity.assigned_to_id ?? initialActivity.assigned_to_id,
      due_at: activity.due_at ?? initialActivity.due_at,
      lead_id: activity.lead_id ?? initialActivity.lead_id,
      deal_id: activity.deal_id ?? initialActivity.deal_id,
      comments: activity.comments ?? initialActivity.comments,
    } satisfies Activity;
  }, [activity, initialActivity]);

  // Sync local state when activity loads
  useEffect(() => {
    if (resolvedActivity) {
      setTempTitle(resolvedActivity.subject);
      setDescription(resolvedActivity.description || "");
      setDescriptionDirty(false);
    }
  }, [resolvedActivity]);

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setIsEditingTitle(false);
      setDescriptionDirty(false);
    }
  }, [open]);

  const handleTitleSave = () => {
    if (isReadonly) {
      setIsEditingTitle(false);
      return;
    }

    if (tempTitle && tempTitle !== resolvedActivity?.subject && activityId) {
      updateActivity.mutate(
        { id: activityId, data: { subject: tempTitle } },
        {
          onSuccess: () => toast.success("Title updated"),
          onError: () => toast.error("Failed to update title"),
        },
      );
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTitleSave();
    } else if (e.key === "Escape") {
      setTempTitle(resolvedActivity?.subject || "");
      setIsEditingTitle(false);
    }
  };

  const handleStatusChange = (status: TaskStatus) => {
    if (!activityId || isReadonly) return;
    updateActivity.mutate(
      { id: activityId, data: { task: { status } } },
      {
        onSuccess: () =>
          toast.success(`Status updated to ${statusConfig[status].label}`),
        onError: () => toast.error("Failed to update status"),
      },
    );
  };

  const handlePriorityChange = (priority: TaskPriority) => {
    if (!activityId || isReadonly) return;
    updateActivity.mutate(
      { id: activityId, data: { task: { priority } } },
      {
        onSuccess: () =>
          toast.success(
            `Priority updated to ${priorityConfig[priority].label}`,
          ),
        onError: () => toast.error("Failed to update priority"),
      },
    );
  };

  const handleDueDateChange = (date: Date | undefined) => {
    if (!activityId || !date || isReadonly) return;
    updateActivity.mutate(
      { id: activityId, data: { due_at: date.toISOString() } },
      {
        onSuccess: () => toast.success("Due date updated"),
        onError: () => toast.error("Failed to update due date"),
      },
    );
  };

  const handleDescriptionBlur = () => {
    if (isReadonly) return;

    if (
      descriptionDirty &&
      activityId &&
      description !== resolvedActivity?.description
    ) {
      updateActivity.mutate(
        { id: activityId, data: { description } },
        {
          onSuccess: () => {
            toast.success("Description updated");
            setDescriptionDirty(false);
          },
          onError: () => toast.error("Failed to update description"),
        },
      );
    }
  };

  const handleAssigneeChange = (value: string) => {
    if (!activityId || isReadonly) return;

    const assignedToId = value === "unassigned" ? null : value;
    const selectedStaff = staffData?.data?.find(
      (member) => member.id === value,
    );

    updateActivity.mutate(
      { id: activityId, data: { assigned_to_id: assignedToId } },
      {
        onSuccess: () => {
          if (value === "unassigned") {
            toast.success("Task unassigned");
            return;
          }
          toast.success(
            selectedStaff
              ? `Task assigned to ${selectedStaff.first_name} ${selectedStaff.last_name}`
              : "Assignee updated",
          );
        },
        onError: () => toast.error("Failed to update assignee"),
      },
    );
  };

  const taskStatus = resolvedActivity?.task?.status || "todo";
  const taskPriority = resolvedActivity?.task?.priority || "medium";
  const staffList = staffData?.data || [];
  const assigneeId =
    resolvedActivity?.assigned_to_id ||
    resolvedActivity?.assigned_to?.id ||
    null;
  const assigneeValue = assigneeId || "unassigned";
  const hasAssigneeOption = assigneeId
    ? staffList.some((member) => member.id === assigneeId)
    : false;
  const dueDate = parseValidDate(resolvedActivity?.due_at);
  const comments = useMemo<ActivityComment[]>(
    () =>
      [...(resolvedActivity?.comments ?? [])].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [resolvedActivity?.comments],
  );

  const handleAddComment = () => {
    const commentText = newComment.trim();
    if (!activityId || !commentText || isReadonly) return;

    addComment.mutate(
      { id: activityId, data: { comment: commentText } },
      {
        onSuccess: () => {
          setNewComment("");
          toast.success("Comment added");
        },
        onError: () => toast.error("Failed to add comment"),
      },
    );
  };

  const visual = getActivityVisual("task");
  const Icon = visual.icon;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-2xl"
      >
        {!activityId ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              Select a task to view details
            </p>
          </div>
        ) : isLoading && !resolvedActivity ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !resolvedActivity ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Task not found</p>
          </div>
        ) : resolvedActivity.type !== "task" ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              Task details unavailable for this activity
            </p>
          </div>
        ) : (
          <>
            <SheetHeader className="border-b pb-4">
              <div className="flex items-start gap-3.5 pr-8">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${visual.tile}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  {isEditingTitle ? (
                    <Input
                      value={tempTitle}
                      onChange={(e) => setTempTitle(e.target.value)}
                      onBlur={handleTitleSave}
                      onKeyDown={handleTitleKeyDown}
                      className="text-lg font-semibold"
                      autoFocus
                    />
                  ) : (
                    <SheetTitle
                      className="cursor-text rounded px-1 -mx-1 text-lg font-semibold leading-snug transition-colors hover:bg-muted/50"
                      onClick={() => {
                        if (isReadonly) return;
                        setIsEditingTitle(true);
                        setTempTitle(resolvedActivity.subject);
                      }}
                    >
                      {resolvedActivity.subject}
                    </SheetTitle>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${visual.chip}`}
                    >
                      {visual.label}
                    </span>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-6 px-4 py-6">
              {/* Status */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-28 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Status</span>
                </div>
                <Select
                  value={taskStatus}
                  onValueChange={(v) => handleStatusChange(v as TaskStatus)}
                  disabled={updateActivity.isPending || isReadonly}
                >
                  <SelectTrigger className="flex-1 h-9">
                    <SelectValue>
                      <span className={statusConfig[taskStatus]?.className}>
                        {statusConfig[taskStatus]?.label}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        <span className={statusConfig[s].className}>
                          {statusConfig[s].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-28 text-sm text-muted-foreground">
                  <Flag className="h-4 w-4" />
                  <span>Priority</span>
                </div>
                <Select
                  value={taskPriority}
                  onValueChange={(v) => handlePriorityChange(v as TaskPriority)}
                  disabled={updateActivity.isPending || isReadonly}
                >
                  <SelectTrigger className="flex-1 h-9">
                    <SelectValue>
                      <span className={priorityConfig[taskPriority]?.className}>
                        {priorityConfig[taskPriority]?.label}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className={priorityConfig[p].className}>
                          {priorityConfig[p].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Due Date */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-28 text-sm text-muted-foreground">
                  <CalendarIcon className="h-4 w-4" />
                  <span>Due Date</span>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1 h-9 justify-start text-left font-normal",
                        !dueDate && "text-muted-foreground",
                      )}
                      disabled={updateActivity.isPending || isReadonly}
                    >
                      {dueDate
                        ? format(dueDate, "MMM dd, yyyy")
                        : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={handleDueDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Assignee */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-28 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span>Assignee</span>
                </div>
                <Select
                  value={assigneeValue}
                  onValueChange={handleAssigneeChange}
                  disabled={updateActivity.isPending || isStaffLoading || isReadonly}
                >
                  <SelectTrigger className="flex-1 h-9">
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {assigneeId &&
                    !hasAssigneeOption &&
                    resolvedActivity.assigned_to ? (
                      <SelectItem value={assigneeId}>
                        {resolvedActivity.assigned_to.first_name}{" "}
                        {resolvedActivity.assigned_to.last_name}
                      </SelectItem>
                    ) : null}
                    {staffList.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.first_name} {member.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Divider */}
              <div className="border-t border-border/40" />

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setDescriptionDirty(true);
                  }}
                  onBlur={handleDescriptionBlur}
                  placeholder="Add a description..."
                  rows={4}
                  disabled={updateActivity.isPending || isReadonly}
                />
              </div>

              {/* Comments */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Comments</label>

                <div className="space-y-2">
                  {comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No comments yet.
                    </p>
                  ) : (
                    comments.map((comment) => {
                      const fullName = comment.commented_by
                        ? `${comment.commented_by.first_name || ""} ${comment.commented_by.last_name || ""}`.trim()
                        : "";
                      const authorName = fullName || "Unknown user";
                      const createdAt = parseValidDate(comment.created_at);

                      return (
                        <div
                          key={comment.id}
                          className="rounded-md border border-border/60 p-3"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">
                              {authorName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {createdAt
                                ? format(createdAt, "MMM dd, yyyy h:mm a")
                                : "--"}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">
                            {comment.comment}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="space-y-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    rows={3}
                    disabled={addComment.isPending || isReadonly}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddComment}
                      disabled={!newComment.trim() || addComment.isPending || isReadonly}
                    >
                      {addComment.isPending ? "Adding..." : "Add comment"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Links to Lead/Deal */}
              {(resolvedActivity.lead_id || resolvedActivity.deal_id) && (
                <>
                  <div className="border-t border-border/40" />
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Linked To</label>
                    <div className="flex flex-wrap gap-2">
                      {resolvedActivity.lead_id && (
                        <Link
                          to={`/leads/${resolvedActivity.lead_id}`}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <Users className="h-4 w-4" />
                          View Lead
                        </Link>
                      )}
                      {resolvedActivity.deal_id && (
                        <Link
                          to={`/deals/${resolvedActivity.deal_id}`}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
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
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
