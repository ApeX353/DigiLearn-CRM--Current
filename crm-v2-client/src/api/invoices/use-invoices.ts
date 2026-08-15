import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth, handleApiError } from "~/api/axios";
import type { ApiResponse, Paginated } from "../common-api-type";
import type {
  Invoice,
  InvoiceListParams,
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceStatus,
  InvoiceStats,
  CreateInvoiceItemDto,
  UpdateInvoiceItemDto,
  AddPaymentDto,
  InvoicePaymentSubmissionResponse,
  InvoicePaymentSchedule,
} from "./types";

export const invoiceKeys = {
  all: ["invoices"] as const,
  list: (params?: InvoiceListParams) =>
    [...invoiceKeys.all, "list", params] as const,
  detail: (id: string) => [...invoiceKeys.all, "detail", id] as const,
  stats: () => [...invoiceKeys.all, "stats"] as const,
  paymentSchedule: (id: string) =>
    [...invoiceKeys.all, "payment-schedule", id] as const,
};

const invoicesApi = {
  getAll: (params?: InvoiceListParams): Promise<Paginated<Invoice[]>> =>
    apiClientAuth.get("/invoices", { params }).then((res) => res.data),

  getById: (id: string): Promise<Invoice | { data?: Invoice }> =>
    apiClientAuth.get(`/invoices/${id}`).then((res) => res.data),

  getStats: (): Promise<ApiResponse<InvoiceStats>> =>
    apiClientAuth.get("/invoices/stats").then((res) => res.data),

  create: (data: CreateInvoiceDto): Promise<Invoice> =>
    apiClientAuth.post("/invoices", data).then((res) => res.data),

  update: (id: string, data: UpdateInvoiceDto): Promise<Invoice> =>
    apiClientAuth.put(`/invoices/${id}`, data).then((res) => res.data),

  delete: (id: string): Promise<void> =>
    apiClientAuth.delete(`/invoices/${id}`).then((res) => res.data),

  updateStatus: (id: string, status: InvoiceStatus): Promise<Invoice> =>
    apiClientAuth
      .patch(`/invoices/${id}/status`, { status })
      .then((res) => res.data),

  convertFromQuote: ({quoteId, dealId} :{quoteId: string, dealId?: string}): Promise<Invoice> =>
    apiClientAuth
      .post(`/invoices/convert-from-quote/${quoteId}`, { dealId })
      .then((res) => res.data),

  addItem: (invoiceId: string, data: CreateInvoiceItemDto): Promise<Invoice> =>
    apiClientAuth
      .post(`/invoices/${invoiceId}/items`, data)
      .then((res) => res.data),

  updateItem: (
    invoiceId: string,
    itemId: string,
    data: UpdateInvoiceItemDto
  ): Promise<Invoice> =>
    apiClientAuth
      .put(`/invoices/${invoiceId}/items/${itemId}`, data)
      .then((res) => res.data),

  deleteItem: (invoiceId: string, itemId: string): Promise<void> =>
    apiClientAuth
      .delete(`/invoices/${invoiceId}/items/${itemId}`)
      .then((res) => res.data),

  addPayment: (
    data: AddPaymentDto,
  ): Promise<InvoicePaymentSubmissionResponse> =>
    apiClientAuth
      .post(`/payments`, data)
      .then((res) => res.data),

  getPaymentSchedule: (
    id: string,
  ): Promise<InvoicePaymentSchedule | { data?: InvoicePaymentSchedule }> =>
    apiClientAuth.get(`/invoices/${id}/payment-schedule`).then((res) => res.data),
};

export function useInvoices(params?: InvoiceListParams) {
  return useQuery({
    queryKey: invoiceKeys.list(params),
    queryFn: () => invoicesApi.getAll(params),
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: invoiceKeys.detail(id),
    queryFn: async () => {
      const response = await invoicesApi.getById(id);
      const raw = (response as { data?: Invoice }).data ?? response;
      return raw as Invoice;
    },
    enabled: !!id,
  });
}

export function useInvoicesStats() {
  return useQuery({
    queryKey: invoiceKeys.stats(),
    queryFn: () => invoicesApi.getStats(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useInvoicePaymentSchedule(id: string) {
  return useQuery({
    queryKey: invoiceKeys.paymentSchedule(id),
    queryFn: async () => {
      const response = await invoicesApi.getPaymentSchedule(id);
      const raw =
        (response as { data?: InvoicePaymentSchedule }).data ?? response;
      return raw as InvoicePaymentSchedule;
    },
    enabled: !!id,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invoicesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (error) => {
      console.error("Create invoice error:", handleApiError(error));
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateInvoiceDto }) =>
      invoicesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (error) => {
      console.error("Update invoice error:", handleApiError(error));
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invoicesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (error) => {
      console.error("Delete invoice error:", handleApiError(error));
    },
  });
}

export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) =>
      invoicesApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (error) => {
      console.error("Update invoice status error:", handleApiError(error));
    },
  });
}

export function useConvertQuoteToInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invoicesApi.convertFromQuote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (error) => {
      console.error("Convert quote to invoice error:", handleApiError(error));
    },
  });
}

export function useAddInvoiceItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      data,
    }: {
      invoiceId: string;
      data: CreateInvoiceItemDto;
    }) => invoicesApi.addItem(invoiceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (error) => {
      console.error("Add invoice item error:", handleApiError(error));
    },
  });
}

export function useUpdateInvoiceItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      itemId,
      data,
    }: {
      invoiceId: string;
      itemId: string;
      data: UpdateInvoiceItemDto;
    }) => invoicesApi.updateItem(invoiceId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (error) => {
      console.error("Update invoice item error:", handleApiError(error));
    },
  });
}

export function useDeleteInvoiceItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      itemId,
    }: {
      invoiceId: string;
      itemId: string;
    }) => invoicesApi.deleteItem(invoiceId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (error) => {
      console.error("Delete invoice item error:", handleApiError(error));
    },
  });
}

export function useAddPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
    }: {
      data: AddPaymentDto;
    }) => invoicesApi.addPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment-terms"] });
    },
    onError: (error) => {
      console.error("Add payment error:", handleApiError(error));
    },
  });
}
