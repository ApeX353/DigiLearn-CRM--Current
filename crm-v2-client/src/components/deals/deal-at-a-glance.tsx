/**
 * Deal "at-a-glance" — the left-pane summary for the deal detail
 * page. Mirrors the scannability of LeadAtAGlance but tuned for the
 * deal's own shape (commercial value · stage · owner · school ·
 * close date · health).
 *
 * Explicitly side-rail-first: everything stacks in a single column
 * with generous label / value rhythm so it reads cleanly at ~400px.
 * The deal page's own Overview tab still owns the full edit forms —
 * this component is read-only scan material.
 */
import { differenceInDays, format } from "date-fns";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  Building2,
  Calendar,
  DollarSign,
  Flag,
  Gauge,
  Clock,
  Tag,
  User as UserIcon,
} from "lucide-react";
import { Link } from "react-router";
import type { Deal } from "~/api/deals";
import type { Activity } from "~/api/activities";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import {
  ActivitySignalLine,
  ActivityTypeIcon,
} from "~/components/activities/activity-kit";
import { useCurrency } from "~/hooks/use-currency";
import { cn } from "~/lib/utils";

interface DealAtAGlanceProps {
  deal: Deal;
  /** Soonest open activity for the deal, if any (already fetched elsewhere). */
  nextActivity?: Activity | null;
  lastActivityAt?: Date | null;
  className?: string;
}

