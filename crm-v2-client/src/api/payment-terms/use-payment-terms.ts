import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  PaymentTerm,
  PaymentTermType,
  CreatePaymentTermValues,
  UpdatePaymentTermValues,
  AllocatePaymentResponse,
} from "./types";
import type { Paginated, PaginationParams } from "../common-api-type";

const keys = {
  all: ["payment-terms"] as const,
  list: (
    params: PaginationParams & {
      search?: string;
      type?: PaymentTermType;
      is_active?: boolean;
    },
  ) => [...keys.all, "list", params] as const,
  byId: (id: string) => [...keys.all, "detail", id] as const,
};

const api = {
  getAll: (
    params: PaginationParams & {
      search?: string;
      type?: PaymentTermType;
      is_active?: boolean;
    },
  ): Promise<Paginated<PaymentTerm[]>> =>
    apiClientAuth.get("/payment-terms", { params }).then((r) => r.data),

  getById: (id: string): Promise<PaymentTerm> =>
    apiClientAuth.get(`/payment-terms/${id}`).then((r) => r.data),

  create: (data: CreatePaymentTermValues): Promise<PaymentTerm> =>
    apiClientAuth.post("/payment-terms", data).then((r) => r.data),

  update: (id: string, data: UpdatePaymentTermValues): Promise<PaymentTerm> =>
    apiClientAuth.put(`/payment-terms/${id}`, data).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    apiClientAuth.delete(`/payment-terms/${id}`).then((r) => r.data),

  allocatePayment: (
    paymentId: string,
  ): Promise<AllocatePaymentResponse | { data?: AllocatePaymentResponse }> =>
    apiClientAuth.post(`/payment-terms/allocate/${paymentId}`).then((r) => r.data),
};

export function usePaymentTerms(
  params: PaginationParams & {
    search?: string;
    type?: PaymentTermType;
    is_active?: boolean;
  },
) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api.getAll(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePaymentTerm(id: string) {
  return useQuery({
    queryKey: keys.byId(id),
    queryFn: () => api.getById(id),
    enabled: !!id,
  });
}

export function useCreatePaymentTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePaymentTermValues) => api.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdatePaymentTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePaymentTermValues }) =>
      api.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeletePaymentTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useTogglePaymentTermActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useAllocatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId }: { paymentId: string }) =>
      api.allocatePayment(paymentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payment-terms"] });
    },
  });
}
