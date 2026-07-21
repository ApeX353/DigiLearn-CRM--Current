import { useMemo } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  Gauge,
  ListChecks,
  PhoneCall,
  ShieldAlert,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";
import {
  useActivityDiscipline,
  type DashboardFilters,
  type DateRangeType,
  type DisciplineKpi,
  type ProgressionKpi,
  type AtRiskItem,
  type RepDisciplineRow,
} from "~/api/dashboard";

/**
 * Activity Discipline section — manager-grade control panel.
 *
 * Five labelled blocks, in order of managerial priority:
 *
 *   A. Prospecting     — first-TIME lead-contact discipline. Strictly
 *                        "did this rep pick up a NEW lead today?".
 *                        Separate from Volume so "Leads Contacted vs
 *                        Target" can never be confused with total
 *                        outreach noise.
 *   B. Volume          — all outreach (first + follow-up). Secondary
 *                        on purpose: high volume without compliance
 *                        is noise.
 *   C. Quality         — compliance %s and counts-of-shame. The
 *                        "are reps doing the job?" block.
 *   D. Progression     — whether all that activity moved the pipeline.
 *   E. Intervention    — at-risk records + reps needing intervention.
 *
 * Rep Discipline table lives under the intervention block as a
 * full-width leaderboard, sorted so the biggest offender is at the
 * top.
 *
 * Presentation rules:
 *
 *   - Every card carries a manager-friendly label, a plain-English
 *     subtitle, and a period pill (today / period / now) so the
 *     manager never has to decode what window a number belongs to.
 *   - Targets render as a small chip on the card when one exists
 *     ("target 95%", "target 0"). The card's border and value tint
 *     reflect whether the metric is hitting target.
 *   - Notes never feed compliance/volume counts — the backend enforces
 *     `ACTIONABLE` type filtering.
 *   - Point-in-time metrics (overdue, no-next-step, stale) show "now"
 *     — they don't respect the date range because "12 stale deals"
 *     means "12 right now", not "12 this month".
 *   - The Prospecting card is locked to TODAY regardless of the
 *     dashboard filter, because daily first-contact target only
 *     makes sense day-by-day.
 */

interface Props {
  filters: DashboardFilters;
}

/**
 * Period-of-relevance shown on each card:
 *   window — respects the dashboard timeframe picker
 *   today  — fixed to today regardless of picker (daily discipline)
 *   now    — point-in-time snapshot (doesn't respect picker)
 */
type Period = "window" | "today" | "now";
type Block =
  | "prospecting"
  | "volume"
  | "quality"
  | "progression"
  | "intervention";

interface DisplaySpec {
  label: string;
  subtitle: string;
  period: Period;
  block: Block;
  icon?: LucideIcon;
}

