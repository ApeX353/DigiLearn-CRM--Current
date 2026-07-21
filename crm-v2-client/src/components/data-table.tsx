import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type PaginationState,
  type RowSelectionState,
  type TableOptions,
  type OnChangeFn,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  // Pagination
  enablePagination?: boolean;
  pageSize?: number;
  pageIndex?: number;
  onPaginationChange?: OnChangeFn<PaginationState>;
  manualPagination?: boolean;
  pageCount?: number;

  // Sorting
  enableSorting?: boolean;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;

  // Filtering
  enableFiltering?: boolean;
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  globalFilter?: string;
  onGlobalFilterChange?: OnChangeFn<string>;
  manualFiltering?: boolean;

  // Column Visibility
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;

  // Row Selection
  enableRowSelection?: boolean | ((row: any) => boolean);
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  // Additional table options
  getRowId?: (originalRow: TData, index: number) => string;
  enableMultiRowSelection?: boolean;
  enableSubRowSelection?: boolean;

  // Custom rendering
  renderToolbar?: (
    table: ReturnType<typeof useReactTable<TData>>
  ) => React.ReactNode;
  renderPagination?: (
    table: ReturnType<typeof useReactTable<TData>>
  ) => React.ReactNode;
  emptyState?: React.ReactNode;

  // Row customization
  rowClassName?: string | ((row: any) => string);
  onRowClick?: (row: any) => void;

  // Additional TableOptions to pass through
  tableOptions?: Partial<TableOptions<TData>>;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  // Pagination
  enablePagination = true,
  pageSize = 10,
  pageIndex = 0,
  onPaginationChange,
  manualPagination = false,
  pageCount,

  // Sorting
  enableSorting = true,
  sorting: controlledSorting,
  onSortingChange,
  manualSorting = false,

  // Filtering
  enableFiltering = true,
  columnFilters: controlledColumnFilters,
  onColumnFiltersChange,
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange,
  manualFiltering = false,

  // Column Visibility
  columnVisibility: controlledColumnVisibility,
  onColumnVisibilityChange,

  // Row Selection
  enableRowSelection = false,
  rowSelection: controlledRowSelection,
  onRowSelectionChange,

  // Additional options
  getRowId,
  enableMultiRowSelection = true,
  enableSubRowSelection = true,

  // Custom rendering
  renderToolbar,
  renderPagination,
  emptyState,

  // Row customization
  rowClassName,
  onRowClick,

  // Pass-through options
  tableOptions = {},
}: DataTableProps<TData, TValue>) {
  // Internal state
  const [internalSorting, setInternalSorting] = React.useState<SortingState>(
    []
  );
  const [internalColumnFilters, setInternalColumnFilters] =
    React.useState<ColumnFiltersState>([]);
  const [internalColumnVisibility, setInternalColumnVisibility] =
    React.useState<VisibilityState>({});
  const [internalRowSelection, setInternalRowSelection] =
    React.useState<RowSelectionState>({});
  const [internalGlobalFilter, setInternalGlobalFilter] =
    React.useState<string>("");
  const [internalPagination, setInternalPagination] =
    React.useState<PaginationState>({
      pageIndex,
      pageSize,
    });

  // Use controlled state if provided, otherwise use internal state
  const sorting =
    controlledSorting !== undefined ? controlledSorting : internalSorting;
  const setSorting = onSortingChange || setInternalSorting;

  const columnFilters =
    controlledColumnFilters !== undefined
      ? controlledColumnFilters
      : internalColumnFilters;
  const setColumnFilters = onColumnFiltersChange || setInternalColumnFilters;

  const columnVisibility =
    controlledColumnVisibility !== undefined
      ? controlledColumnVisibility
      : internalColumnVisibility;
  const setColumnVisibility =
    onColumnVisibilityChange || setInternalColumnVisibility;

  const rowSelection =
    controlledRowSelection !== undefined
      ? controlledRowSelection
      : internalRowSelection;
  const setRowSelection = onRowSelectionChange || setInternalRowSelection;

  const globalFilter =
    controlledGlobalFilter !== undefined
      ? controlledGlobalFilter
      : internalGlobalFilter;
  const setGlobalFilter = onGlobalFilterChange || setInternalGlobalFilter;

  const pagination = onPaginationChange
    ? { pageIndex, pageSize }
    : internalPagination;
  const setPagination = onPaginationChange || setInternalPagination;

  const table = useReactTable({
    data,
    columns,

    // Core
    getCoreRowModel: getCoreRowModel(),

    // Sorting
    ...(enableSorting && {
      getSortedRowModel: getSortedRowModel(),
      onSortingChange: setSorting,
      manualSorting,
      enableSorting: true,
    }),

    // Filtering
    ...(enableFiltering && {
      getFilteredRowModel: getFilteredRowModel(),
      onColumnFiltersChange: setColumnFilters,
      onGlobalFilterChange: setGlobalFilter,
      manualFiltering,
      enableFilters: true,
      enableGlobalFilter: true,
    }),

    // Pagination
    ...(enablePagination && {
      getPaginationRowModel: getPaginationRowModel(),
      onPaginationChange: setPagination,
      manualPagination,
      ...(pageCount !== undefined && { pageCount }),
    }),

    // Column Visibility
    onColumnVisibilityChange: setColumnVisibility,

    // Row Selection
    enableRowSelection,
    enableMultiRowSelection,
    enableSubRowSelection,
    onRowSelectionChange: setRowSelection,

    // Row ID
    ...(getRowId && { getRowId }),

    // State
    state: {
      ...(enableSorting && { sorting }),
      ...(enableFiltering && { columnFilters, globalFilter }),
      columnVisibility,
      ...(enableRowSelection && { rowSelection }),
      ...(enablePagination && { pagination }),
    },

    // Merge additional table options
    ...tableOptions,
  });

  return (
    <div className="space-y-4">
      {renderToolbar && renderToolbar(table)}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isPinned = header.column.getIsPinned();
                  return (
                    <TableHead
                      key={header.id}
                      style={{
                        position: isPinned ? "sticky" : "relative",
                        left:
                          isPinned === "left"
                            ? `${header.column.getStart("left")}px`
                            : undefined,
                        right:
                          isPinned === "right"
                            ? `${header.column.getAfter("right")}px`
                            : undefined,
                        zIndex: isPinned ? 1 : 0,
                        backgroundColor: "hsl(var(--background))",
                      }}
                      className={cn(
                        isPinned &&
                          "border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(
                    typeof rowClassName === "function"
                      ? rowClassName(row)
                      : rowClassName,
                    onRowClick && "cursor-pointer transition-colors"
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isPinned = cell.column.getIsPinned();
                    return (
                      <TableCell
                        key={cell.id}
                        style={{
                          position: isPinned ? "sticky" : "relative",
                          left:
                            isPinned === "left"
                              ? `${cell.column.getStart("left")}px`
                              : undefined,
                          right:
                            isPinned === "right"
                              ? `${cell.column.getAfter("right")}px`
                              : undefined,
                          zIndex: isPinned ? 1 : 0,
                          backgroundColor: "hsl(var(--background))",
                        }}
                        className={cn(
                          isPinned &&
                            "border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {emptyState || "No results."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {enablePagination &&
        (renderPagination ? (
          renderPagination(table)
        ) : (
          <div className="flex items-center justify-end space-x-2">
            <div className="flex-1 text-sm text-muted-foreground">
              {enableRowSelection && (
                <>
                  {table.getFilteredSelectedRowModel().rows.length} of{" "}
                  {table.getFilteredRowModel().rows.length} row(s) selected.
                </>
              )}
            </div>
            <div className="space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}
