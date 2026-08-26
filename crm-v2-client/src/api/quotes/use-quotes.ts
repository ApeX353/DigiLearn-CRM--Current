import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth, handleApiError } from "~/api/axios";
import type { ApiResponse, Paginated } from "../common-api-type";
import type {
  Quote,
  QuoteListParams,
  CreateQuoteDto,
  UpdateQuoteDto,
  QuoteStatus,
  QuoteStats,
  CreateQuoteItemDto,
  UpdateQuoteItemDto,
} from "./types";

export const quoteKeys = {
  all: ["quotes"] as const,
  list: (params?: QuoteListParams) =>
    [...quoteKeys.all, "list", params] as const,
  detail: (id: string) => [...quoteKeys.all, "detail", id] as const,
  stats: () => [...quoteKeys.all, "stats"] as const,
};

const quotesApi = {
  getAll: (params?: QuoteListParams): Promise<Paginated<Quote[]>> =>
    apiClientAuth.get("/quotes", { params }).then((res) => res.data),

  getById: (id: string): Promise<ApiResponse<Quote>> =>
    apiClientAuth.get(`/quotes/${id}`).then((res) => res.data),

  getStats: (): Promise<ApiResponse<QuoteStats>> =>
    apiClientAuth.get("/quotes/stats").then((res) => res.data),

  create: (data: CreateQuoteDto): Promise<Quote> =>
    apiClientAuth.post("/quotes", data).then((res) => res.data),

  update: (id: string, data: UpdateQuoteDto): Promise<Quote> =>
    apiClientAuth.put(`/quotes/${id}`, data).then((res) => res.data),

  delete: (id: string): Promise<void> =>
    apiClientAuth.delete(`/quotes/${id}`).then((res) => res.data),

  updateStatus: (id: string, status: QuoteStatus): Promise<Quote> =>
    apiClientAuth
      .patch(`/quotes/${id}/status`, { status })
      .then((res) => res.data),

  // QUOTE6: re-issue an (expired) quote — server clones it into a fresh
  // Draft with a new validity window and returns the new quote.
  reissue: (id: string): Promise<ApiResponse<Quote>> =>
    apiClientAuth.post(`/quotes/${id}/reissue`).then((res) => res.data),

  addItem: (quoteId: string, data: CreateQuoteItemDto): Promise<Quote> =>
    apiClientAuth
      .post(`/quotes/${quoteId}/items`, data)
      .then((res) => res.data),

  updateItem: (
    quoteId: string,
    itemId: string,
    data: UpdateQuoteItemDto
  ): Promise<Quote> =>
    apiClientAuth
      .put(`/quotes/${quoteId}/items/${itemId}`, data)
      .then((res) => res.data),

  deleteItem: (quoteId: string, itemId: string): Promise<void> =>
    apiClientAuth
      .delete(`/quotes/${quoteId}/items/${itemId}`)
      .then((res) => res.data),

  // Blob-free download — the server generates the PDF and streams it back.
  downloadPdf: (id: string): Promise<Blob> =>
    apiClientAuth
      .get(`/quotes/${id}/pdf`, { responseType: "blob" })
      .then((res) => res.data),
};

export function useDownloadQuotePdf() {
  return useMutation({
    mutationFn: async ({
      id,
      quoteNumber,
    }: {
      id: string;
      quoteNumber?: string;
    }) => {
      const blob = await quotesApi.downloadPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${quoteNumber || "quote"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}

export function useQuotes(params?: QuoteListParams) {
  return useQuery({
    queryKey: quoteKeys.list(params),
    queryFn: () => quotesApi.getAll(params),
  });
}

export function useQuote(id: string) {
  return useQuery({
    queryKey: quoteKeys.detail(id),
    queryFn: () => quotesApi.getById(id),
    enabled: !!id,
  });
}

export function useQuotesStats() {
  return useQuery({
    queryKey: quoteKeys.stats(),
    queryFn: () => quotesApi.getStats(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: quotesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all });
    },
    onError: (error) => {
      console.error("Create quote error:", handleApiError(error));
    },
  });
}

export function useUpdateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateQuoteDto }) =>
      quotesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all });
    },
    onError: (error) => {
      console.error("Update quote error:", handleApiError(error));
    },
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: quotesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all });
    },
    onError: (error) => {
      console.error("Delete quote error:", handleApiError(error));
    },
  });
}

export function useUpdateQuoteStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuoteStatus }) =>
      quotesApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all });
    },
    onError: (error) => {
      console.error("Update quote status error:", handleApiError(error));
    },
  });
}

export function useReissueQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => quotesApi.reissue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all });
    },
    onError: (error) => {
      console.error("Re-issue quote error:", handleApiError(error));
    },
  });
}

export function useAddQuoteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      quoteId,
      data,
    }: {
      quoteId: string;
      data: CreateQuoteItemDto;
    }) => quotesApi.addItem(quoteId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all });
    },
    onError: (error) => {
      console.error("Add quote item error:", handleApiError(error));
    },
  });
}

export function useUpdateQuoteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      quoteId,
      itemId,
      data,
    }: {
      quoteId: string;
      itemId: string;
      data: UpdateQuoteItemDto;
    }) => quotesApi.updateItem(quoteId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all });
    },
    onError: (error) => {
      console.error("Update quote item error:", handleApiError(error));
    },
  });
}

export function useDeleteQuoteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ quoteId, itemId }: { quoteId: string; itemId: string }) =>
      quotesApi.deleteItem(quoteId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.all });
    },
    onError: (error) => {
      console.error("Delete quote item error:", handleApiError(error));
    },
  });
}
