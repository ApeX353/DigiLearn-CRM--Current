import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  BeginVideoConnectResult,
  VideoConnection,
  VideoProvider,
} from "./types";

export const videoIntegrationsKeys = {
  all: ["video-integrations"] as const,
  connections: () => [...videoIntegrationsKeys.all, "connections"] as const,
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
  list: (): Promise<VideoConnection[]> =>
    apiClientAuth
      .get("/video-integrations/connections")
      .then((r) => unwrap<VideoConnection[]>(r.data)),

  begin: (provider: VideoProvider): Promise<BeginVideoConnectResult> =>
    apiClientAuth
      .post(`/video-integrations/connections/${provider}/begin`)
      .then((r) => unwrap<BeginVideoConnectResult>(r.data)),

  disconnect: (id: string): Promise<void> =>
    apiClientAuth
      .delete(`/video-integrations/connections/${id}`)
      .then(() => undefined),
};

export function useVideoConnections() {
  return useQuery({
    queryKey: videoIntegrationsKeys.connections(),
    queryFn: api.list,
  });
}

export function useBeginVideoConnect() {
  return useMutation({
    mutationFn: api.begin,
  });
}

export function useDisconnectVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.disconnect,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: videoIntegrationsKeys.connections() }),
  });
}
