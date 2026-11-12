import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  PaymentEntryRequest,
  PaymentEntryRequestStatus,
  ReviewPaymentEntryRequestDto,
} from "./types";

export const paymentEntryRequestKeys = {
  all: ["payment-entry-requests"] as const,
  list: (status: PaymentEntryRequestStatus) =>
    [...paymentEntryRequestKeys.all, status] as const,
};

const list = async (status: PaymentEntryRequestStatus) => {
  const response = await apiClientAuth.get("/payments/requests", {
    params: { status },
  });
  return (response.data?.data ?? []) as PaymentEntryRequest[];
};

const review = async (
  id: string,
  data: ReviewPaymentEntryRequestDto,
) => {
  const response = await apiClientAuth.patch(
    `/payments/requests/${id}/review`,
    data,
  );
  return response.data?.data as PaymentEntryRequest;
};

export function usePaymentEntryRequests(
  status: PaymentEntryRequestStatus = "pending",
) {
  return useQuery({
    queryKey: paymentEntryRequestKeys.list(status),
    queryFn: () => list(status),
  });
}

export function useReviewPaymentEntryRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: ReviewPaymentEntryRequestDto;
    }) => review(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentEntryRequestKeys.all });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment-terms"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}
