import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  Product,
  ProductType,
  CreateProductValues,
  UpdateProductValues,
} from "./types";
import type { Paginated, PaginationParams } from "../common-api-type";

const keys = {
  all: ["products"] as const,
  list: (
    params: PaginationParams & {
      search?: string;
      product_type?: ProductType;
      category?: string;
      is_active?: boolean;
    },
  ) => [...keys.all, "list", params] as const,
  byId: (id: string) => [...keys.all, "detail", id] as const,
};

const api = {
  getAll: (
    params: PaginationParams & {
      search?: string;
      product_type?: ProductType;
      category?: string;
      is_active?: boolean;
    },
  ): Promise<Paginated<Product[]>> =>
    apiClientAuth.get("/products", { params }).then((r) => r.data),

  getById: (id: string): Promise<Product> =>
    apiClientAuth.get(`/products/${id}`).then((r) => r.data),

  create: (data: CreateProductValues): Promise<Product> =>
    apiClientAuth.post("/products", data).then((r) => r.data),

  update: (id: string, data: UpdateProductValues): Promise<Product> =>
    apiClientAuth.put(`/products/${id}`, data).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    apiClientAuth.delete(`/products/${id}`).then((r) => r.data),
};

export function useProducts(
  params: PaginationParams & {
    search?: string;
    product_type?: ProductType;
    category?: string;
    is_active?: boolean;
  },
) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api.getAll(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: keys.byId(id),
    queryFn: () => api.getById(id),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProductValues) => api.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductValues }) =>
      api.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useToggleProductActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
