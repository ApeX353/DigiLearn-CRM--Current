import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClientAuth, handleApiError } from "~/api/axios"
import type { Paginated, PaginationParams } from "~/api/common-api-type"
import type { CreateFilePayload, FileRecord, FileEntityType } from "./types"

type FileListParams = PaginationParams & {
  entity_type?: FileEntityType
  entity_id?: string
  provider?: string
  search?: string
}

const keys = {
  all: ["files"] as const,
  list: (params?: FileListParams) => [...keys.all, "list", params] as const,
  detail: (id: string) => [...keys.all, "detail", id] as const,
}

const api = {
  list: (params?: FileListParams): Promise<Paginated<FileRecord[]>> =>
    apiClientAuth.get("/file-manager", { params }).then((res) => res.data),
  create: (data: CreateFilePayload): Promise<FileRecord> =>
    apiClientAuth.post("/file-manager", data).then((res) => res.data),
  remove: (id: string): Promise<void> =>
    apiClientAuth.delete(`/file-manager/${id}`).then((res) => res.data),
}

export function useFiles(params?: FileListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api.list(params),
    enabled: !!params,
  })
}

export function useCreateFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all })
    },
    onError: (error) => {
      console.error("Create file error:", handleApiError(error))
    },
  })
}

export function useDeleteFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all })
    },
    onError: (error) => {
      console.error("Delete file error:", handleApiError(error))
    },
  })
}
