import type { NotificationGroup } from "~/api/notifications";

export const NOTIFICATION_GROUP_LABELS: Record<NotificationGroup, string> = {
  tasks: "Tasks",
  reminders: "Reminders",
  sla: "SLA",
  bugs: "Bug reports",
  approvals: "Approvals",
  system: "System",
  other: "Other",
};
