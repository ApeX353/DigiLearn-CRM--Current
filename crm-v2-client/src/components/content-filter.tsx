import React from "react";
import { Search, Calendar, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Button } from "~/components/ui/button";
import { Calendar as CalendarComponent } from "~/components/ui/calendar";
import { Input } from "~/components/ui/input";
import { format } from "date-fns";
import { cn } from "~/lib/utils";
import type { DateRange, DayPickerProps } from "react-day-picker";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Represents a single option in a dropdown
 */
export type Option = {
  value: string;
  label: string;
  disabled?: boolean;
};

/**
 * Configuration for a single select dropdown filter
 */
export type SelectDropdownFilter = {
  /** Unique identifier for the filter */
  id?: string;
  /** Label/placeholder text for the dropdown */
  label?: string;
  /** Currently selected value */
  value?: string;
  /** Callback when value changes */
  onValueChange: (value: string) => void;
  /** Available options */
  options: Option[];
  /** Display order (lower numbers appear first) */
  order?: number;
  /** Enable multi-select mode (not yet implemented) */
  multiple?: boolean;
  /** Custom width for the dropdown */
  width?: string;
  /** Disable the entire dropdown */
  disabled?: boolean;
  /** Custom component to render instead of default dropdown */
  customComponent?: (
    props: Omit<SelectDropdownFilter, "label" | "value" | "customComponent">,
  ) => React.ReactNode;
};

/**
 * Date value types for single date or date range
 */
export type DateValue = Date | DateRange | undefined;

/**
 * Configuration for the date filter
 */
export type DateFilterConfig = DayPickerProps & {
  /** Single date or date range mode */
  // mode?: undefined;
  /** Current date value */
  value: DateValue;
  /** Callback when date changes */
  onChange: (value: DateValue) => void;
  /** Custom label for the date picker button */
  label?: string;
  /** Disable the date picker */
  disabled?: boolean;
  /** Minimum selectable date */
  minDate?: Date;
  /** Maximum selectable date */
  maxDate?: Date;
  /** Required field*/
  //required:boolean;
};

/**
 * Configuration for search functionality
 */
