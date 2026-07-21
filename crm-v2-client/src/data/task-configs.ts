import { Calendar, ListTodo, Mail, MessageCircle, MessageSquare, Phone } from "lucide-react";
import type { ActivityType } from "~/api/activities";

export const TYPE_CONFIG: Record<
  ActivityType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  note: {
    label: "Note",
    icon: MessageSquare,
    className:
      "bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400",
  },
  task: {
    label: "Task",
    icon: ListTodo,
    className: "bg-primary/10 text-primary",
  },
  call: {
    label: "Call",
    icon: Phone,
    className: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400",
  },
  email: {
    label: "Email",
    icon: Mail,
    className:
      "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400",
  },
  meeting: {
    label: "Meeting",
    icon: Calendar,
    className:
      "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    className:
      "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400",
  },
};