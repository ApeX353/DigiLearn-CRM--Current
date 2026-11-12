import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  Payment,
  PaymentsListParams,
  PaymentStatistics,
  PaymentStatisticsParams,
} from "./types";
import type { Paginated } from "../common-api-type";

const paymentsKeys = {
  all: ["payments"] as const,
  list: (params: PaymentsListParams) =>
    [...paymentsKeys.all, "list", params] as const,
  statistics: (params: PaymentStatisticsParams) =>
    [...paymentsKeys.all, "statistics", params] as const,
};

const paymentsApi = {
  getPaymentsList: (
    params: PaymentsListParams
  ): Promise<Paginated<Payment[]>> =>
    apiClientAuth.get("/payments", { params }).then((res) => res.data),

  getPaymentStatistics: (
    params: PaymentStatisticsParams
  ): Promise<PaymentStatistics> =>
    apiClientAuth
      .get("/payments/statistics", { params })
      .then((res) => res.data),

  deletePayment: (id: string): Promise<void> =>
    apiClientAuth.delete(`/payments/${id}`).then(() => undefined),
};

export function usePaymentsList(params: PaymentsListParams) {
  return useQuery({
    queryKey: paymentsKeys.list(params),
    queryFn: () => paymentsApi.getPaymentsList(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePaymentStatistics(params: PaymentStatisticsParams) {
  return useQuery({
    queryKey: paymentsKeys.statistics(params),
    queryFn: () => paymentsApi.getPaymentStatistics(params),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Remove a receipt (admin, sales_manager on the server). The API reverses its
 * instalment allocations and recomputes the invoice in the same transaction
 * (FIN-02), so the invoice, schedule and payment lists all need refreshing.
 * Until 21 Oct 2026 no screen offered this, which made an invoice holding a
 * payment impossible to cancel (dead-end sweep, D1).
 */
export function useDeletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => paymentsApi.deletePayment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentsKeys.all });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}
