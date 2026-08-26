export type Paginated<T> = {
  data: T;
  meta: PaginationMeta;
};

type PaginationMeta = {
  totalItems: number;
  itemCount: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;
};

export type PaginationParams = {
  page: number;
  limit: number;
};

export type ApiResponse<T> = {
  status: number;
  data: T
}
