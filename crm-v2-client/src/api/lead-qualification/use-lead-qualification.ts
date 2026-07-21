import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  LeadQualificationCriteria,
  UpdateLeadQualificationDto,
} from "./types";
import type { ApiResponse } from "../common-api-type";
import { leadsKeys } from "../leads";

const keys = {
  all: ["lead-qualification"] as const,
  byLeadId: (leadId: string) => [...keys.all, "detail", leadId] as const,
};

const api = {
  get: (leadId: string): Promise<ApiResponse<LeadQualificationCriteria>> =>
    apiClientAuth.get(`/leads/${leadId}/qualification`).then((r) => r.data),

  update: (
    id: string,
    data: UpdateLeadQualificationDto,
  ): Promise<LeadQualificationCriteria> =>
    apiClientAuth.put(`/leads-qualification/${id}`, data).then((r) => r.data),
};

export function useLeadQualification(leadId: string) {
  return useQuery({
    queryKey: keys.byLeadId(leadId),
    queryFn: () => api.get(leadId),
    enabled: !!leadId,
  });
}

export function useUpdateLeadQualification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateLeadQualificationDto;
    }) => api.update(id, data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: keys.byLeadId(variables.id),
      });
      qc.invalidateQueries({ queryKey: leadsKeys.all });
      qc.invalidateQueries({ queryKey: leadsKeys.byId(variables.id) });
    },
  });
}