const DISPLAY: Record<string, DisplaySpec> = {
  // A. Prospecting Discipline ------------------------------------
  // Strict first-TIME-lead-contact metrics. Do NOT let these be
  // confused with Volume (which counts every touch).
  first_time_contacts_today: {
    label: "Leads Contacted vs Target",
    subtitle: "First-time lead contacts made today vs required daily target",
    period: "today",
    block: "prospecting",
    icon: Target,
  },
  new_leads_sla_touch_pct: {
    label: "New Leads Touched Within SLA",
    subtitle:
      "% of new leads created in period whose first contact beat the SLA clock",
    period: "window",
    block: "prospecting",
    icon: Timer,
  },

  // B. Volume -----------------------------------------------------
  // "Total Outreach Actions" is the big-picture number — everything
  // sales did across leads/deals/schools/contacts. Differentiated
  // from "Completed Actionables" which is the subset that actually
  // transitioned to 'completed' in the window.
  total_outreach: {
    label: "Total Outreach Actions",
    subtitle:
      "All sales touches logged across leads, deals, schools & contacts. Notes excluded.",
    period: "window",
    block: "volume",
    icon: PhoneCall,
  },
  completed_actionables: {
    label: "Completed Actionable Activities",
    subtitle:
      "Completed calls, meetings, tasks, emails, WhatsApps. Notes excluded.",
    period: "window",
    block: "volume",
    icon: CheckCircle2,
  },
  follow_ups_scheduled: {
    label: "Follow-Ups Scheduled",
    subtitle: "Actionables planned with a future due date",
    period: "window",
    block: "volume",
  },
  meetings_held: {
    label: "Meetings Held",
    subtitle: "Completed meeting activities",
    period: "window",
    block: "volume",
  },
  demos_held: {
    label: "Demos Held",
    subtitle: "Completed demo activities",
    period: "window",
    block: "volume",
  },

  // C. Activity Quality / Compliance -----------------------------
  outcome_pct: {
    label: "Outcome Compliance",
    subtitle: "% of completed actionable activities with an outcome recorded",
    period: "window",
    block: "quality",
    icon: CheckCircle2,
  },
  next_step_pct: {
    label: "Next-Step Compliance",
    subtitle: "% of completions followed by a scheduled next step",
    period: "window",
    block: "quality",
    icon: ListChecks,
  },
  overdue: {
    label: "Overdue Follow-Ups",
    subtitle: "Open promised follow-ups past their due date",
    period: "now",
    block: "quality",
    icon: Clock,
  },
  leads_no_next_step: {
    label: "Active Leads With No Next Step",
    subtitle: "Active leads with no upcoming actionable activity",
    period: "now",
    block: "quality",
    icon: AlertTriangle,
  },
  deals_no_next_step: {
    label: "Active Deals With No Next Step",
    subtitle: "Ongoing deals with no planned follow-up",
    period: "now",
    block: "quality",
    icon: AlertTriangle,
  },
  outcome_missing: {
    label: "Completions Missing Outcome",
    subtitle: "Activities closed without proper outcome capture",
    period: "window",
    block: "quality",
    icon: ShieldAlert,
  },

  // D. Progression ------------------------------------------------
  leads_qualified: {
    label: "Leads Qualified",
    subtitle: "Leads advanced to Qualified status in period",
    period: "window",
    block: "progression",
  },
  demos_booked: {
    label: "Demos Booked",
    subtitle: "Demo activities created in period",
    period: "window",
    block: "progression",
  },
  quotes_sent: {
    label: "Quotes / Proposals Sent",
    subtitle: "Completed proposal activities or quote-subject activities",
    period: "window",
    block: "progression",
  },
  deals_advanced: {
    label: "Deals Progressed",
    subtitle: "Deal stage advances recorded in period",
    period: "window",
    block: "progression",
  },
  deals_won: {
    label: "Deals Won",
    subtitle: "Deals closed-won in period",
    period: "window",
    block: "progression",
  },

  // E. Intervention ----------------------------------------------
  stale_leads: {
    label: "Stale Leads",
    subtitle: "No meaningful touch in 14+ days",
    period: "now",
    block: "intervention",
  },
  stale_deals: {
    label: "Stale Deals",
    subtitle: "No actionable activity in 21+ days",
    period: "now",
    block: "intervention",
  },
  sla_breached: {
    label: "Leads SLA Breached",
    subtitle: "Passed the first-response SLA clock",
    period: "now",
    block: "intervention",
  },
};