export type SearchConfig = {
  /** Current search term */
  value: string;
  /** Callback when search term changes */
  onChange: (term: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
  /** Disable the search input */
  disabled?: boolean;
};

/**
 * Configuration for filter dropdowns
 */
export type SelectableFiltersConfig = {
  /** Alignment of the filter group */
  align?: "left" | "right" | "center";
  /** Array of dropdown filters */
  selectors: SelectDropdownFilter[];
};

/**
 * Action component configuration
 */
export type ActionConfig = {
  /** React component or element to render */
  component: React.ReactNode;
  /** Position of the action relative to filters */
  position?: "start" | "end";
  /** Order priority (lower numbers appear first) */
  order?: number;
};

/**
 * Main props for the ContentFilter
 */
export interface ContentFilterProps {
  /** Search configuration */
  search?: SearchConfig;
  /** Dropdown filters configuration */
  selectableFilters?: SelectableFiltersConfig;
  /** Date filter configuration */
  dateFilter?: DateFilterConfig;
  /** Action components (buttons, etc.) */
  actions?: ActionConfig[];
  /** Additional CSS classes for the container */
  className?: string;
  /** Layout direction */
  layout?: "horizontal" | "vertical";
  /** Gap between filter elements */
  gap?: "sm" | "md" | "lg";
  /** Callback when any filter changes */
  onFiltersChange?: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

const gapSizes = {
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
};

/**
 * Sorts items by their order property
 */
const sortByOrder = <T extends { order?: number }>(items: T[]): T[] => {
  return [...items].sort((a, b) => {
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    return orderA - orderB;
  });
};

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Search Input Component
 */
const SearchInput: React.FC<SearchConfig> = ({
  value,
  onChange,
  placeholder = "Search...",
  disabled = false,
}) => {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="pl-9"
      />
    </div>
  );
};

/**
 * Single Select Dropdown Component
 */
const SingleSelectDropdown: React.FC<SelectDropdownFilter> = ({
  id,
  label,
  value,
  onValueChange,
  options,
  width = "w-[180px]",
  disabled = false,
}) => {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={cn(width)} id={id}>
        <SelectValue placeholder={label || "Select option"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/**
 * Date Filter Component
 */
const DateFilterComponent: React.FC<DateFilterConfig> = ({
  mode,
  value,
  onChange,
  label,
  disabled = false,
  minDate,
  maxDate,
}) => {
  const [open, setOpen] = React.useState(false);

  const formatDateDisplay = () => {
    if (!value) return label || "Pick a date";

    if (mode === "single" && value instanceof Date) {
      return format(value, "PPP");
    }

    if (
      mode === "range" &&
      value &&
      typeof value === "object" &&
      "from" in value
    ) {
      if (value.from && value.to) {
        return `${format(value.from, "PP")} - ${format(value.to, "PP")}`;
      } else if (value.from) {
        return format(value.from, "PP");
      }
    }

    return label || "Pick a date";
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-[240px] justify-start text-left font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {formatDateDisplay()}
          {value && !disabled && (
            <X
              className="ml-auto h-4 w-4 opacity-50 hover:opacity-100"
              onClick={handleClear}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {mode === "single" ? (
          <CalendarComponent
            mode="single"
            selected={value as Date | undefined}
            onSelect={(date) => {
              onChange(date);
              setOpen(false);
            }}
            disabled={(date) => {
              if (minDate && date < minDate) return true;
              if (maxDate && date > maxDate) return true;
              return false;
            }}
          />
        ) : mode === "range" ? (
          <CalendarComponent
            mode="range"
            selected={value as DateRange | undefined}
            onSelect={(date) => {
              onChange(date);
            }}
            disabled={(date) => {
              if (minDate && date < minDate) return true;
              if (maxDate && date > maxDate) return true;
              return false;
            }}
          />
        ) : (
          <CalendarComponent
            mode="multiple"
            selected={value as Date[] | undefined}
            onSelect={(date) => {
              onChange(date as DateValue);
            }}
            disabled={(date) => {
              if (minDate && date < minDate) return true;
              if (maxDate && date > maxDate) return true;
              return false;
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};

/**
 * Filter Group Component - Renders all filter controls
 */
const FilterGroup: React.FC<{
  selectors: SelectDropdownFilter[];
  dateFilter?: DateFilterConfig;
  align: "left" | "right" | "center";
  gap: "sm" | "md" | "lg";
}> = ({ selectors, dateFilter, align, gap }) => {
  const sortedSelectors = React.useMemo(
    () => sortByOrder(selectors),
    [selectors],
  );

  const alignmentClass = {
    left: "justify-start",
    right: "justify-end",
    center: "justify-center",
  }[align];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center",
        gapSizes[gap],
        alignmentClass,
      )}
    >
      {/* Select Dropdowns */}
      {sortedSelectors.map((selector, index) => {
        // Use custom component if provided
        if (selector.customComponent) {
          const { label, value, customComponent, ...componentProps } = selector;
          return (
            <div key={selector.id || index}>
              {selector.customComponent(componentProps)}
            </div>
          );
        }

        // Multiple select not yet implemented
        if (selector.multiple) {
          console.warn(
            "Multiple select not yet implemented for filter:",
            selector.label,
          );
          return null;
        }

        return (
          <SingleSelectDropdown key={selector.id || index} {...selector} />
        );
      })}

      {/* Date Filter */}
      {dateFilter && <DateFilterComponent {...dateFilter} />}
    </div>
  );
};

/**
 * Actions Group Component - Renders action buttons/components
 */
const ActionsGroup: React.FC<{
  actions: ActionConfig[];
  gap: "sm" | "md" | "lg";
}> = ({ actions, gap }) => {
  const sortedActions = React.useMemo(() => sortByOrder(actions), [actions]);

  if (sortedActions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center", gapSizes[gap])}>
      {sortedActions.map((action, index) => (
        <div key={index}>{action.component}</div>
      ))}
    </div>
  );
};

// ============================================================================
// Main Filter Component
// ============================================================================

/**
 * ContentFilter - A comprehensive filtering solution
 *
 * Supports search, dropdown filters, date filtering, and custom actions
 * with flexible layout and alignment options.
 */
export const ContentFilter: React.FC<ContentFilterProps> = ({
  search,
  selectableFilters,
  dateFilter,
  actions = [],
  className,
  layout = "horizontal",
  gap = "md",
  onFiltersChange,
}) => {
  // Separate actions by position
  const startActions = React.useMemo(
    () => actions.filter((action) => action.position === "start"),
    [actions],
  );

  const endActions = React.useMemo(
    () => actions.filter((action) => action.position !== "start"),
    [actions],
  );

  // Trigger callback when filters change
  React.useEffect(() => {
    onFiltersChange?.();
  }, [
    search?.value,
    selectableFilters?.selectors,
    dateFilter?.value,
    onFiltersChange,
  ]);

  const isVertical = layout === "vertical";
  const align = selectableFilters?.align || "left";

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "flex items-start",
          isVertical ? "flex-col" : "flex-row flex-wrap",
          gapSizes[gap],
        )}
      >
        {/* Search Section */}
        {search && (
          <div className={cn(isVertical ? "w-full" : "flex-shrink-0")}>
            <SearchInput {...search} />
          </div>
        )}

        {/* Start Actions */}
        {startActions.length > 0 && (
          <ActionsGroup actions={startActions} gap={gap} />
        )}

        {/* Main Filter Group */}
        {(selectableFilters?.selectors.length || dateFilter) && (
          <div className={cn(isVertical ? "w-full" : "flex-1 min-w-0")}>
            <FilterGroup
              selectors={selectableFilters?.selectors || []}
              dateFilter={dateFilter}
              align={align}
              gap={gap}
            />
          </div>
        )}

        {/* End Actions */}
        {endActions.length > 0 && (
          <div className={cn(isVertical ? "w-full" : "ml-auto")}>
            <ActionsGroup actions={endActions} gap={gap} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentFilter;