export function DealAtAGlance({
  deal,
  nextActivity,
  lastActivityAt,
  className,
}: DealAtAGlanceProps) {
  const { formatCurrency } = useCurrency();

  const value = Number(deal.value || 0);
  const stage = deal.currentStatus || "Stage";
  const closeStatus = deal.closeStatus || "ongoing";
  const owner = deal.assigned_user;
  const ownerName =
    [owner?.first_name, owner?.last_name].filter(Boolean).join(" ").trim() ||
    owner?.first_name ||
    null;
  const expectedClose =
    deal.expected_close_date || deal.expectedCloseDate || null;
  const health = deal.healthScore;
  const school = deal.school;
  const stageSlaDays = Number(deal.current_stage?.sla_days || 0);
  const stageSince = deal.current_stage_since || deal.currentStageSince || null;
  const daysInStage = stageSince
    ? differenceInDays(new Date(), new Date(stageSince))
    : null;
  const stageBreached =
    (deal as Deal & { sla_breached?: boolean }).sla_breached ||
    (stageSlaDays > 0 && daysInStage !== null && daysInStage > stageSlaDays);
  const stageAtRisk =
    !stageBreached &&
    stageSlaDays > 0 &&
    daysInStage !== null &&
    daysInStage >= stageSlaDays * 0.8;
  const lastContactedAt = deal.last_contacted_at
    ? new Date(deal.last_contacted_at)
    : null;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="grid grid-cols-1 gap-4 p-4">
        <Section eyebrow="Commercial" icon={DollarSign} accent="text-emerald-600 dark:text-emerald-400">
          <Row label="Value">
            <span className="font-semibold text-foreground tabular">
              {formatCurrency(value)}
            </span>
          </Row>
          <Row label="Stage">
            <Badge variant="outline" className="capitalize">
              {stage}
            </Badge>
          </Row>
          <Row label="Close status">
            <Badge
              variant={closeStatus === "ongoing" ? "secondary" : "default"}
              className="capitalize"
            >
              {closeStatus}
            </Badge>
          </Row>
          {expectedClose && (
            <Row label="Expected close">
              <span className="tabular">
                {format(new Date(expectedClose), "MMM d, yyyy")}
              </span>
            </Row>
          )}
        </Section>

        <Section eyebrow="Ownership" icon={UserIcon} accent="text-indigo-600 dark:text-indigo-400">
          <Row label="Owner">
            {ownerName ? (
              <span className="font-medium text-foreground">{ownerName}</span>
            ) : (
              <Empty>Unassigned</Empty>
            )}
          </Row>
          {school && (
            <Row label="School">
              <Link
                to={`/schools/${school.id}`}
                className="inline-flex items-center gap-1 text-primary hover:underline truncate"
              >
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{school.name}</span>
              </Link>
            </Row>
          )}
        </Section>

        <Section eyebrow="Engagement" icon={ActivityIcon} accent="text-amber-600 dark:text-amber-400">
          <Row label="Last touch">
            {lastActivityAt ? (
              <span className="tabular">
                {format(lastActivityAt, "MMM d, yyyy")}
              </span>
            ) : lastContactedAt ? (
              <span className="tabular">
                {format(lastContactedAt, "MMM d, yyyy")}
              </span>
            ) : (
              <Empty>No activity yet</Empty>
            )}
          </Row>
          <Row label="Next step">
            {nextActivity ? (
              <div className="flex items-center gap-2 min-w-0">
                <ActivityTypeIcon
                  type={nextActivity.type}
                  size="xs"
                  className="shrink-0"
                />
                <span className="truncate" title={nextActivity.subject}>
                  {nextActivity.subject || "Scheduled"}
                </span>
              </div>
            ) : closeStatus !== "ongoing" ? (
              <Empty>
                Deal {closeStatus} — no next action owed
              </Empty>
            ) : (
              <Empty>No next step</Empty>
            )}
          </Row>
          {/* The book-a-call nag is live-deal discipline; a closed deal is
              finished and owes nothing. */}
          {!nextActivity && closeStatus === "ongoing" && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Book a call, email, meeting, WhatsApp, or task so the deal has
                a clear next action. Notes do not count as next actions.
              </span>
            </div>
          )}
          {nextActivity && (
            <Row label="Due">
              <ActivitySignalLine
                activity={{
                  dueAt: nextActivity.due_at,
                  scheduledAt: nextActivity.scheduled_at,
                  completedAt: nextActivity.completed_at,
                  status: nextActivity.status,
                }}
              />
            </Row>
          )}
        </Section>

        {(health !== null && health !== undefined) || deal.probability != null ? (
          <Section eyebrow="Signal" icon={Gauge} accent="text-rose-600 dark:text-rose-400">
            {health !== null && health !== undefined && (
              <Row label="Health score">
                <span className="font-semibold tabular">{health}%</span>
              </Row>
            )}
            {deal.probability != null && (
              <Row label="Win probability">
                <span className="tabular">{deal.probability}%</span>
              </Row>
            )}
          </Section>
        ) : null}

        {/* The Deal entity exposes free-form text as `notes`, not
            `description` — an older draft of this panel referenced a
            non-existent field and broke the build. */}
        {deal.notes ? (
          <Section eyebrow="About" icon={Tag} accent="text-slate-600 dark:text-slate-400">
            <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-6">
              {deal.notes}
            </p>
          </Section>
        ) : null}

        {stageSince ? (
          <Section eyebrow="Timing" icon={Flag} accent="text-violet-600 dark:text-violet-400">
            <Row label="In stage since">
              <span className="tabular">
                {format(new Date(stageSince), "MMM d, yyyy")}
              </span>
            </Row>
            {daysInStage !== null && (
              <Row label="Stage age">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular",
                    stageBreached &&
                      "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
                    stageAtRisk &&
                      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
                    !stageBreached &&
                      !stageAtRisk &&
                      "border-border bg-muted text-muted-foreground",
                  )}
                  title={
                    stageSlaDays > 0
                      ? `Stage SLA is ${stageSlaDays} day${stageSlaDays === 1 ? "" : "s"}`
                      : "No stage SLA configured"
                  }
                >
                  {stageBreached ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  {daysInStage}d
                  {stageBreached
                    ? " breached"
                    : stageAtRisk
                      ? " at risk"
                      : ""}
                </span>
              </Row>
            )}
            {deal.created_at && (
              <Row label="Created">
                <span className="tabular">
                  {format(new Date(deal.created_at), "MMM d, yyyy")}
                </span>
              </Row>
            )}
          </Section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Section({
  eyebrow,
  icon: Icon,
  accent,
  children,
}: {
  eyebrow: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className={cn("flex items-center gap-2 text-xs font-semibold uppercase tracking-wider", accent)}>
        <Icon className="h-3.5 w-3.5" />
        {eyebrow}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 min-w-0">
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5">
        <Calendar className="hidden" />
        {label}
      </span>
      <div className="text-sm text-right min-w-0 max-w-[70%] flex justify-end items-center">
        {children}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="text-xs italic text-muted-foreground">{children}</span>;
}
