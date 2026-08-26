import { useQuery } from "@tanstack/react-query";
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
