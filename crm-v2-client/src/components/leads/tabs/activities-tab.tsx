/**
 * Lead detail → Activities tab.
 *
 * Two halves:
 *   - Left rail (manager glance): touch counts, time-to-first-touch,
 *     meetings booked, incomplete logs. Preserved verbatim from the
 *     previous version because managers actively use these KPIs.
 *   - Right pane: the new EngagementWorkspace — Planned next step on
 *     top, Done history below, with content tabs and type chips that
 *     mirror the patterns on the main Activities page.
 */
import { AlertTriangle, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import type { Lead } from "~/api/leads";
import { useLeadActivityStats } from "~/api/activities";
import { EngagementWorkspace } from "~/components/activities/engagement-workspace";
import { isLeadReadonly } from "~/stores/use-is-readonly";

interface ActivitiesTabProps {
  lead: Lead;
}

export function ActivitiesTab({ lead }: ActivitiesTabProps) {
  const { data: stats } = useLeadActivityStats(lead.id);
  const readonly = isLeadReadonly(lead.status);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Manager Glance — KPIs scoped to this lead */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Manager Glance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats?.isStale && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Stale — no activity in 7 days
                </span>
              </div>
            )}

            <div className="grid gap-3">
              <KpiTile
                label="Touches (7d)"
                value={String(stats?.touchesLast7Days ?? 0)}
              />
              <KpiTile
                label="Time to 1st Touch"
                value={
                  stats?.timeToFirstTouch != null
                    ? `${stats.timeToFirstTouch}h`
                    : "—"
                }
              />
              <KpiTile
                label="Meetings Booked"
                value={String(stats?.meetingsBookedCount ?? 0)}
              />
              <KpiTile
                label="Incomplete Logs"
                value={String(stats?.incompleteLogsCount ?? 0)}
                accent={
                  (stats?.incompleteLogsCount ?? 0) > 0 ? "warn" : undefined
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Guardrails</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• New → Contacted requires ≥ 1 activity</p>
            <p>• Every activity except Note needs a next step + due date</p>
            <p>• "Stale" shows after 7 days of inactivity</p>
          </CardContent>
        </Card>
      </div>

      {/* Engagement workspace */}
      <div className="lg:col-span-2">
        <EngagementWorkspace
          leadId={lead.id}
          scope="lead"
          isReadonly={readonly}
        />
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "warn";
}) {
  return (
    <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          "text-lg font-semibold " +
          (accent === "warn" ? "text-amber-600" : "")
        }
      >
        {value}
      </span>
    </div>
  );
}
