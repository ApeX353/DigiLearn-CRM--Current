import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { type ColumnDef } from "@tanstack/react-table";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { DataTable } from "~/components/data-table";
import { DataTablePagination } from "~/components/data-table-pagination";
import { Plus, Search } from "lucide-react";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  useSchools,
  type School,
  PROVINCES,
  SCHOOL_TYPES,
  type Province,
  type SchoolType,
} from "~/api/schools";
import { AddSchoolModal } from "~/components/schools/add-school-modal";

// Column definitions for schools table
const schoolColumns: ColumnDef<School>[] = [
  {
    accessorKey: "name",
    header: "School Name",
    cell: ({ row }) => (
      <Link
        to={`/schools/${row.original.id}`}
        className="font-medium hover:underline text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "school_type",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.school_type}</Badge>
    ),
  },
  {
    accessorKey: "ownership_type",
    header: "Ownership",
    cell: ({ row }) => (
      <div className="text-sm">{row.original.ownership_type}</div>
    ),
  },
  {
    accessorKey: "province",
    header: "Province",
    cell: ({ row }) => <div className="text-sm">{row.original.province}</div>,
  },
  {
    accessorKey: "city",
    header: "City",
    cell: ({ row }) => <div className="text-sm">{row.original.city}</div>,
  },
  {
    accessorKey: "principal_name",
    header: "Principal",
    cell: ({ row }) => (
      <div className="text-sm">{row.original.principal_name}</div>
    ),
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) =>
      row.original.is_active ? (
        <Badge variant="default">Active</Badge>
      ) : (
        <Badge variant="secondary">Inactive</Badge>
      ),
  },
];

// Module-level page-size constant. Kept OUTSIDE the component so it
// can't be captured in React state that Vite HMR would preserve
// across module reloads — the previous `useState({ pageSize: 10 })`
// state was what kept the live page stuck at 10 rows even after
// the initializer was bumped to 25. Any code path that reads
// `SCHOOLS_PAGE_SIZE` picks up a change instantly on HMR.
const SCHOOLS_PAGE_SIZE = 25;

export default function SchoolsManagementPage() {
  const navigate = useNavigate();
  const [isAddSchoolOpen, setIsAddSchoolOpen] = useState(false);
  // Pagination: ONLY pageIndex lives in state. pageSize is sourced
  // from the module constant so it can never go stale via HMR.
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [provinceFilter, setProvinceFilter] = useState<Province | "all">("all");
  const [schoolTypeFilter, setSchoolTypeFilter] = useState<SchoolType | "all">(
    "all",
  );

  const { data, isLoading } = useSchools({
    page: pageIndex + 1,
    limit: SCHOOLS_PAGE_SIZE,
    search: searchQuery || undefined,
    province: provinceFilter !== "all" ? provinceFilter : undefined,
    school_type: schoolTypeFilter !== "all" ? schoolTypeFilter : undefined,
  });

  const schools = data?.data || [];

  return (
    <div>
      <PageHeader
        title="Schools"
        actions={
          <Button onClick={() => setIsAddSchoolOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add School
          </Button>
        }
      />

      <AddSchoolModal
        isOpen={isAddSchoolOpen}
        onClose={() => setIsAddSchoolOpen(false)}
      />

      <Container className="p-4 space-y-6">
        {/* Filters Section */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search schools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Province Filter */}
          <Select
            value={provinceFilter}
            onValueChange={(value) =>
              setProvinceFilter(value as Province | "all")
            }
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Province" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Provinces</SelectItem>
              {PROVINCES.map((province) => (
                <SelectItem key={province} value={province}>
                  {province}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* School Type Filter */}
          <Select
            value={schoolTypeFilter}
            onValueChange={(value) =>
              setSchoolTypeFilter(value as SchoolType | "all")
            }
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="School Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {SCHOOL_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Data Table */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading schools...
          </div>
        ) : (
          <DataTable
            columns={schoolColumns}
            data={schools}
            manualPagination
            enablePagination
            pageCount={data?.meta?.totalPages}
            pageIndex={pageIndex}
            pageSize={SCHOOLS_PAGE_SIZE}
            // TanStack passes an updater function — we only surface
            // pageIndex changes back to state; pageSize stays pinned
            // to the module constant. If TanStack ever proposes a
            // different pageSize (it won't, since we don't expose a
            // selector), we ignore it.
            onPaginationChange={(updater) => {
              setPageIndex((prev) => {
                const next =
                  typeof updater === "function"
                    ? updater({ pageIndex: prev, pageSize: SCHOOLS_PAGE_SIZE })
                    : updater;
                return next.pageIndex;
              });
            }}
            renderPagination={(table) => <DataTablePagination table={table} />}
            getRowId={(row) => row.id}
            onRowClick={(row) => navigate(`/schools/${row.original.id}`)}
            emptyState={
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No schools found</p>
                <Button
                  variant="outline"
                  onClick={() => setIsAddSchoolOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First School
                </Button>
              </div>
            }
          />
        )}
      </Container>
    </div>
  );
}
