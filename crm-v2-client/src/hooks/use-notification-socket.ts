import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useAuthStore } from "~/stores/use-auth-store";
import { useNotificationStore } from "~/stores/use-notification-store";
import { useQueryClient } from "@tanstack/react-query";

const SOCKET_URL =
  import.meta.env.VITE_PUBLIC_API_URL?.replace("/api/v2", "") ||
  "http://localhost:3000";

export function useNotificationSocket() {
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((s) => s.token);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoggedIn || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      // Never permanently give up. A long-lived CRM tab that gets
      // backgrounded throttles socket.io's heartbeat timers, so the
      // connection drops and reconnects repeatedly; a finite cap
      // (was 10) meant notifications silently died for good once the
      // cap was hit, until a full page refresh.
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      console.log("[WS] Connected to notification server");
    });

    socket.on("notification:new", (data) => {
      addNotification({
        id: data.id,
        title: data.title,
        message: data.message,
        severity: data.severity || "info",
        entity: data.entity,
        entity_id: data.entity_id || data.entityId,
        action_url: data.action_url || data.actionUrl,
        createdAt: data.createdAt || new Date().toISOString(),
        isRead: false,
      });

      // Show toast
      const toastFn =
        data.severity === "error"
          ? toast.error
          : data.severity === "warning"
            ? toast.warning
            : data.severity === "success"
              ? toast.success
              : toast.info;

      toastFn(data.title, {
        description: data.message,
        duration: 5000,
      });

      // Invalidate notifications query cache
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["notifications-unread-count"],
      });
    });

    socket.on("pipeline:deal-updated", () => {
      // Invalidate pipeline/deals queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    });

    socket.on("disconnect", () => {
      console.log("[WS] Disconnected from notification server");
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isLoggedIn, token, addNotification, queryClient]);

  return socketRef;
}
