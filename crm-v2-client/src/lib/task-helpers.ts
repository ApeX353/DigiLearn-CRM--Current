import type { Activity } from "~/api/activities";
import type { TaskItemData } from "~/components/tasks/task-list-item";

export function activityToTaskItem(activity: Activity): TaskItemData {
  return {
    id: activity.id,
    title: activity.subject,
    description: activity.description,
    status: activity.task?.status ?? "todo",
    priority: activity.task?.priority ?? "medium",
    due_date: activity.due_at,
    created_at: activity.created_at,
    created_by: activity.created_by,
    lead: activity.lead_id
      ? {
          id: activity.lead_id,
          lead_name: activity.lead?.lead_name ?? "View Lead",
        }
      : undefined,
    deal: activity.deal_id
      ? { id: activity.deal_id, deal_name: activity.deal?.title ?? "View Deal" }
      : undefined,
    school: activity.lead?.school || undefined,
  };
}
