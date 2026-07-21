import {
  CircleAlert,
  AlertTriangle,
  BellOff,
  BadgeCheck,
  Flame,
  Snowflake,
  Thermometer,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { calculateLeadCompleteness } from "~/lib/lead-completeness";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import type { Lead } from "~/api/leads";

interface LeadRowMarkersProps {
  lead: Lead;
  /** Compact mode renders only icons; default shows icon + 1-2 char label. */
  compact?: boolean;
  className?: string;
}

/**
 * Strip of at-a-glance badges rendered next to a lead in list rows
 * and kanban cards. Each marker is deliberately small and muted
 * until it signals a real problem — so the signal-to-noise ratio
 * stays manageable when you have hundreds of leads on one screen.
 *
 * Markers in order of severity:
 *   - SLA breach          (red)
 *   - Overdue follow-up   (red, derived from SLA date)
 *   - No next activity    (amber, lead is not "New")
 *   - Incomplete data     (red/amber, from lead-completeness)
 *   - Unqualified         (amber, contacted/nurture without BANT)
 *   - Temperature         (hot/warm/cold)
 *   - Qualified           (emerald)
 */
export function LeadRowMarkers({
  lead,
  compact = false,
  className,
}: LeadRowMarkersProps) {
  const completeness = calculateLeadCompleteness(lead);

  const isPastNew = lead.status !== "New";
  const isTerminal = lead.status === "Converted" || lead.status === "Disqualified";
  const hasNoNextActivity = !lead.current_sla_due_date && !isTerminal;
  const slaDueSoon =
    !!lead.current_sla_due_date &&
    new Date(lead.current_sla_due_date).getTime() < Date.now() &&
    !lead.sla_breached;

  const markers: Array<{
    key: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    tooltip: string;
    className: string;
  }> = [];

  if (lead.sla_breached) {
    markers.push({
      key: "sla",
      icon: AlertTriangle,
      label: "SLA",
      tooltip: "SLA breached — action required",
      className:
        "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900",
    });
  } else if (slaDueSoon) {
    markers.push({
      key: "overdue",
      icon: AlertTriangle,
      label: "Due",
      tooltip: "Follow-up is overdue",
      className:
        "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900",
    });
  }

  if (hasNoNextActivity && isPastNew) {
    markers.push({
      key: "no-next",
      icon: BellOff,
      label: "No next",
      tooltip: "No next activity scheduled",
      className:
        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
    });
  }

  if (completeness.status === "critical") {
    markers.push({
      key: "data",
      icon: CircleAlert,
      label: "Data",
      tooltip: `Incomplete data (${completeness.score}/100) — ${completeness.missingCritical
        .map((f) => f.label)
        .slice(0, 3)
        .join(", ")}`,
      className:
        "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900",
    });
  } else if (completeness.status === "partial") {
    markers.push({
      key: "data",
      icon: CircleAlert,
      label: "Partial",
      tooltip: `Partial data (${completeness.score}/100)`,
      className:
        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
    });
  }

  if (
    (lead.status === "Contacted" || lead.status === "Nurture") &&
    !lead.decision_maker_confirmed
  ) {
    markers.push({
      key: "unqualified",
      icon: BadgeCheck,
      label: "Qualify",
      tooltip: "Not yet qualified — confirm BANT",
      className:
        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
    });
  }

  if (lead.status === "Qualified") {
    markers.push({
      key: "qualified",
      icon: BadgeCheck,
      label: "Qualified",
      tooltip: "Lead meets qualification criteria",
      className:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900",
    });
  }

  if (lead.temperature) {
    const tempConfig = {
      hot: {
        icon: Flame,
        label: "Hot",
        className:
          "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900",
      },
      warm: {
        icon: Thermometer,
        label: "Warm",
        className:
          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
      },
      cold: {
        icon: Snowflake,
        label: "Cold",
        className:
          "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900",
      },
    } as const;
    const entry = tempConfig[lead.temperature];
    if (entry) {
      markers.push({
        key: "temp",
        icon: entry.icon,
        label: entry.label,
        tooltip: `Temperature: ${lead.temperature}${
          lead.temperature_score !== null
            ? ` (score ${lead.temperature_score})`
            : ""
        }`,
        className: entry.className,
      });
    }
  }

  if (markers.length === 0) return null;

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {markers.map((m) => {
          const Icon = m.icon;
          return (
            <Tooltip key={m.key}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-1.5 h-5 text-[10px] font-medium",
                    m.className,
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {!compact && <span>{m.label}</span>}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {m.tooltip}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
