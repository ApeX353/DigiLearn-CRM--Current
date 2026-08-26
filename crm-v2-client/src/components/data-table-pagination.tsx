import type { Table } from "@tanstack/react-table";
import { cn } from "~/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";

type PageToken = number | "ellipsis";

function buildPageTokens(
  currentPage: number,
  totalPages: number,
  siblingCount: number,
  boundaryCount: number,
): PageToken[] {
  if (totalPages <= 0) return [];

  const pages = new Set<number>();

  for (let i = 1; i <= Math.min(boundaryCount, totalPages); i += 1) {
    pages.add(i);
  }

  for (
    let i = Math.max(totalPages - boundaryCount + 1, 1);
    i <= totalPages;
    i += 1
  ) {
    pages.add(i);
  }

  for (
    let i = Math.max(currentPage - siblingCount, 1);
    i <= Math.min(currentPage + siblingCount, totalPages);
    i += 1
  ) {
    pages.add(i);
  }

  const sortedPages = Array.from(pages).sort((a, b) => a - b);
  const tokens: PageToken[] = [];

  sortedPages.forEach((page, index) => {
    const previous = sortedPages[index - 1];
    if (previous !== undefined && page - previous > 1) {
      tokens.push("ellipsis");
    }
    tokens.push(page);
  });

  return tokens;
}

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  className?: string;
  siblingCount?: number;
  boundaryCount?: number;
}

export function DataTablePagination<TData>({
  table,
  className,
  siblingCount = 1,
  boundaryCount = 1,
}: DataTablePaginationProps<TData>) {
  const { pageIndex } = table.getState().pagination;
  const totalPages = Math.max(table.getPageCount(), 1);
  const currentPage = pageIndex + 1;
  const pageTokens = buildPageTokens(
    currentPage,
    totalPages,
    siblingCount,
    boundaryCount,
  );

  const canGoPrevious = table.getCanPreviousPage();
  const canGoNext = table.getCanNextPage();

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        Page {currentPage} of {totalPages}
      </p>

      <Pagination className="mx-0 w-auto justify-start sm:justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(event) => {
                event.preventDefault();
                if (canGoPrevious) {
                  table.previousPage();
                }
              }}
              className={cn(!canGoPrevious && "pointer-events-none opacity-50")}
            />
          </PaginationItem>

          {pageTokens.map((token, index) => (
            <PaginationItem key={`${token}-${index}`}>
              {token === "ellipsis" ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  href="#"
                  isActive={token === currentPage}
                  onClick={(event) => {
                    event.preventDefault();
                    table.setPageIndex(token - 1);
                  }}
                >
                  {token}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(event) => {
                event.preventDefault();
                if (canGoNext) {
                  table.nextPage();
                }
              }}
              className={cn(!canGoNext && "pointer-events-none opacity-50")}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
