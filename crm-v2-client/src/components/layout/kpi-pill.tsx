import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/**
 * KpiPill — shared compact stat tile.
 *
 * Replaces the previous pattern of dropping a full `Card` with default
 * `p-6 + text-xl` for every small metric. That pattern:
 *   - overflowed narrow side rails (school left pane, ~398px)
 *   - wasted vertical space on list pages
 *   - drowned the value with oversized padding
 *
 * Single-row layout: optional icon chip · label overline · value.
 * `text-sm` value sits comfortably inside a ~180px column and still
 * reads as the primary number. Intentionally minimal so it can be
 * arrayed in any grid the caller wants (1-col inside side rails,
 * 6-col across a KPI strip).
 */
export interface KpiPillProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  /** Background tint for the icon chip. Defaults to `bg-muted`. */
  accent?: string;
  /** Optional trailing sub-value shown under the main value. */
  sub?: ReactNode;
  className?: string;
}

export function KpiPill({
  label,
  value,
  icon,
  accent,
  sub,
  className,
}: KpiPillProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-3 py-2",
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            "flex size-7 items-center justify-center rounded-md shrink-0",
            accent ?? "bg-muted",
          )}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-tight">
          {label}
        </p>
        <p className="text-sm font-semibold tabular truncate leading-tight">
          {value}
        </p>
        {sub && (
          <p className="text-[11px] text-muted-foreground truncate leading-tight">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}
