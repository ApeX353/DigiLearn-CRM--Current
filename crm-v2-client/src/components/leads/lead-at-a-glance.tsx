import { useMemo } from "react";
import { formatDistanceToNow, format, isPast } from "date-fns";
import {
  Building2,
  User as UserIcon,
  Phone,
  Mail,
  MapPin,
  BadgeCheck,
  Target,
  Flame,
  Snowflake,
  Thermometer,
  Activity as ActivityIcon,
  CalendarClock,
  CircleAlert,
  Wallet,
  PackageSearch,
  Timer,
  ShieldCheck,
  Info,
  ArrowRight,
} from "lucide-react";

import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import {
  calculateLeadCompleteness,
  getCompletenessTone,
} from "~/lib/lead-completeness";
import { getActivityVisual } from "~/lib/activity-visuals";
import {
  ActivitySignalLine,
  ActivityTypeIcon,
  activityTouchDate,
  pickPivotalActivities,
} from "~/components/activities/activity-kit";
import type { Lead } from "~/api/leads";
import type { Activity } from "~/api/activities";
import type { LeadQualificationCriteria } from "~/api/lead-qualification";

interface LeadAtAGlanceProps {
  lead: Lead;
  qualification?: LeadQualificationCriteria | null;
  activities?: Activity[];
  onEditQualification?: () => void;
  className?: string;
  /**
   * How to lay out the five sections.
   *
   *   - "banner" (default) — legacy horizontal layout: 2 cols on md,
   *     5 cols on xl. Works as a top-of-page summary strip.
   *   - "stack" — single column, one section per row. Used when the
   *     component renders inside a narrow side rail (e.g. the lead
   *     detail page's left pane). Prevents the "crushed text +
   *     overlapping badges" failure mode that horizontal grids show
   *     at ~400px widths.
   */
  layout?: "banner" | "stack";
}

/**
 * The "at-a-glance" lead intelligence panel. Answers the question
 * "what is the state of this lead?" in a single look — so that reps
 * and managers do not need to dig through tabs to understand where
 * things stand.
 *
 * Five sections, in scan order:
 *   1. Identity          — school, contact, role, location
 *   2. Sales status      — status, owner, qualification, source
 *   3. Engagement        — last touch, next activity, overdue flag
 *   4. Commercial signal — estimated value, temperature, budget, timeline
 *   5. Data quality      — completeness score + missing critical fields
 */
