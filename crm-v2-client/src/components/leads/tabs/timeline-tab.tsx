import { useMemo } from "react";
import { format } from "date-fns";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { Alert, AlertDescription } from "~/components/ui/alert";
import type { Lead } from "~/api/leads";
import {
  useLeadQualification,
  type LeadQualificationCriteria,
  type TimelineType,
  type BudgetIndicator,
} from "~/api/lead-qualification";

const TIMELINE_LABELS: Record<TimelineType, string> = {
  "this-term": "This Term",
  "next-term": "Next Term",
  "within-6-months": "Within 6 Months",
  "within-1-year": "Within 1 Year",
  "specific-date": "Specific Date",
};

const BUDGET_LABELS: Record<BudgetIndicator, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  "not-disclosed": "Not Disclosed",
};

interface TimelineTabProps {
  lead: Lead;
  isTerminal?: boolean;
  onEditQualification?: () => void;
}

const buildQualificationProgress = (qualification?: LeadQualificationCriteria) => {
  const fields = [
    {
      key: "authority",
      label: "Decision Maker Identified",
      isRequired: true,
      isComplete: !!qualification?.decision_maker_name,
    },
    {
      key: "needs",
      label: "Needs Identified",
      isRequired: true,
      isComplete: !!qualification?.has_needs,
    },
    {
      key: "plan_type",
      label: "Payment Plan Selected",
      isRequired: true,
      isComplete: !!qualification?.has_plan_type,
    },
    {
      key: "timeline",
      label: "Timeline Confirmed",
      isRequired: true,
      isComplete: !!qualification?.has_timeline,
    },
    {
      key: "budget",
      label: "Budget Confirmed",
      isRequired: true,
      isComplete: !!qualification?.has_budget,
    },
  ];

  const required = fields.filter((field) => field.isRequired);
  const completed = required.filter((field) => field.isComplete).length;
  const total = required.length;
  const computedComplete = total > 0 && completed === total;
  const isComplete = qualification?.is_qualified ?? computedComplete;
  const completedCount = isComplete ? total : completed;

  return {
    fields,
    completed: completedCount,
    total,
    percentage: total ? Math.round((completedCount / total) * 100) : 0,
    isComplete,
  };
};

const formatTimeline = (qualification?: LeadQualificationCriteria) => {
  if (!qualification?.timeline_type) return "--";
  if (
    qualification.timeline_type === "specific-date" &&
    qualification.specific_date
  ) {
    return format(new Date(qualification.specific_date), "MMM dd, yyyy");
  }
  return TIMELINE_LABELS[qualification.timeline_type] ?? "--";
};

const formatBudget = (qualification?: LeadQualificationCriteria) => {
  if (!qualification?.budget_indicator) return "--";
  const label = BUDGET_LABELS[qualification.budget_indicator] ?? "--";
  if (
    qualification.budget_indicator !== "not-disclosed" &&
    qualification.budget_amount
  ) {
    return `${label} (${qualification.budget_amount})`;
  }
  return label;
};

export function TimelineTab({
  lead,
  isTerminal,
  onEditQualification,
}: TimelineTabProps) {
  const { data: qualificationData, isLoading } = useLeadQualification(lead.id);
  const qualification = qualificationData?.data;
  const qualificationProgress = useMemo(
    () => buildQualificationProgress(qualification),
    [qualification],
  );

  const needsDisplay =
    qualification?.qualification_needs?.length
      ? qualification.qualification_needs.map((need) => need.name).join(", ")
      : qualification?.needs || "--";

  const decisionMakerDisplay = qualification?.decision_maker_name
    ? `${qualification.decision_maker_name}${
        qualification.decision_maker_title
          ? ` (${qualification.decision_maker_title})`
          : ""
      }`
    : "--";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Qualification Progress</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Complete required fields to unlock the Qualified stage
              </p>
            </div>
            <Badge
              variant={qualificationProgress.isComplete ? "default" : "secondary"}
              className={
                qualificationProgress.isComplete ? "bg-green-600 hover:bg-green-700" : ""
              }
            >
              {qualificationProgress.completed}/{qualificationProgress.total} Required
            </Badge>
          </div>
          <Progress value={qualificationProgress.percentage} className="mt-4" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading qualification...</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {qualificationProgress.fields
                  .filter((field) => field.isRequired)
                  .map((field) => (
                    <div
                      key={field.key}
                      className={`flex items-center gap-2 p-2 rounded-lg border ${
                        field.isComplete
                          ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
                          : "bg-muted/50 border-border"
                      }`}
                    >
                      <CheckCircle2
                        className={`h-4 w-4 ${
                          field.isComplete
                            ? "text-green-600"
                            : "text-muted-foreground"
                        }`}
                      />
                      <span
                        className={
                          field.isComplete
                            ? "text-green-800 dark:text-green-200"
                            : "text-muted-foreground"
                        }
                      >
                        {field.label}
                      </span>
                    </div>
                  ))}
              </div>
              {qualificationProgress.isComplete && (
                <Alert className="mt-4 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    All required fields completed! The lead can now be moved to
                    Qualified.
                  </AlertDescription>
                </Alert>
              )}
              {!qualificationProgress.isComplete && qualification && (
                <Alert className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Complete the remaining required fields to qualify this lead.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Qualification Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Qualification Details</CardTitle>
          {!isTerminal && onEditQualification && (
            <Button variant="outline" size="sm" onClick={onEditQualification}>
              Edit Qualification
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Needs
              </dt>
              <dd className="text-foreground font-medium">{needsDisplay}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Payment Plan
              </dt>
              <dd className="text-foreground font-medium">
                {qualification?.plan_type || "--"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Timeline
              </dt>
              <dd className="text-foreground font-medium">
                {formatTimeline(qualification)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Budget
              </dt>
              <dd className="text-foreground font-medium">
                {formatBudget(qualification)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Decision Maker
              </dt>
              <dd className="text-foreground font-medium">
                {decisionMakerDisplay}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Verified Contact
              </dt>
              <dd className="flex items-center gap-1">
                {qualification?.has_verified_contact ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" /> Yes
                  </>
                ) : (
                  <span className="text-muted-foreground">No</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Influential Contact
              </dt>
              <dd className="flex items-center gap-1">
                {qualification?.has_influential_contact ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" /> Yes
                  </>
                ) : (
                  <span className="text-muted-foreground">No</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Qualification Score
              </dt>
              <dd className="text-foreground font-medium">
                {qualification?.qualification_score ?? "--"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Qualified
              </dt>
              <dd>
                <Badge
                  variant={qualification?.is_qualified ? "default" : "secondary"}
                  className={
                    qualification?.is_qualified
                      ? "bg-green-600 hover:bg-green-700"
                      : ""
                  }
                >
                  {qualification?.is_qualified ? "Qualified" : "Not Qualified"}
                </Badge>
              </dd>
            </div>
            {qualification?.checklist && (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-sm font-medium text-muted-foreground mb-2">
                  Verification Checklist
                </dt>
                <dd className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Phone {qualification.checklist.phone_verified ? "Yes" : "No"}
                  </Badge>
                  <Badge variant="outline">
                    Email {qualification.checklist.email_verified ? "Yes" : "No"}
                  </Badge>
                  <Badge variant="outline">
                    Province{" "}
                    {qualification.checklist.province_verified ? "Yes" : "No"}
                  </Badge>
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
