import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  BeginConnectResult,
  CalendarConnection,
  CalendarProvider,
} from "./types";

export const calendarSyncKeys = {
  all: ["calendar-sync"] as const,
  connections: () => [...calendarSyncKeys.all, "connections"] as const,
};

function unwrap<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data?: unknown }).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

const api = {
  list: (): Promise<CalendarConnection[]> =>
    apiClientAuth
      .get("/calendar-sync/connections")
      .then((r) => unwrap<CalendarConnection[]>(r.data)),

  begin: (provider: CalendarProvider): Promise<BeginConnectResult> =>
    apiClientAuth
      .post(`/calendar-sync/connections/${provider}/begin`)
      .then((r) => unwrap<BeginConnectResult>(r.data)),

  disconnect: (id: string): Promise<void> =>
    apiClientAuth
      .delete(`/calendar-sync/connections/${id}`)
      .then(() => undefined),
};

export function useCalendarConnections() {
  return useQuery({
    queryKey: calendarSyncKeys.connections(),
    queryFn: api.list,
  });
}

export function useBeginCalendarConnect() {
  return useMutation({
    mutationFn: api.begin,
  });
}

export function useDisconnectCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.disconnect,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: calendarSyncKeys.connections() }),
  });
}