export function ActivityDisciplineSection({ filters }: Props) {
  const { data: response, isLoading, error } = useActivityDiscipline(filters);
  const data = response?.data;

  // Hook must run unconditionally — compute with safe fallbacks so
  // the early-return branches below don't change hook order.
  const rangeLabel = useMemo(
    () =>
      data
        ? formatRangeLabel(data.window.range, data.window.start, data.window.end)
        : "",
    [data?.window.range, data?.window.start, data?.window.end],
  );

  if (isLoading && !data) {
    return <SectionSkeleton />;
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Activity discipline metrics are unavailable right now.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section header — timeframe pill so every card below is
          interpreted in the same window. Daily-discipline metrics
          are marked "today", point-in-time metrics "now", the rest
          respect the filter. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Manager Control Panel</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Timeframe</span>
          <Badge variant="outline" className="font-medium">
            {rangeLabel}
          </Badge>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground italic">
            cards marked "today" or "now" don't follow the filter
          </span>
        </div>
      </div>

      {/* A. Prospecting Discipline — strict first-TIME contact
          focus. Rendered as two prominent cards side-by-side so the
          daily target card never has to share space with generic
          volume noise. */}
      <Block
        id="A"
        title="Prospecting Discipline"
        caption="First-time lead contacts and SLA compliance — are reps actually picking up NEW leads, not just re-touching familiar ones?"
        icon={Target}
        tone="violet"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {data.kpis.prospecting.map((k) => (
            <DisciplineCard key={k.key} kpi={k} prominent />
          ))}
        </div>
      </Block>

      {/* B. Activity Volume — all outreach (first + follow-up).
          Compact stat bar so it never visually out-weights the
          discipline/quality blocks above and below. */}
      <Block
        id="B"
        title="Activity Volume"
        caption="Total outreach activity. High volume without compliance is noise — read this block next to Quality, not alone."
        icon={PhoneCall}
        tone="sky"
      >
        <StatBar items={data.kpis.volume} />
      </Block>

      {/* C. Activity Quality / Compliance — the "are reps doing the
          job?" block: outcome + next-step compliance and counts of
          shame. */}
      <Block
        id="C"
        title="Activity Quality / Compliance"
        caption="Are reps following through — recording outcomes, scheduling next steps, staying ahead of overdue work?"
        icon={ShieldAlert}
        tone="rose"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {data.kpis.quality.map((k) => (
            <DisciplineCard key={k.key} kpi={k} />
          ))}
        </div>
      </Block>

      {/* D. Progression — did activity move the pipeline forward? */}
      <Block
        id="D"
        title="Progression"
        caption="The forward motion that activity produced — leads qualified, demos booked, deals advanced & won."
        icon={TrendingUp}
        tone="emerald"
      >
        <StatBar items={data.progression} />
      </Block>

      {/* E. Intervention — at-risk record counts and the reps whose
          numbers say management should talk to them first. */}
      <Block
        id="E"
        title="Intervention"
        caption="Where management should look first — stale records, breached SLAs, and reps who need a conversation."
        icon={Flame}
        tone="amber"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <AtRiskCard items={data.at_risk} />
          <InterventionRepsCard reps={data.reps} />
          <HealthySignalCard reps={data.reps} kpis={data.kpis.quality} />
        </div>
      </Block>

      {/* Rep leaderboard — full width under D so there's room to
          scan the columns. */}
      <RepDisciplineTable reps={data.reps} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Block scaffolding                                                           */
/* -------------------------------------------------------------------------- */

function Block({
  id,
  title,
  caption,
  icon: Icon,
  tone,
  children,
}: {
  id: string;
  title: string;
  caption: string;
  icon: LucideIcon;
  tone: "rose" | "sky" | "emerald" | "amber" | "violet";
  children: React.ReactNode;
}) {
  const toneClasses = {
    rose: "text-rose-500",
    sky: "text-sky-500",
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    violet: "text-violet-500",
  }[tone];

  return (
    <section className="space-y-2.5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon className={cn("h-4 w-4 mt-0.5", toneClasses)} />
          <div>
            <h4 className="font-semibold text-sm leading-tight">
              <span className="text-muted-foreground mr-1.5">{id}.</span>
              {title}
            </h4>
            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 max-w-xl">
              {caption}
            </p>
          </div>
        </div>
      </header>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* A. Discipline card                                                          */
/* -------------------------------------------------------------------------- */

function DisciplineCard({
  kpi,
  prominent = false,
}: {
  kpi: DisciplineKpi;
  /**
   * `prominent` mode is used by the Prospecting block: bigger value
   * type, a "value / target" fraction for non-% metrics, and a
   * bolder border so the two prospecting cards feel more like
   * the commitment gauges they are.
   */
  prominent?: boolean;
}) {
  const display = DISPLAY[kpi.key];
  const label = display?.label ?? kpi.label;
  const subtitle = display?.subtitle ?? kpi.hint ?? "";
  const period = display?.period ?? "window";
  const Icon = display?.icon ?? Gauge;

  const isPct = typeof kpi.pct === "number";
  const tone = scoreTone(kpi);

  // "value / target" presentation for non-% metrics that DO carry a
  // target (the Prospecting "Leads Contacted vs Target" card is the
  // canonical case). Renders like "18 / 40" so the manager sees the
  // gap without doing arithmetic.
  const showsFraction =
    !isPct && typeof kpi.target === "number" && prominent;
  const gapToTarget =
    showsFraction && typeof kpi.target === "number"
      ? kpi.target - kpi.value
      : null;

  return (
    <Card
      className={cn(
        "border",
        tone.border,
        prominent && "shadow-sm",
      )}
    >
      <CardContent
        className={cn(prominent ? "p-4 space-y-2" : "p-3.5 space-y-1.5")}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5 min-w-0">
            <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", tone.icon)} />
            <p
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-tight break-words"
              title={label}
            >
              {label}
            </p>
          </div>
          <PeriodPill period={period} />
        </div>

        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className={cn(
              "tabular leading-none font-semibold",
              prominent ? "text-3xl" : "text-2xl",
              tone.value,
            )}
          >
            {isPct ? `${kpi.value}%` : kpi.value.toLocaleString()}
          </span>

          {/* Prospecting prominent mode: "value / target" fraction
              right next to the headline. Other modes fall back to
              the TargetChip. */}
          {showsFraction && (
            <span
              className={cn(
                "text-lg font-medium tabular leading-none text-muted-foreground",
              )}
            >
              / {kpi.target!.toLocaleString()}
            </span>
          )}

          {!showsFraction && (
            <TargetChip kpi={kpi} isPct={isPct} tone={tone.chip} />
          )}

          {/* Gap-to-target badge — only when we're behind and
              showing a fraction. Keeps the "how far short?" read
              instant without a mental subtraction. */}
          {showsFraction && typeof gapToTarget === "number" && gapToTarget > 0 && (
            <Badge
              variant="outline"
              className="tabular text-[10px] border-amber-200/70 text-amber-700 dark:text-amber-300 dark:border-amber-900/60"
            >
              {gapToTarget.toLocaleString()} to go
            </Badge>
          )}
          {showsFraction && typeof gapToTarget === "number" && gapToTarget <= 0 && (
            <Badge
              variant="outline"
              className="tabular text-[10px] border-emerald-200/70 text-emerald-700 dark:text-emerald-400 dark:border-emerald-900/60"
            >
              on target
            </Badge>
          )}
        </div>

        {subtitle && (
          <p className="text-[11px] text-muted-foreground leading-snug">
            {subtitle}
          </p>
        )}

        {isPct && typeof kpi.denom === "number" && kpi.denom > 0 && (
          <p className="text-[10px] text-muted-foreground tabular">
            {Math.round((kpi.value / 100) * kpi.denom).toLocaleString()}
            {" / "}
            {kpi.denom.toLocaleString()}
            {kpi.key === "new_leads_sla_touch_pct"
              ? " new leads touched in time"
              : " completions"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TargetChip({
  kpi,
  isPct,
  tone,
}: {
  kpi: DisciplineKpi;
  isPct: boolean;
  tone: string;
}) {
  if (typeof kpi.target === "undefined") return null;
  const label = isPct ? `target ${kpi.target}%` : `target ${kpi.target}`;
  return (
    <span className={cn("text-[10px] font-medium tabular", tone)}>
      {label}
    </span>
  );
}

function PeriodPill({ period }: { period: Period }) {
  // Three variants:
  //   today  — bold violet: daily-discipline metric, doesn't respect
  //            the filter (always reads today)
  //   period — primary tint: respects the dashboard timeframe filter
  //   now    — muted: point-in-time snapshot
  const cls =
    period === "today"
      ? "bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-300"
      : period === "window"
        ? "bg-primary/5 border-primary/20 text-primary"
        : "bg-muted text-muted-foreground border-border";
  const label =
    period === "today" ? "today" : period === "window" ? "period" : "now";
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded border leading-none",
        cls,
      )}
    >
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Compact stat bar — used for B & C                                          */
/* -------------------------------------------------------------------------- */

function StatBar({ items }: { items: Array<DisciplineKpi | ProgressionKpi> }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-border -my-2 -mx-3">
          {items.map((it) => {
            const d = DISPLAY[it.key];
            const label = d?.label ?? it.label;
            const subtitle = d?.subtitle ?? "";
            const period = d?.period ?? "window";
            const target =
              "target" in it && typeof it.target === "number"
                ? it.target
                : undefined;
            return (
              <div key={it.key} className="px-3 py-2 min-w-0">
                {/* Heading row: label is allowed to wrap so long
                    labels like "Completed Actionable Activities"
                    and "Quotes / Proposals Sent" stay fully
                    visible at narrow column widths. The period
                    pill stays top-right via items-start. */}
                <div className="flex items-start justify-between gap-2">
                  <p
                    className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-tight break-words"
                    title={label}
                  >
                    {label}
                  </p>
                  <PeriodPill period={period} />
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-xl font-semibold tabular leading-tight">
                    {it.value.toLocaleString()}
                  </p>
                  {typeof target === "number" && (
                    <span className="text-[10px] text-muted-foreground tabular">
                      target {target.toLocaleString()}
                    </span>
                  )}
                </div>
                {subtitle && (
                  <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* D. Intervention — three cards                                               */
/* -------------------------------------------------------------------------- */

function AtRiskCard({ items }: { items: AtRiskItem[] }) {
  return (
    <Card className="border-amber-200/70 dark:border-amber-900/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Flame className="h-4 w-4 text-amber-500" />
          At-risk records
        </CardTitle>
        <CardDescription className="text-xs">
          Records that have slipped through the cracks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-2">
          {items.map((it) => {
            const d = DISPLAY[it.key];
            const label = d?.label ?? it.label;
            const subtitle = d?.subtitle ?? it.hint ?? "";
            const bad = it.value > 0;
            return (
              <li
                key={it.key}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{label}</span>
                    <PeriodPill period={d?.period ?? "now"} />
                  </div>
                  {subtitle && (
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {subtitle}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "tabular text-base font-semibold shrink-0",
                    bad ? "text-red-600 dark:text-red-400" : "text-emerald-500",
                  )}
                >
                  {it.value.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function InterventionRepsCard({ reps }: { reps: RepDisciplineRow[] }) {
  const interventions = useMemo(() => synthesizeInterventions(reps), [reps]);

  return (
    <Card className="border-rose-200/60 dark:border-rose-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-rose-500" />
          Reps needing intervention
        </CardTitle>
        <CardDescription className="text-xs">
          Based on overdue work, outcome &amp; next-step compliance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {interventions.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No reps currently meet the intervention threshold.
          </p>
        ) : (
          <ul className="space-y-2">
            {interventions.map((row) => (
              <li
                key={`${row.kind}-${row.rep.user_id}`}
                className="flex items-start gap-2 text-xs"
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-rose-500 shrink-0" />
                <div className="min-w-0">
                  <span className="font-medium">{row.rep.name}</span>
                  <span className="text-muted-foreground"> — {row.reason}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HealthySignalCard({
  reps,
  kpis,
}: {
  reps: RepDisciplineRow[];
  kpis: DisciplineKpi[];
}) {
  // Positive signal card — stars performer on compliance so the
  // intervention story isn't all red. Keeps mgrs from banging the
  // drum when a rep is actually performing.
  const topRep = useMemo(() => pickTopRep(reps), [reps]);
  const outcome = kpis.find((k) => k.key === "outcome_pct");
  const nextStep = kpis.find((k) => k.key === "next_step_pct");
  const overdue = kpis.find((k) => k.key === "overdue");

  return (
    <Card className="border-emerald-200/60 dark:border-emerald-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Team snapshot
        </CardTitle>
        <CardDescription className="text-xs">
          Plain-English state of the team right now.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {outcome && (
          <SnapshotLine
            label="Outcome compliance"
            ok={typeof outcome.target === "number" && outcome.value >= outcome.target}
            text={`${outcome.value}%${outcome.target ? ` · target ${outcome.target}%` : ""}`}
          />
        )}
        {nextStep && (
          <SnapshotLine
            label="Next-step compliance"
            ok={
              typeof nextStep.target === "number" &&
              nextStep.value >= nextStep.target
            }
            text={`${nextStep.value}%${nextStep.target ? ` · target ${nextStep.target}%` : ""}`}
          />
        )}
        {overdue && (
          <SnapshotLine
            label="Overdue follow-ups"
            ok={overdue.value === 0}
            text={
              overdue.value === 0
                ? "None open"
                : `${overdue.value} open — action today`
            }
          />
        )}
        {topRep && (
          <div className="pt-1 border-t border-border mt-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Leading on discipline
            </p>
            <p className="text-foreground mt-0.5">
              <span className="font-medium">{topRep.name}</span>
              <span className="text-muted-foreground">
                {" "}— {topRep.outcome_pct}% outcome · {topRep.next_step_pct}%
                next-step · {topRep.overdue} overdue
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SnapshotLine({
  label,
  ok,
  text,
}: {
  label: string;
  ok: boolean;
  text: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular font-medium",
          ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
        )}
      >
        {text}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rep discipline table                                                        */
/* -------------------------------------------------------------------------- */

function RepDisciplineTable({ reps }: { reps: RepDisciplineRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ListChecks className="h-4 w-4 text-violet-500" />
          Rep Discipline
        </CardTitle>
        <CardDescription className="text-xs">
          Sorted by intervention priority — overdue work, then lowest outcome compliance.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {reps.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No reps in scope for the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[11px] uppercase tracking-wide">
                  <TableHead>Rep</TableHead>
                  <TableHead
                    className="text-center"
                    title="Calls, emails, meetings, WhatsApp completed"
                  >
                    Contacts Made
                  </TableHead>
                  <TableHead
                    className="text-center"
                    title="Actionable activities closed. Notes excluded."
                  >
                    Completed Actionables
                  </TableHead>
                  <TableHead
                    className="text-center"
                    title="% of completions with an outcome recorded · target 95%"
                  >
                    Outcome %
                  </TableHead>
                  <TableHead
                    className="text-center"
                    title="% of completions followed by a scheduled next step · target 80%"
                  >
                    Next-Step %
                  </TableHead>
                  <TableHead
                    className="text-center"
                    title="Open follow-ups past their due date · target 0"
                  >
                    Overdue
                  </TableHead>
                  <TableHead
                    className="text-center"
                    title="Active leads + deals with no upcoming actionable activity · target 0"
                  >
                    No Next Step
                  </TableHead>
                  <TableHead
                    className="text-center"
                    title="Deal stage advances in period"
                  >
                    Deals Progressed
                  </TableHead>
                  <TableHead
                    className="text-center"
                    title="Active leads not touched in 14+ days"
                  >
                    Stale
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reps.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{r.name}</span>
                        {r.email && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                            {r.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular">
                      {r.contacts}
                    </TableCell>
                    <TableCell className="text-center tabular">
                      {r.completed}
                    </TableCell>
                    <TableCell className="text-center">
                      <CompliancePill
                        value={r.outcome_pct}
                        denom={r.completed}
                        target={95}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <CompliancePill
                        value={r.next_step_pct}
                        denom={r.completed}
                        target={80}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <CountPill value={r.overdue} />
                    </TableCell>
                    <TableCell className="text-center">
                      <CountPill value={r.no_next_step_records} />
                    </TableCell>
                    <TableCell className="text-center">
                      <ProgressPill value={r.deals_advanced} />
                    </TableCell>
                    <TableCell className="text-center">
                      <CountPill value={r.stale_records} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompliancePill({
  value,
  denom,
  target,
}: {
  value: number;
  denom: number;
  target: number;
}) {
  if (denom === 0) {
    return <span className="text-[11px] text-muted-foreground italic">—</span>;
  }
  const ok = value >= target;
  const warn = value >= target - 15 && value < target;
  return (
    <Badge
      variant="outline"
      className={cn(
        "tabular font-semibold",
        ok &&
          "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900",
        warn &&
          !ok &&
          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
        !ok &&
          !warn &&
          "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900",
      )}
    >
      {value}%
    </Badge>
  );
}

function CountPill({ value }: { value: number }) {
  if (value === 0) {
    return (
      <Badge
        variant="outline"
        className="tabular bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900"
      >
        0
      </Badge>
    );
  }
  const severe = value >= 5;
  return (
    <Badge
      variant="outline"
      className={cn(
        "tabular font-semibold",
        severe
          ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900"
          : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
      )}
    >
      {value}
    </Badge>
  );
}

function ProgressPill({ value }: { value: number }) {
  // Higher is better — a different pill so the colour never clashes
  // with the "bad when >0" semantics of CountPill.
  if (value === 0) {
    return (
      <Badge variant="outline" className="tabular bg-muted text-muted-foreground">
        0
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="tabular font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900"
    >
      {value}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Synthesis helpers                                                           */
/* -------------------------------------------------------------------------- */

function synthesizeInterventions(reps: RepDisciplineRow[]) {
  type Row = {
    kind: "overdue" | "no_next" | "outcome" | "next_step";
    rep: RepDisciplineRow;
    reason: string;
  };
  const byOverdue: Row[] = [...reps]
    .filter((r) => r.overdue >= 5)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 2)
    .map((r) => ({
      kind: "overdue",
      rep: r,
      reason: `${r.overdue} overdue follow-ups`,
    }));
  const byNoNext: Row[] = [...reps]
    .filter((r) => r.no_next_step_records >= 5)
    .sort((a, b) => b.no_next_step_records - a.no_next_step_records)
    .slice(0, 2)
    .map((r) => ({
      kind: "no_next",
      rep: r,
      reason: `${r.no_next_step_records} records with no next step`,
    }));
  const byOutcome: Row[] = [...reps]
    .filter((r) => r.completed >= 5 && r.outcome_pct < 70)
    .sort((a, b) => a.outcome_pct - b.outcome_pct)
    .slice(0, 2)
    .map((r) => ({
      kind: "outcome",
      rep: r,
      reason: `${r.outcome_pct}% outcome compliance`,
    }));
  const byNextStep: Row[] = [...reps]
    .filter((r) => r.completed >= 5 && r.next_step_pct < 60)
    .sort((a, b) => a.next_step_pct - b.next_step_pct)
    .slice(0, 2)
    .map((r) => ({
      kind: "next_step",
      rep: r,
      reason: `${r.next_step_pct}% next-step compliance`,
    }));

  const seen = new Set<string>();
  return [...byOverdue, ...byOutcome, ...byNextStep, ...byNoNext]
    .filter((row) => {
      if (seen.has(row.rep.user_id)) return false;
      seen.add(row.rep.user_id);
      return true;
    })
    .slice(0, 4);
}

function pickTopRep(reps: RepDisciplineRow[]): RepDisciplineRow | null {
  // A "top rep" needs a meaningful sample (5+ completions) and the
  // best combined compliance picture. Zero overdue is mandatory.
  const qualifying = reps.filter(
    (r) => r.completed >= 5 && r.overdue === 0,
  );
  if (qualifying.length === 0) return null;
  return qualifying.sort(
    (a, b) =>
      (b.outcome_pct + b.next_step_pct) - (a.outcome_pct + a.next_step_pct),
  )[0];
}

/* -------------------------------------------------------------------------- */
/* Misc helpers                                                                */
/* -------------------------------------------------------------------------- */

function scoreTone(kpi: DisciplineKpi): {
  border: string;
  icon: string;
  value: string;
  chip: string;
} {
  if (typeof kpi.target === "undefined") {
    return {
      border: "border-border/70",
      icon: "text-muted-foreground",
      value: "text-foreground",
      chip: "text-muted-foreground",
    };
  }

  const ok =
    kpi.tone === "higher-better"
      ? kpi.value >= kpi.target
      : kpi.value <= kpi.target;
  // Warn-window is proportional: 15-point absolute gap works for %
  // metrics (0–100 scale) but not for counts like "40 contacts/day"
  // where 15 short of 40 would mean amber at 25 — too loose. For
  // bigger targets we use 25% of the target instead.
  const warnGap =
    kpi.target > 60 ? Math.max(5, Math.round(kpi.target * 0.25)) : 15;
  const warn =
    kpi.tone === "higher-better"
      ? kpi.value >= kpi.target - warnGap && kpi.value < kpi.target
      : kpi.value <= kpi.target + 5 && kpi.value > kpi.target;

  if (ok) {
    return {
      border: "border-emerald-200/70 dark:border-emerald-900/60",
      icon: "text-emerald-500",
      value: "text-emerald-700 dark:text-emerald-400",
      chip: "text-emerald-600 dark:text-emerald-400",
    };
  }
  if (warn) {
    return {
      border: "border-amber-200/70 dark:border-amber-900/60",
      icon: "text-amber-500",
      value: "text-amber-700 dark:text-amber-400",
      chip: "text-amber-600 dark:text-amber-400",
    };
  }
  return {
    border: "border-red-200/70 dark:border-red-900/60",
    icon: "text-red-500",
    value: "text-red-700 dark:text-red-400",
    chip: "text-red-600 dark:text-red-400",
  };
}

function formatRangeLabel(
  range: DateRangeType,
  start: string,
  end: string,
): string {
  const friendly: Record<DateRangeType, string> = {
    today: "Today",
    mtd: "Month to Date",
    qtd: "Quarter to Date",
    ytd: "Year to Date",
    custom: "Custom",
  };
  const startD = new Date(start);
  const endD = new Date(end);
  const sameDay =
    startD.toDateString() === endD.toDateString();
  const dateStr = sameDay
    ? format(startD, "MMM d, yyyy")
    : `${format(startD, "MMM d")} – ${format(endD, "MMM d, yyyy")}`;
  return `${friendly[range]} · ${dateStr}`;
}

function SectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-3.5 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
