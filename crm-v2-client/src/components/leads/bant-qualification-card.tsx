import { CheckCircle2, Circle, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { Lead } from "~/api/leads";

interface BANTQualificationCardProps {
  lead: Lead;
  onEdit?: () => void;
}

interface BANTCriterion {
  key: string;
  label: string;
  letter: string;
  isComplete: boolean;
  tooltip: string;
}

export function BANTQualificationCard({ lead, onEdit }: BANTQualificationCardProps) {
  const criteria: BANTCriterion[] = [
    {
      key: "budget",
      label: "Budget allocated or path to funding",
      letter: "B",
      isComplete: lead.budget_fit || false,
      tooltip: "Does the school have budget allocated, or is there a clear path to securing funds?",
    },
    {
      key: "authority",
      label: "Decision maker confirmed",
      letter: "A",
      isComplete: lead.decision_maker_confirmed || false,
      tooltip: "Have you verified you're speaking with someone who can approve the purchase?",
    },
    {
      key: "need",
      label: "Solution fits school needs",
      letter: "N",
      isComplete: lead.solution_fit_confirmed || false,
      tooltip: "Does your offering match their needs and technical requirements? (Need Assessment)",
    },
    {
      key: "timeline",
      label: "Implementation timeline set",
      letter: "T",
      isComplete: !!lead.implementation_timeline,
      tooltip: "Is there a clear timeframe for making a decision and implementing?",
    },
  ];

  const completedCount = criteria.filter((c) => c.isComplete).length;
  const percentage = Math.round((completedCount / criteria.length) * 100);
  const isFullyQualified = percentage === 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">BANT Qualification</CardTitle>
          {onEdit && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Qualification Progress</span>
            <span
              className={cn(
                "font-medium",
                isFullyQualified && "text-green-600"
              )}
            >
              {percentage}%
            </span>
          </div>
          <Progress
            value={percentage}
            className={cn(
              "h-1.5",
              isFullyQualified && "[&>div]:bg-green-500"
            )}
          />
        </div>

        {/* BANT Checklist */}
        <div className="space-y-2">
          {criteria.map((criterion) => (
            <Tooltip key={criterion.key}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex items-start gap-2.5 p-2 rounded-md cursor-help hover:bg-muted/50 transition-colors",
                    criterion.isComplete && "bg-green-50 dark:bg-green-950/30"
                  )}
                >
                  {criterion.isComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center h-5 w-5 rounded-full text-xs font-bold flex-shrink-0",
                          criterion.isComplete
                            ? "bg-green-600 text-white"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {criterion.letter}
                      </span>
                      <span
                        className={cn(
                          "text-sm",
                          criterion.isComplete ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {criterion.label}
                      </span>
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[250px]">
                <p className="text-xs">{criterion.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Status message */}
        {isFullyQualified ? (
          <div className="text-center text-sm text-green-600 font-medium">
            ✓ Lead is fully qualified
          </div>
        ) : (
          <div className="text-center text-xs text-muted-foreground">
            {completedCount} of {criteria.length} criteria met
          </div>
        )}
      </CardContent>
    </Card>
  );
}