export function LeadAtAGlance({
  lead,
  qualification,
  activities,
  onEditQualification,
  className,
  layout = "banner",
}: LeadAtAGlanceProps) {
  const completeness = useMemo(
    () => calculateLeadCompleteness(lead, qualification),
    [lead, qualification],
  );
  const completenessTone = getCompletenessTone(completeness.status);

  const { nextActivity, lastActivity } = useMemo(
    () => pickPivotalActivities(activities ?? []),
    [activities],
  );

  const lastTouchDate =
    activityTouchDate(lastActivity) ||
    (lead.last_action_at ? new Date(lead.last_action_at) : null) ||
    (lead.last_contacted_at ? new Date(lead.last_contacted_at) : null);

  const nextActivityDate =
    nextActivity?.scheduled_at ||
    nextActivity?.due_at ||
    null;
  const nextActivityDateObj = nextActivityDate ? new Date(nextActivityDate) : null;
  const nextActivityOverdue = nextActivityDateObj
    ? isPast(nextActivityDateObj) && nextActivity?.status !== "completed"
    : false;

  const hasNoNextActivity = !nextActivity;

  const schoolName = lead.school?.name || "--";
  const schoolLocation = [lead.school?.city, lead.school?.province]
    .filter(Boolean)
    .join(", ") || "--";

  const contactFullName = lead.primary_contact
    ? `${lead.primary_contact.first_name ?? ""} ${lead.primary_contact.last_name ?? ""}`.trim()
    : null;
  const contactRole = lead.primary_contact?.role;
  const contactPhone =
    lead.primary_contact?.phone ?? lead.primary_contact?.whatsapp_number;
  const contactEmail = lead.primary_contact?.email;

  const assigneeName =
    [lead.assignee?.first_name, lead.assignee?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || null;

  const budgetLabel = qualification?.budget_amount
    ? `$${qualification.budget_amount}`
    : qualification?.budget_indicator
      ? capitalize(qualification.budget_indicator.replace("-", " "))
      : null;

  const timelineLabel = qualification?.timeline_type
    ? timelineToLabel(qualification.timeline_type, qualification.specific_date)
    : null;

  const needsLabel = qualification?.needs
    ? qualification.needs.split(",").map((s) => s.trim()).filter(Boolean).join(", ")
    : null;

  const temperatureVisual = getTemperatureVisual(lead.temperature);

  return (
    <Card className={cn("overflow-hidden border-border/70", className)}>
      <CardContent
        className={cn(
          "grid p-4",
          layout === "banner"
            ? "gap-6 md:grid-cols-2 xl:grid-cols-5"
            : // Stack vertically in narrow side-rail contexts. Single
              // column so each section has the full pane width and no
              // section fights another for horizontal space.
              "gap-4 grid-cols-1",
        )}
      >
        {/* 1. Identity */}
        <Section
          eyebrow="Identity"
          icon={Building2}
          accent="text-indigo-600 dark:text-indigo-400"
        >
          <SectionRow icon={Building2} label="School">
            <span className="font-medium text-foreground">{schoolName}</span>
          </SectionRow>

          <SectionRow icon={UserIcon} label="Main contact">
            {contactFullName ? (
              <div className="flex flex-col">
                <span className="font-medium text-foreground">
                  {contactFullName}
                </span>
                {contactRole && (
                  <span className="text-xs text-muted-foreground">
                    {contactRole}
                  </span>
                )}
              </div>
            ) : (
              <EmptyHint>Add a contact</EmptyHint>
            )}
          </SectionRow>

          <SectionRow icon={Phone} label="Phone">
            {contactPhone ? (
              <a
                href={`tel:${contactPhone}`}
                className="text-primary hover:underline tabular"
              >
                {contactPhone}
              </a>
            ) : (
              <EmptyHint>Missing</EmptyHint>
            )}
          </SectionRow>

          <SectionRow icon={Mail} label="Email">
            {contactEmail ? (
              <a
                href={`mailto:${contactEmail}`}
                className="text-primary hover:underline truncate"
                title={contactEmail}
              >
                {contactEmail}
              </a>
            ) : (
              <EmptyHint>Missing</EmptyHint>
            )}
          </SectionRow>

          <SectionRow icon={MapPin} label="Location">
            <span className="text-foreground">{schoolLocation}</span>
          </SectionRow>
        </Section>

        {/* 2. Sales status */}
        <Section
          eyebrow="Sales status"
          icon={BadgeCheck}
          accent="text-sky-600 dark:text-sky-400"
        >
          <SectionRow icon={Target} label="Status">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{lead.status}</Badge>
              {lead.sla_breached && (
                <Badge
                  variant="destructive"
                  title="This lead has an unresolved SLA obligation. A recent activity does not clear the breach unless the required action is satisfied."
                >
                  SLA breached
                </Badge>
              )}
            </div>
          </SectionRow>

          <SectionRow icon={UserIcon} label="Owner">
            {assigneeName ? (
              <span className="font-medium text-foreground">
                {assigneeName}
              </span>
            ) : (
              <EmptyHint>Unassigned</EmptyHint>
            )}
          </SectionRow>

          <SectionRow icon={ShieldCheck} label="Qualification">
            {qualification ? (
              <QualificationStrip qualification={qualification} />
            ) : (
              <EmptyHint>Not started</EmptyHint>
            )}
          </SectionRow>

          <SectionRow icon={Info} label="Source">
            <span className="text-foreground">{lead.source || "--"}</span>
          </SectionRow>

          {lead.sla_breached && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
              <CircleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                SLA is still breached until the required response or stage
                obligation is satisfied. Notes or recent communication alone do
                not clear it.
              </span>
            </div>
          )}
        </Section>

        {/* 3. Engagement */}
        <Section
          eyebrow="Engagement"
          icon={ActivityIcon}
          accent="text-emerald-600 dark:text-emerald-400"
        >
          <SectionRow icon={ActivityIcon} label="Last touch">
            {lastTouchDate ? (
              <div className="flex flex-col">
                <span className="text-foreground">
                  {formatDistanceToNow(lastTouchDate, { addSuffix: true })}
                </span>
                {lastActivity?.type && (
                  <span className="text-xs text-muted-foreground capitalize">
                    {getActivityVisual(lastActivity.type).label}
                    {lastActivity.subject ? ` · ${lastActivity.subject}` : ""}
                  </span>
                )}
              </div>
            ) : (
              <EmptyHint>No activity yet</EmptyHint>
            )}
          </SectionRow>

          <SectionRow icon={CalendarClock} label="Next activity">
            {nextActivity && nextActivityDateObj ? (
              <NextActivityLine
                activity={nextActivity}
                date={nextActivityDateObj}
                overdue={nextActivityOverdue}
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <EmptyHint>No next activity</EmptyHint>
                <Badge
                  variant="outline"
                  className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900"
                >
                  Schedule one
                </Badge>
              </div>
            )}
          </SectionRow>

          {(nextActivityOverdue || hasNoNextActivity) && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
              <CircleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span className="text-pretty">
                {nextActivityOverdue
                  ? "Follow-up is overdue. Reach out today."
                  : "No next step planned. Keep the lead moving."}
              </span>
            </div>
          )}
        </Section>

        {/* 4. Commercial signal */}
        <Section
          eyebrow="Commercial signal"
          icon={Wallet}
          accent="text-amber-600 dark:text-amber-400"
        >
          <SectionRow icon={Wallet} label="Est. value">
            <span className="font-semibold text-foreground tabular">
              {formatCurrency(lead.estimated_value)}
            </span>
          </SectionRow>

          {/* LNAME2: what the client wants / is interested in. */}
          {lead.notes ? (
            <SectionRow icon={PackageSearch} label="Interest">
              <span className="text-foreground line-clamp-3 text-pretty">
                {lead.notes}
              </span>
            </SectionRow>
          ) : null}

          <SectionRow icon={temperatureVisual.icon} label="Temperature">
            {lead.temperature ? (
              <Badge
                variant="outline"
                className={cn("capitalize", temperatureVisual.chip)}
              >
                {lead.temperature}
                {lead.temperature_score !== null &&
                  ` · ${lead.temperature_score}`}
              </Badge>
            ) : (
              <EmptyHint>Not scored</EmptyHint>
            )}
          </SectionRow>

          <SectionRow icon={PackageSearch} label="Needs">
            {needsLabel ? (
              <span
                className="text-foreground line-clamp-2"
                title={needsLabel}
              >
                {needsLabel}
              </span>
            ) : (
              <EmptyHint>Not captured</EmptyHint>
            )}
          </SectionRow>

          <SectionRow icon={Timer} label="Timeline">
            {timelineLabel ? (
              <span className="text-foreground">{timelineLabel}</span>
            ) : (
              <EmptyHint>Unknown</EmptyHint>
            )}
          </SectionRow>

          <SectionRow icon={Wallet} label="Budget">
            {budgetLabel ? (
              <span className="text-foreground">{budgetLabel}</span>
            ) : (
              <EmptyHint>Not confirmed</EmptyHint>
            )}
          </SectionRow>
        </Section>

        {/* 5. Data quality */}
        <Section
          eyebrow="Data quality"
          icon={ShieldCheck}
          accent="text-rose-600 dark:text-rose-400"
        >
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span className="text-3xl font-semibold tabular leading-none">
                {completeness.score}
              </span>
              <span className="text-xs text-muted-foreground ml-0.5 self-end pb-1">
                /100
              </span>
            </div>
            <Badge
              variant="outline"
              className={cn("capitalize", completenessTone.chip)}
            >
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full mr-1.5",
                  completenessTone.dot,
                )}
              />
              {completenessTone.label}
            </Badge>
          </div>

          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full transition-all", completenessTone.bar)}
              style={{ width: `${Math.max(4, completeness.score)}%` }}
            />
          </div>

          {completeness.missingCritical.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Missing critical
              </p>
              <ul className="space-y-1">
                {completeness.missingCritical.slice(0, 4).map((field) => (
                  <li
                    key={field.key}
                    className="flex items-start gap-1.5 text-xs text-foreground"
                  >
                    <CircleAlert className="h-3.5 w-3.5 mt-0.5 text-red-500 shrink-0" />
                    <span title={field.hint}>{field.label}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Fix these first before qualifying or advancing the lead.
              </p>
            </div>
          )}

          {completeness.missingCritical.length === 0 &&
            completeness.missingOptional.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Nice to have
                </p>
                <ul className="space-y-1">
                  {completeness.missingOptional.slice(0, 3).map((field) => (
                    <li
                      key={field.key}
                      className="flex items-start gap-1.5 text-xs text-muted-foreground"
                    >
                      <span className="mt-1 h-1 w-1 rounded-full bg-amber-400 shrink-0" />
                      <span title={field.hint}>{field.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {onEditQualification && (
            <Button
              variant="outline"
              size="sm"
              onClick={onEditQualification}
              className="w-full justify-between"
            >
              Update qualification
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </Section>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Internal composition helpers                                        */
/* ------------------------------------------------------------------ */

interface SectionProps {
  eyebrow: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  children: React.ReactNode;
}

function Section({ eyebrow, icon: Icon, accent, children }: SectionProps) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", accent)} />
        <h3 className="label-overline text-[11px]">{eyebrow}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

interface SectionRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}

function SectionRow({ icon: Icon, label, children }: SectionRowProps) {
  return (
    <div className="grid grid-cols-[18px_68px_1fr] items-start gap-2 text-sm leading-snug">
      <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground pt-0.5">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs text-muted-foreground italic">{children}</span>
  );
}

function NextActivityLine({
  activity,
}: {
  activity: Activity;
  // `date` and `overdue` are now derived from the activity inside the
  // shared kit primitives — kept as no-op props so callers don't have
  // to change.
  date?: Date;
  overdue?: boolean;
}) {
  const visual = getActivityVisual(activity.type);
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <ActivityTypeIcon type={activity.type} size="xs" className="shrink-0" />
        <span
          className="text-foreground truncate"
          title={activity.subject || visual.label}
        >
          {activity.subject || visual.label}
        </span>
      </div>
      <ActivitySignalLine
        activity={{
          dueAt: activity.due_at,
          scheduledAt: activity.scheduled_at,
          completedAt: activity.completed_at,
          status: activity.status,
        }}
      />
    </div>
  );
}

interface QualificationStripProps {
  qualification: LeadQualificationCriteria;
}

function QualificationStrip({ qualification }: QualificationStripProps) {
  const pillars = [
    { key: "B", label: "Budget", ok: qualification.has_budget },
    {
      key: "A",
      label: "Authority",
      ok: qualification.has_influential_contact,
    },
    { key: "N", label: "Need", ok: qualification.has_needs },
    { key: "T", label: "Timeline", ok: qualification.has_timeline },
  ];

  const completed = pillars.filter((p) => p.ok).length;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {pillars.map((p) => (
          <span
            key={p.key}
            title={`${p.label}: ${p.ok ? "complete" : "missing"}`}
            className={cn(
              "inline-flex items-center justify-center h-4 w-4 rounded-[3px] text-[10px] font-semibold",
              p.ok
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {p.key}
          </span>
        ))}
      </div>
      <span className="text-xs text-muted-foreground tabular">
        {completed}/4
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                  */
/* ------------------------------------------------------------------ */

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  const n = Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timelineToLabel(timelineType: string, specificDate?: string | null) {
  switch (timelineType) {
    case "this-term":
      return "This term";
    case "next-term":
      return "Next term";
    case "within-6-months":
      return "Within 6 months";
    case "within-1-year":
      return "Within 1 year";
    case "specific-date":
      return specificDate
        ? `By ${format(new Date(specificDate), "MMM d, yyyy")}`
        : "Specific date";
    default:
      return timelineType;
  }
}

function getTemperatureVisual(temperature: Lead["temperature"]) {
  switch (temperature) {
    case "hot":
      return {
        icon: Flame,
        chip:
          "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900",
      };
    case "warm":
      return {
        icon: Thermometer,
        chip:
          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
      };
    case "cold":
      return {
        icon: Snowflake,
        chip:
          "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900",
      };
    default:
      return {
        icon: Thermometer,
        chip:
          "bg-muted text-muted-foreground border-transparent",
      };
  }
}
