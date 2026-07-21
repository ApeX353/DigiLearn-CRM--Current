import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import { leadsKeys } from "~/api/leads";
import type {
  CreateLeadEscalationDto,
  LeadEscalation,
  ResolveLeadEscalationDto,
} from "./types";

export const leadEscalationKeys = {
  all: ["lead-escalations"] as const,
  byLead: (leadId: string) =>
    [...leadEscalationKeys.all, "lead", leadId] as const,
  queue: (status: "open" | "resolved" | "all" = "open") =>
    [...leadEscalationKeys.all, "queue", status] as const,
};

function unwrap<T>(res: { data: { data?: T } | T }): T {
  const body: any = res.data;
  if (body && typeof body === "object" && "data" in body) return body.data;
  return body;
}

export function useLeadEscalations(leadId?: string) {
  return useQuery<LeadEscalation[]>({
    queryKey: leadEscalationKeys.byLead(leadId ?? ""),
    queryFn: () =>
      apiClientAuth
        .get(`/leads/${leadId}/escalations`)
        .then((res) => unwrap<LeadEscalation[]>(res)),
    enabled: !!leadId,
  });
}

export function useEscalationQueue(
  status: "open" | "resolved" | "all" = "open",
) {
  return useQuery<LeadEscalation[]>({
    queryKey: leadEscalationKeys.queue(status),
    queryFn: () =>
      apiClientAuth
        .get(`/escalations/leads`, { params: { status } })
        .then((res) => unwrap<LeadEscalation[]>(res)),
  });
}

export function useCreateLeadEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      leadId,
      data,
    }: {
      leadId: string;
      data: CreateLeadEscalationDto;
    }) =>
      apiClientAuth
        .post(`/leads/${leadId}/escalations`, data)
        .then((res) => unwrap<LeadEscalation>(res)),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: leadEscalationKeys.all });
      qc.invalidateQueries({ queryKey: leadsKeys.all });
      if (row?.lead_id) {
        qc.invalidateQueries({ queryKey: leadsKeys.byId(row.lead_id) });
      }
    },
  });
}

export function useResolveLeadEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: ResolveLeadEscalationDto;
    }) =>
      apiClientAuth
        .patch(`/escalations/leads/${id}/resolve`, data)
        .then((res) => unwrap<LeadEscalation>(res)),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: leadEscalationKeys.all });
      qc.invalidateQueries({ queryKey: leadsKeys.all });
      if (row?.lead_id) {
        qc.invalidateQueries({ queryKey: leadsKeys.byId(row.lead_id) });
      }
    },
  });
}
