import { Check, Circle, X, ArrowRight } from "lucide-react";
import { cn } from "~/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import type { LeadStatus } from "~/api/leads";

interface LeadStatusProgressionProps {
  currentStatus: LeadStatus;
  createdAt: Date;
  lastContactedAt: Date | null;
  convertedAt: Date | null;
  lastActionAt: Date | null;
}

const statusOrder: LeadStatus[] = ["New", "Contacted", "Qualified", "Converted"];

function StatusNode({
  status,
  isActive,
  isCompleted,
  timestamp,
  showTooltip = true,
}: {
  status: LeadStatus;
  isActive: boolean;
  isCompleted: boolean;
  timestamp?: Date | null;
  showTooltip?: boolean;
}) {
  const content = (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
        isCompleted && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100",
        isActive && !isCompleted && "bg-primary/10 text-primary border-2 border-primary",
        !isActive && !isCompleted && "bg-muted text-muted-foreground"
      )}
    >
      {isCompleted ? (
        <Check className="h-4 w-4" />
      ) : isActive ? (
        <Circle className="h-4 w-4 fill-current" />
      ) : (
        <Circle className="h-4 w-4" />
      )}
      <span>{status}</span>
    </div>
  );

  if (!showTooltip || !timestamp) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {content}
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <p>{format(new Date(timestamp), "MMM dd, yyyy 'at' h:mm a")}</p>
          <p className="text-muted-foreground">
            {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function Connector({ isActive }: { isActive: boolean }) {
  return (
    <ArrowRight
      className={cn(
        "h-4 w-4 transition-colors flex-shrink-0",
        isActive ? "text-green-500" : "text-muted-foreground/30"
      )}
    />
  );
}

export function LeadStatusProgression({
  currentStatus,
  createdAt,
  lastContactedAt,
  convertedAt,
  lastActionAt,
}: LeadStatusProgressionProps) {
  const currentIndex = statusOrder.indexOf(currentStatus);
  const isDisqualified = currentStatus === "Disqualified";

  // Calculate days in current status
  const daysInStatus = lastActionAt
    ? Math.floor(
        (new Date().getTime() - new Date(lastActionAt).getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0;

  return (
    <div className="space-y-3">
      {/* Main progression */}
      <div className="flex items-center justify-center flex-wrap gap-2">
        {statusOrder.map((status, index) => {
          const isActive = index === currentIndex && !isDisqualified;
          const isCompleted = index < currentIndex && !isDisqualified;

          // Determine timestamp for each status
          let timestamp: Date | null = null;
          if (status === "New") timestamp = createdAt;
          else if (status === "Contacted") timestamp = lastContactedAt;
          else if (status === "Converted") timestamp = convertedAt;

          return (
            <div key={status} className="flex items-center gap-2">
              <StatusNode
                status={status}
                isActive={isActive}
                isCompleted={isCompleted || (status === "Converted" && convertedAt !== null)}
                timestamp={timestamp}
              />
              {index < statusOrder.length - 1 && (
                <Connector isActive={isCompleted} />
              )}
            </div>
          );
        })}
      </div>

      {/* Disqualified branch */}
      {isDisqualified && (
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100">
            <X className="h-4 w-4" />
            <span>Disqualified</span>
          </div>
        </div>
      )}

      {/* Days in status */}
      {!isDisqualified && currentStatus !== "Converted" && daysInStatus > 0 && (
        <div className="text-center text-xs text-muted-foreground">
          In {currentStatus} status for {daysInStatus} {daysInStatus === 1 ? "day" : "days"}
        </div>
      )}
    </div>
  );
}
