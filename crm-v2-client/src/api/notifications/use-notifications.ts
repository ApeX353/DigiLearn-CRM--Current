import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  Notification,
  NotificationListParams,
  NotificationSeverity,
  NotificationPreference,
  CreateNotificationPreferenceDto,
  UpdateNotificationPreferenceDto,
} from "./types";
import type { Paginated } from "../common-api-type";

const keys = {
  all: ["notifications"] as const,
  list: (params: NotificationListParams) =>
    [...keys.all, "list", params] as const,
  unreadCount: () => [...keys.all, "unread-count"] as const,
  preferences: () => [...keys.all, "preferences"] as const,
};

const DEFAULT_PARAMS: NotificationListParams = {
  page: 1,
  limit: 20,
  channel: "in-app",
};

const normalizeSeverity = (value: unknown): NotificationSeverity => {
  const raw = typeof value === "string" ? value : "";
  if (raw === "critical") return "error";
  if (raw === "warn") return "warning";
  if (
    raw === "info" ||
    raw === "success" ||
    raw === "warning" ||
    raw === "error"
  ) {
    return raw;
  }
  return "info";
};

const normalizeNotification = (raw: Notification): Notification => {
  const id =
    raw?.id ??
    "";
  const title = raw?.title ?? "";
  const message = raw?.message ?? "";
  const channel = raw?.channel;
  const severity = normalizeSeverity(raw?.severity);
  const event_type = raw?.event_type ?? (raw as { eventType?: string | null })?.eventType ?? null;
  const entity = raw?.entity ?? null;
  const entity_id = raw?.entity_id ?? null;
  const action_url =  raw?.action_url ?? null;
  const createdAt = raw?.createdAt ?? null;
  const isRead =
    typeof raw?.isRead === "boolean"
      ? raw.isRead
      : undefined;

  const status =
    raw?.status ??
    (typeof isRead === "boolean" ? (isRead ? "read" : "unread") : undefined);

  return {
    id: String(id),
    title,
    message,
    channel,
    severity,
    event_type,
    entity,
    entity_id,
    action_url,
    createdAt,
    isRead,
    status,
  };
};

const extractNotifications = (payload: Notification[]): Notification[] => {
  if (Array.isArray(payload)) {
    return payload.map(normalizeNotification);
  }

  if (payload && typeof payload === "object") {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data.map(normalizeNotification);
    }

    if (data && typeof data === "object") {
      const innerData = (data as { data?: unknown }).data;
      if (Array.isArray(innerData)) {
        return innerData.map(normalizeNotification);
      }
    }

    const items = (payload as { items?: unknown }).items;
    if (Array.isArray(items)) {
      return items.map(normalizeNotification);
    }
  }

  return [];
};

const extractUnreadCount = (payload: unknown): number => {
  if (typeof payload === "number") {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const count = (payload as { count?: unknown }).count;
    if (typeof count === "number") {
      return count;
    }

    const unreadCount = (payload as { unreadCount?: unknown }).unreadCount;
    if (typeof unreadCount === "number") {
      return unreadCount;
    }

    const data = (payload as { data?: unknown }).data;
    if (data !== undefined) {
      return extractUnreadCount(data);
    }
  }

  return 0;
};

const cleanParams = (params: NotificationListParams) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );

const api = {
  getMyNotifications: (params: NotificationListParams): Promise<Paginated<Notification[]>> =>
    apiClientAuth
      .get<Paginated<Notification[]>>("/user-notifications/my-notifications", {
        params: cleanParams(params),
      })
      .then((res) => ({ ...res.data, data: extractNotifications(res.data.data) })),

  getUnreadCount: (): Promise<number> =>
    apiClientAuth
      .get("/user-notifications/my-notifications/unread-count")
      .then((res) => extractUnreadCount(res.data)),

  markAsRead: (notificationIds: string[]): Promise<void> =>
    apiClientAuth
      .patch("/user-notifications/my-notifications/mark-as-read", {
        notificationIds,
      })
      .then((res) => res.data),

  markAllRead: (): Promise<void> =>
    apiClientAuth
      .patch("/user-notifications/my-notifications/mark-all-read")
      .then((res) => res.data),

  archive: (id: string): Promise<void> =>
    apiClientAuth
      .delete(`/user-notifications/my-notifications/${id}`)
      .then((res) => res.data),

  getPreferences: (): Promise<NotificationPreference[]> =>
    apiClientAuth
      .get("/notification-preferences")
      .then((res) => Array.isArray(res.data) ? res.data : res.data?.data || []),

  createPreference: (data: CreateNotificationPreferenceDto): Promise<NotificationPreference> =>
    apiClientAuth
      .post("/notification-preferences", data)
      .then((res) => res.data),

  updatePreference: (
    eventType: string,
    channel: string,
    data: UpdateNotificationPreferenceDto
  ): Promise<NotificationPreference> =>
    apiClientAuth
      .patch(`/notification-preferences/${eventType}/${channel}`, data)
      .then((res) => res.data),
};

export function useNotifications(params?: NotificationListParams) {
  const queryParams = { ...DEFAULT_PARAMS, ...params };
  return useQuery({
    queryKey: keys.list(queryParams),
    queryFn: () => api.getMyNotifications(queryParams),
    staleTime: 30 * 1000,
  });
}

export function useUnreadNotificationsCount() {
  return useQuery({
    queryKey: keys.unreadCount(),
    queryFn: () => api.getUnreadCount(),
    staleTime: 30 * 1000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string | string[]) =>
      api.markAsRead(Array.isArray(ids) ? ids : [ids]),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useArchiveNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: keys.preferences(),
    queryFn: () => api.getPreferences(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCreateNotificationPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateNotificationPreferenceDto) => api.createPreference(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.preferences() }),
  });
}

export function useUpdateNotificationPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventType,
      channel,
      data,
    }: {
      eventType: string;
      channel: string;
      data: UpdateNotificationPreferenceDto;
    }) => api.updatePreference(eventType, channel, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.preferences() }),
  });
}
