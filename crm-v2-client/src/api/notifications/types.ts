export type NotificationChannel = "sms" | "push" | "whatsapp" | "in-app";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export type NotificationStatus = "read" | "unread";

export type Notification = {
  id: string;
  title: string;
  message: string;
  channel?: NotificationChannel;
  severity?: NotificationSeverity;
  event_type?: string | null;
  entity?: string | null;
  entity_id?: string | null;
  action_url?: string | null;
  createdAt?: string | null;
  isRead?: boolean;
  status?: NotificationStatus;
};

export type NotificationListParams = {
  page?: number;
  limit?: number;
  channel?: NotificationChannel;
  severity?: NotificationSeverity;
  entity?: string;
  entityId?: string;
  isRead?: boolean;
  unreadOnly?: boolean;
};

export type NotificationPreference = {
  id: string;
  event_type: string;
  channel: NotificationChannel;
  is_enabled: boolean;
  severity_min?: "info" | "warning" | "critical";
  created_at: string;
  updated_at: string;
};

export type CreateNotificationPreferenceDto = {
  event_type: string;
  channel: NotificationChannel;
  is_enabled: boolean;
  severity_min?: "info" | "warning" | "critical";
};

export type UpdateNotificationPreferenceDto = {
  is_enabled?: boolean;
  severity_min?: "info" | "warning" | "critical";
};
