import { useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Shield,
  Gauge,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import {
  computeLeadHygieneScore,
  hygieneBandColor,
} from "~/lib/lead-hygiene";
import { computeLeadCompliance } from "~/lib/lead-compliance";
import type { Lead } from "~/api/leads";
import type { Activity } from "~/api/activities";
import type { LeadQualificationCriteria } from "~/api/lead-qualification";

interface LeadControlPanelProps {
  lead: Lead;
  qualification?: LeadQualificationCriteria | null;
  activities?: Activity[];
  hasOpenEscalation?: boolean;
  duplicateSuspected?: boolean;
  className?: string;
}

/**
 * Lead control panel — fuses the Phase 9 hygiene score with the Phase
 * 10 compliance checklist into one left-pane card so reps see every
 * management signal in a single scan. The two scores measure different
 * things (hygiene = weighted continuous, compliance = pass/fail
 * checklist) but they share the same input — lead + qualification +
 * activities — so rendering them side by side avoids having two cards
 * fighting for the same rail space.
 */
export function LeadControlPanel({
  lead,
  qualification,
  activities,
  hasOpenEscalation,
  duplicateSuspected,
  className,
}: LeadControlPanelProps) {
  const hygiene = useMemo(
    () =>
      computeLeadHygieneScore({
        lead,
        qualification: qualification ?? null,
        activities,
      }),
    [lead, qualification, activities],
  );

  const compliance = useMemo(
    () =>
      computeLeadCompliance({
        lead,
        qualification: qualification ?? null,
        activities,
        hasOpenEscalation,
        duplicateSuspected,
      }),
    [lead, qualification, activities, hasOpenEscalation, duplicateSuspected],
  );

  const bandChip = hygieneBandColor(hygiene.band);

  return (
    <Card className={cn("overflow-hidden border-border/70", className)}>
      <CardContent className="space-y-5 p-4">
        {/* Hygiene header */}
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Gauge className="h-3.5 w-3.5 text-fuchsia-600 dark:text-fuchsia-400" />
            <h3 className="label-overline text-[11px]">Hygiene score</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex items-baseline">
              <span className="text-3xl font-semibold tabular leading-none">
                {hygiene.overall}
              </span>
              <span className="text-xs text-muted-foreground ml-0.5">
                /100
              </span>
            </div>
            <Badge variant="outline" className={cn("capitalize", bandChip)}>
              {hygiene.band}
            </Badge>
          </div>

          {/* Weighted breakdown bars — 4 thin rows that sum to the
              overall. Gives reps a clue which lever to pull. */}
          <div className="mt-3 space-y-1.5">
            <BreakdownRow
              label="Data"
              score={hygiene.breakdown.data_completeness}
              max={25}
              tone="indigo"
            />
            <BreakdownRow
              label="Activity"
              score={hygiene.breakdown.activity_discipline}
              max={30}
              tone="emerald"
            />
            <BreakdownRow
              label="Process"
              score={hygiene.breakdown.process_discipline}
              max={20}
              tone="sky"
            />
            <BreakdownRow
              label="Qualification"
              score={hygiene.breakdown.qualification_quality}
              max={25}
              tone="amber"
            />
          </div>

          {hygiene.penalties.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {hygiene.penalties.slice(0, 3).map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-1.5 text-xs text-muted-foreground"
                >
                  <AlertTriangle className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="h-px bg-border" />

        {/* Compliance checklist */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              <h3 className="label-overline text-[11px]">Compliance</h3>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-[11px]",
                compliance.passedCount === compliance.totalCount
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {compliance.passedCount}/{compliance.totalCount}
            </Badge>
          </div>

          <ul className="space-y-1.5">
            {compliance.items.map((item) => (
              <li
                key={item.key}
                className="flex items-start gap-1.5 text-sm"
              >
                {item.passed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "leading-tight",
                      item.passed
                        ? "text-muted-foreground line-through decoration-muted-foreground/50"
                        : "text-foreground",
                    )}
                  >
                    {item.label}
                  </div>
                  {item.hint && !item.passed && (
                    <div className="text-[11px] text-muted-foreground leading-snug">
                      {item.hint}
                    </div>
                  )}
                </div>
                {!item.passed && item.fixHref && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                )}
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}

interface BreakdownRowProps {
  label: string;
  score: number;
  max: number;
  tone: "indigo" | "emerald" | "sky" | "amber";
}

function BreakdownRow({ label, score, max, tone }: BreakdownRowProps) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  const bar = {
    indigo: "bg-indigo-500",
    emerald: "bg-emerald-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
  }[tone];

  return (
    <div className="grid grid-cols-[64px_1fr_44px] items-center gap-2 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all", bar)}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
      <span className="tabular text-right text-muted-foreground">
        {score}/{max}
      </span>
    </div>
  );
}
