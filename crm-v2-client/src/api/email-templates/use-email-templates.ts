import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  CreateEmailTemplateDto,
  EmailTemplate,
  RenderContext,
  RenderedEmail,
  UpdateEmailTemplateDto,
} from "./types";

/**
 * Query-key factory — keeps cache invalidation in one place so a
 * controller-level refactor can't leak stale data into the UI.
 */
export const emailTemplatesKeys = {
  all: ["email-templates"] as const,
  lists: () => [...emailTemplatesKeys.all, "list"] as const,
  byId: (id: string) => [...emailTemplatesKeys.all, "detail", id] as const,
  render: (id: string, ctx: RenderContext) =>
    [...emailTemplatesKeys.all, "render", id, ctx] as const,
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
  list: (): Promise<EmailTemplate[]> =>
    apiClientAuth
      .get("/email-templates")
      .then((r) => unwrap<EmailTemplate[]>(r.data)),

  byId: (id: string): Promise<EmailTemplate> =>
    apiClientAuth
      .get(`/email-templates/${id}`)
      .then((r) => unwrap<EmailTemplate>(r.data)),

  create: (dto: CreateEmailTemplateDto): Promise<EmailTemplate> =>
    apiClientAuth
      .post("/email-templates", dto)
      .then((r) => unwrap<EmailTemplate>(r.data)),

  update: (id: string, dto: UpdateEmailTemplateDto): Promise<EmailTemplate> =>
    apiClientAuth
      .patch(`/email-templates/${id}`, dto)
      .then((r) => unwrap<EmailTemplate>(r.data)),

  remove: (id: string): Promise<void> =>
    apiClientAuth.delete(`/email-templates/${id}`).then(() => undefined),

  render: (id: string, ctx: RenderContext): Promise<RenderedEmail> =>
    apiClientAuth
      .get(`/email-templates/${id}/render`, {
        params: {
          lead_id: ctx.lead_id,
          deal_id: ctx.deal_id,
          contact_id: ctx.contact_id,
        },
      })
      .then((r) => unwrap<RenderedEmail>(r.data)),
};

export function useEmailTemplates() {
  return useQuery({
    queryKey: emailTemplatesKeys.lists(),
    queryFn: api.list,
    staleTime: 60 * 1000,
  });
}

export function useEmailTemplate(id: string | undefined) {
  return useQuery({
    queryKey: emailTemplatesKeys.byId(id ?? ""),
    queryFn: () => api.byId(id as string),
    enabled: !!id,
  });
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateEmailTemplateDto) => api.create(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: emailTemplatesKeys.all });
    },
  });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateEmailTemplateDto;
    }) => api.update(id, data),
    onSuccess: (tpl) => {
      qc.setQueryData(emailTemplatesKeys.byId(tpl.id), tpl);
      qc.invalidateQueries({ queryKey: emailTemplatesKeys.lists() });
    },
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailTemplatesKeys.all }),
  });
}

/**
 * Live render hook used by the composer's preview pane.  Every time the
 * entity ids change, the query key changes — React Query re-fetches and
 * the preview updates.  Consumers should debounce upstream if they
 * worry about spamming the server while the user types.
 */
export function useRenderEmailTemplate(
  id: string | undefined,
  ctx: RenderContext,
  enabled = true,
) {
  return useQuery({
    queryKey: emailTemplatesKeys.render(id ?? "", ctx),
    queryFn: () => api.render(id as string, ctx),
    enabled: !!id && enabled,
    // Preview is visual only; refreshing it every mount is wasteful.
    staleTime: 30 * 1000,
  });
}
