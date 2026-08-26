import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClient, apiClientAuth } from "~/api/axios";
import type {
  ConfirmedBooking,
  ConfirmHoldDto,
  CreateHoldDto,
  CreateSchedulingLinkDto,
  Hold,
  PublicViewResponse,
  SchedulingLink,
  UpdateSchedulingLinkDto,
} from "./types";

export const schedulingKeys = {
  all: ["scheduling"] as const,
  links: () => [...schedulingKeys.all, "links"] as const,
  publicView: (slug: string) =>
    [...schedulingKeys.all, "public-view", slug] as const,
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
  // Owner CRUD — authenticated
  createLink: (dto: CreateSchedulingLinkDto): Promise<SchedulingLink> =>
    apiClientAuth
      .post("/scheduling-links", dto)
      .then((r) => unwrap<SchedulingLink>(r.data)),

  listLinks: (): Promise<SchedulingLink[]> =>
    apiClientAuth
      .get("/scheduling-links")
      .then((r) => unwrap<SchedulingLink[]>(r.data)),

  updateLink: (
    id: string,
    dto: UpdateSchedulingLinkDto,
  ): Promise<SchedulingLink> =>
    apiClientAuth
      .patch(`/scheduling-links/${id}`, dto)
      .then((r) => unwrap<SchedulingLink>(r.data)),

  removeLink: (id: string): Promise<void> =>
    apiClientAuth.delete(`/scheduling-links/${id}`).then(() => undefined),

  // Public booking — no auth
  publicView: (slug: string): Promise<PublicViewResponse> =>
    apiClient
      .get(`/book/${encodeURIComponent(slug)}`)
      .then((r) => unwrap<PublicViewResponse>(r.data)),

  hold: (slug: string, dto: CreateHoldDto): Promise<Hold> =>
    apiClient
      .post(`/book/${encodeURIComponent(slug)}/hold`, dto)
      .then((r) => unwrap<Hold>(r.data)),

  confirm: (slug: string, dto: ConfirmHoldDto): Promise<ConfirmedBooking> =>
    apiClient
      .post(`/book/${encodeURIComponent(slug)}/confirm`, dto)
      .then((r) => unwrap<ConfirmedBooking>(r.data)),
};

export function useSchedulingLinks() {
  return useQuery({
    queryKey: schedulingKeys.links(),
    queryFn: api.listLinks,
  });
}

export function useCreateSchedulingLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createLink,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: schedulingKeys.links() }),
  });
}

export function useUpdateSchedulingLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      dto,
    }: {
      id: string;
      dto: UpdateSchedulingLinkDto;
    }) => api.updateLink(id, dto),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: schedulingKeys.links() }),
  });
}

export function useDeleteSchedulingLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.removeLink,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: schedulingKeys.links() }),
  });
}

// ----- public booking hooks -----

export function usePublicBookingView(slug: string | undefined) {
  return useQuery({
    queryKey: schedulingKeys.publicView(slug ?? ""),
    queryFn: () => api.publicView(slug as string),
    enabled: Boolean(slug),
    // Slots can shift second-to-second as other invitees pick — refetch
    // on focus so a tab left open doesn't show stale availability.
    refetchOnWindowFocus: true,
  });
}

export function useCreateHold(slug: string | undefined) {
  return useMutation({
    mutationFn: (dto: CreateHoldDto) => api.hold(slug as string, dto),
  });
}

export function useConfirmBooking(slug: string | undefined) {
  return useMutation({
    mutationFn: (dto: ConfirmHoldDto) => api.confirm(slug as string, dto),
  });
}
