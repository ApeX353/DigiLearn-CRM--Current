import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, Edit, Trash2, Eye } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useCurrency } from "~/hooks/use-currency";
import type { Deal } from "~/api/deals";
import type { Stage } from "~/api/pipelines";

interface PipelineTableProps {
  pipelineStages: (Stage & { deals: Deal[] })[];
  onView?: (deal: Deal) => void;
  onEdit?: (deal: Deal) => void;
  onDelete?: (deal: Deal) => void;
}

export default function PipelineTable({
  pipelineStages,
  onView,
  onEdit,
  onDelete,
}: PipelineTableProps) {
  const { formatCurrency } = useCurrency();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const deals = useMemo(() => {
    return pipelineStages
      .flatMap((stage) => stage.deals)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [pipelineStages]);

  const getHealthColor = (health: number) => {
    if (health >= 80) return "bg-green-100 text-green-800";
    if (health >= 50) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const getHealthLabel = (health: number) => {
    if (health >= 80) return "Healthy";
    if (health >= 50) return "Warning";
    return "At Risk";
  };

  const getStageColor = (stageId: string) => {
    return (
      pipelineStages.find((stage) => stage.id === stageId)?.color || "#94a3b8"
    );
  };

  const calculateDays = (since?: string): number => {
    if (!since) return 0;
    return differenceInDays(new Date(), new Date(since));
  };

  const columns = useMemo<ColumnDef<Deal>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-2 font-semibold px-0"
          >
            Deal
            <ArrowUpDown className="w-4 h-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="font-medium">
            {row.original.deal_name || row.original.title}
          </div>
        ),
      },
      {
        accessorKey: "school.name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-2 font-semibold px-0"
          >
            School
            <ArrowUpDown className="w-4 h-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span>{row.original.school?.name || "-"}</span>
        ),
      },
      {
        accessorKey: "value",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-2 font-semibold px-0"
          >
            Value
            <ArrowUpDown className="w-4 h-4" />
          </Button>
        ),
        cell: ({ getValue }) => (
          <div className="font-medium">
            {formatCurrency(getValue() as number)}
          </div>
        ),
      },
      {
        accessorKey: "stage_id",
        header: "Stage",
        cell: ({ getValue, row }) => {
          const color = getStageColor(getValue() as string);
          return (
            <span
              className="px-2 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: color }}
            >
              {row.original.currentStatus ||
                row.original.current_stage?.name ||
                "-"}
            </span>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs">
            {format(new Date(row.original.created_at), "MMM dd, yyyy")}
          </span>
        ),
      },
      {
        accessorKey: "owner",
        header: "Owner",
        cell: ({ row }) => {
          const owner = row.original.owner;
          return (
            <span>
              {owner
                ? `${owner.first_name} ${owner.last_name}`
                : "-"}
            </span>
          );
        },
      },
      {
        accessorKey: "health_score",
        header: "Health",
        cell: ({ getValue }) => {
          const health = (getValue() as number) ?? 0;
          return (
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${getHealthColor(health)}`}
            >
              {getHealthLabel(health)} ({health}%)
            </span>
          );
        },
      },
      {
        id: "days",
        accessorKey: "current_stage_since",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-2 font-semibold px-0"
          >
            Days
            <ArrowUpDown className="w-4 h-4" />
          </Button>
        ),
        cell: ({ getValue }) => {
          const days = calculateDays(getValue() as string | undefined);
          return <span>{days} days</span>;
        },
        sortingFn: (rowA, rowB) => {
          const daysA = calculateDays(rowA.original.current_stage_since);
          const daysB = calculateDays(rowB.original.current_stage_since);
          return daysA - daysB;
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {onView && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onView(row.original)}
              >
                <Eye className="w-4 h-4 mr-1" /> View
              </Button>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(row.original)}
              >
                <Edit className="w-4 h-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="text-red-600 hover:bg-red-100"
                onClick={() => onDelete(row.original)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [onView, onEdit, onDelete, formatCurrency, pipelineStages]
  );

  const table = useReactTable<Deal>({
    data: deals,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="w-full">
      <div className="mb-4 px-4 pt-4">
        <Input
          value={globalFilter ?? ""}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search deals..."
          className="max-w-md"
        />
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center"
              >
                No deals found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="p-4 text-sm text-muted-foreground">
        Showing {table.getRowModel().rows.length} of {deals.length} deals
      </div>
    </div>
  );
}
