import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { TooltipProvider } from "~/components/ui/tooltip";
import { ArrowRight, Rocket } from "lucide-react";
import { cn } from "~/lib/utils";
import type { Lead } from "~/api/leads";
import { useLeadQualification } from "~/api/lead-qualification";
import { StepCard, type StepItem } from "./step-card";

interface LeadJourneyTrackerProps {
  lead: Lead;
  onEdit?: () => void;
}

// Step tooltips
const STEP_TOOLTIPS = {
  scope:
    "Understand what the school needs by identifying their requirements, unit counts, plan preferences, timeline, and decision makers.",
  qualify:
    "Qualify the lead using BANT framework: Budget, Authority, Need, and Timeline. Ensure all criteria are met before converting to a deal.",
};

export function LeadJourneyTracker({ lead, onEdit }: LeadJourneyTrackerProps) {
  const { data: qualificationData } = useLeadQualification(lead.id);
  const qualification = qualificationData?.data;

  // Scope the Deal checklist - using existing fields
  const scopeItems: StepItem[] = [
    {
      key: "contacted",
      label: "Lead Contacted",
      complete: !!lead.last_contacted_at,
      tooltip:
        "Have you contacted the school's primary contact to establish initial communication?",
    }, 
    {
      key: "primary_contact",
      label: "Primary contact set",
      complete: !!lead.primary_contact,
      tooltip:
        "Have you identified the primary contact for this lead?",
    },
  ];

  // Qualify the Fit (BANT) checklist - from qualification API
  const qualifyItems: StepItem[] = [
    {
      key: "authority",
      label: "Decision Maker Confirmed",
      complete: !!qualification?.decision_maker_name,
      tooltip:
        "Have you verified you're speaking with someone who can approve the purchase? (Authority)",
    },
    {
      key: "timeline_bant",
      label: "Timeline Established",
      complete: qualification?.has_timeline ?? false,
      tooltip:
        "Is there a clear timeframe for making a decision and implementing? (Timeline)",
    },
    {
      key: "budget",
      label: "Budget Fit Assessed",
      complete: qualification?.has_budget ?? false,
      tooltip:
        "Does the school have budget allocated, or is there a clear path to securing funds? (Budget)",
    },
    {
      key: "need",
      label: "Solution Fit Confirmed",
      complete: qualification?.has_needs ?? false,
      tooltip:
        "Does your offering match their needs and technical requirements? (Need)",
    },
  ];

  const scopeProgress = Math.round(
    (scopeItems.filter((i) => i.complete).length / scopeItems.length) * 100,
  );
  const qualifyProgress = Math.round(
    (qualifyItems.filter((i) => i.complete).length / qualifyItems.length) *
      100,
  );

  const isReadyToConvert = scopeProgress === 100 && qualifyProgress === 100;

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Lead Journey</CardTitle>
            {isReadyToConvert && (
              <Badge className="bg-green-600 hover:bg-green-700">
                Ready to convert
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="md:grid md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4">
            {/* Step 1: Scope the Deal */}
            <StepCard
              step={1}
              title="Scope the Deal"
              subtitle="What they need"
              items={scopeItems}
              percentage={scopeProgress}
              isActive={scopeProgress < 100}
              isComplete={scopeProgress === 100}
              colorClass="bg-blue-500 text-white"
              stepTooltip={STEP_TOOLTIPS.scope}
              onEdit={() => onEdit?.()}
            />

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center">
              <ArrowRight
                className={cn(
                  "h-6 w-6",
                  scopeProgress === 100
                    ? "text-green-500"
                    : "text-muted-foreground/30",
                )}
              />
            </div>

            {/* Step 2: Qualify the Fit */}
            <StepCard
              step={2}
              title="Qualify the Fit"
              subtitle="Are they ready?"
              items={qualifyItems}
              percentage={qualifyProgress}
              isActive={scopeProgress === 100 && qualifyProgress < 100}
              isComplete={qualifyProgress === 100}
              colorClass="bg-purple-500 text-white"
              stepTooltip={STEP_TOOLTIPS.qualify}
              onEdit={() => onEdit?.()}
            />

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center">
              <ArrowRight
                className={cn(
                  "h-6 w-6",
                  qualifyProgress === 100
                    ? "text-green-500"
                    : "text-muted-foreground/30",
                )}
              />
            </div>

            {/* Step 3: Ready to Convert */}
            <Card
              className={cn(
                "border-2 transition-colors",
                isReadyToConvert
                  ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                  : "border-muted",
              )}
            >
              <CardContent className="flex flex-col items-center justify-center h-full py-8">
                <Rocket
                  className={cn(
                    "h-12 w-12 mb-3",
                    isReadyToConvert
                      ? "text-green-600"
                      : "text-muted-foreground",
                  )}
                />
                <h3
                  className={cn(
                    "font-semibold text-lg mb-1",
                    isReadyToConvert
                      ? "text-green-600"
                      : "text-muted-foreground",
                  )}
                >
                  {isReadyToConvert ? "Ready!" : "Not Ready"}
                </h3>
                <p className="text-sm text-center text-muted-foreground">
                  {isReadyToConvert
                    ? "All set to convert to Deal"
                    : "Complete steps to proceed"}
                </p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
