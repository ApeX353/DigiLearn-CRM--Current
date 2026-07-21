import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Button } from "~/components/ui/button";
import { DatePicker } from "~/components/ui/date-picker";
import { Filter, X } from "lucide-react";
import type {
  DateRangeType,
  DashboardFilters as DashboardFiltersType,
} from "~/api/dashboard";
import { useAllStaff } from "~/api/staff";
import { PROVINCES } from "~/api/schools";
//import type { Role } from "~/api/rbac";

const PRODUCT_CATEGORIES = [
  "Board",
  "Tablet",
  "Laptop",
  "LMS",
  "STEM",
  "VR",
  "Bundle",
  "Service",
];

interface DashboardFiltersProps {
  filters: DashboardFiltersType;
  onFiltersChange: (filters: DashboardFiltersType) => void;
}

export function DashboardFilters({
  filters,
  onFiltersChange,
}: DashboardFiltersProps) {
  const { data: users } = useAllStaff({
    limit: 100,
    page: 1,
    status: "active",
  });

  // Filter to only show sales reps (you may need to adjust this based on your user roles)
  // TODO - Make sure this returens all the reps and fix the incorreclty typed roles. use only DB roles and abilities for filtering
  const salesReps = users?.data || [];

  const handleDateRangeChange = (value: DateRangeType) => {
    if (value === "custom") {
      const selectedDate =
        filters.customStartDate ?? filters.customEndDate ?? new Date();

      onFiltersChange({
        ...filters,
        dateRange: value,
        customStartDate: selectedDate,
        customEndDate: selectedDate,
      });
      return;
    }

    onFiltersChange({
      ...filters,
      dateRange: value,
      customStartDate: undefined,
      customEndDate: undefined,
    });
  };

  const handleSpecificDateChange = (date: Date | undefined) => {
    if (!date) return;

    onFiltersChange({
      ...filters,
      dateRange: "custom",
      customStartDate: date,
      customEndDate: date,
    });
  };

  const handleSalesRepChange = (value: string) => {
    onFiltersChange({
      ...filters,
      salesRepId: value === "all" ? undefined : value,
    });
  };

  const handleProvinceChange = (value: string) => {
    onFiltersChange({
      ...filters,
      province: value === "all" ? undefined : value,
    });
  };

  const handleProductCategoryChange = (value: string) => {
    onFiltersChange({
      ...filters,
      productCategory: value === "all" ? undefined : value,
    });
  };

  const clearFilters = () => {
    onFiltersChange({
      dateRange: "mtd",
      salesRepId: undefined,
      province: undefined,
      productCategory: undefined,
    });
  };

  const hasActiveFilters =
    filters.salesRepId || filters.province || filters.productCategory;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card rounded-lg border">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Filter className="h-4 w-4" />
        Filters:
      </div>

      {/* Date Range */}
      <Select value={filters.dateRange} onValueChange={handleDateRangeChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Date Range" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="mtd">Month to Date</SelectItem>
          <SelectItem value="qtd">Quarter to Date</SelectItem>
          <SelectItem value="ytd">Year to Date</SelectItem>
          <SelectItem value="custom">Specific Date</SelectItem>
        </SelectContent>
      </Select>

      {filters.dateRange === "custom" && (
        <DatePicker
          value={filters.customStartDate}
          onChange={handleSpecificDateChange}
          placeholder="Select date"
          className="w-[180px]"
        />
      )}

      {/* Sales Rep */}
      <Select
        value={filters.salesRepId || "all"}
        onValueChange={handleSalesRepChange}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Sales Rep" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Sales Reps</SelectItem>
          {(salesReps || []).map((rep) => (
            <SelectItem key={rep.id} value={rep.id}>
              {rep.first_name} {rep.last_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Province */}
      <Select
        value={filters.province || "all"}
        onValueChange={handleProvinceChange}
      >
        <SelectTrigger className="w-[180px]">
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

      {/* Product Category */}
      <Select
        value={filters.productCategory || "all"}
        onValueChange={handleProductCategoryChange}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Product" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Products</SelectItem>
          {PRODUCT_CATEGORIES.map((category) => (
            <SelectItem key={category} value={category}>
              {category}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
