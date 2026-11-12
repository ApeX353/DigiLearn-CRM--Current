import { create } from "zustand";

export interface RealtimeNotification {
  id: string;
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "error";
  entity?: string;
  entity_id?: string;
  action_url?: string;
  createdAt: string;
  isRead: boolean;
}

interface NotificationState {
  unreadCount: number;
  recentNotifications: RealtimeNotification[];
  incrementUnread: () => void;
  setUnreadCount: (count: number) => void;
  decrementUnread: () => void;
  resetUnread: () => void;
  addNotification: (notification: RealtimeNotification) => void;
  clearNotifications: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  recentNotifications: [],

  incrementUnread: () =>
    set((state) => ({ unreadCount: state.unreadCount + 1 })),

  setUnreadCount: (count: number) => set({ unreadCount: count }),

  decrementUnread: () =>
    set((state) => ({
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),

  resetUnread: () => set({ unreadCount: 0 }),

  addNotification: (notification: RealtimeNotification) =>
    set((state) => ({
      recentNotifications: [notification, ...state.recentNotifications].slice(
        0,
        20
      ),
      unreadCount: state.unreadCount + 1,
    })),

  clearNotifications: () =>
    set({ recentNotifications: [], unreadCount: 0 }),
}));
