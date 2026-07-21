import { Progress } from "~/components/ui/progress";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { CheckCircle, Circle, HelpCircle, Pencil } from "lucide-react";
import { cn } from "~/lib/utils";

export interface StepItem {
  key: string;
  label: string;
  complete: boolean;
  tooltip: string;
}

interface StepCardProps {
  step: number;
  title: string;
  subtitle: string;
  items: StepItem[];
  percentage: number;
  isActive: boolean;
  isComplete: boolean;
  colorClass: string;
  stepTooltip: string;
  justCompleted?: boolean;
  onEdit: () => void;
}

export function StepCard({
  step,
  title,
  subtitle,
  items,
  percentage,
  isActive,
  isComplete,
  colorClass,
  stepTooltip,
  justCompleted,
  onEdit,
}: StepCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-lg border p-4 transition-all overflow-hidden",
        isComplete &&
          "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30",
        isComplete && justCompleted && "animate-celebrate-pulse",
        !isComplete && isActive && "border-primary/50 bg-background",
        !isComplete && !isActive && "border-muted bg-muted/30 opacity-60",
      )}
    >
      {/* Shimmer overlay for completed cards */}
      {isComplete && (
        <div
          className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shine"
          style={{ backgroundSize: "200% 100%" }}
        />
      )}

      {/* Step badge */}
      <div className="flex items-center justify-between mb-3 relative">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all",
              isComplete && "bg-green-500 text-white",
              isComplete && justCompleted && "animate-checkmark-pop",
              !isComplete && isActive && colorClass,
              !isComplete &&
                !isActive &&
                "bg-muted-foreground/20 text-muted-foreground",
            )}
          >
            {isComplete ? <CheckCircle className="h-4 w-4" /> : step}
          </span>
          <div className="flex items-center gap-1.5">
            <div>
              <h4 className="font-semibold text-sm">{title}</h4>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[250px]">
                <p className="text-xs">{stepTooltip}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        {isActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Progress */}
      <div className="mb-3 relative">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">Progress</span>
          <span className={cn("font-medium", isComplete && "text-green-600")}>
            {percentage}%
          </span>
        </div>
        <Progress
          value={percentage}
          className={cn(
            "h-1.5 transition-all duration-500",
            isComplete && "[&>div]:bg-green-500",
            isComplete && justCompleted && "animate-progress-glow",
          )}
        />
      </div>

      {/* Checklist items with tooltips */}
      <div className="space-y-1 relative">
        {items.map((item) => (
          <Tooltip key={item.key}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 text-xs cursor-help hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 transition-colors">
                {item.complete ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0 animate-checkmark-pop" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className={cn(!item.complete && "text-muted-foreground")}>
                  {item.label}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[220px]">
              <p className="text-xs">{item.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
