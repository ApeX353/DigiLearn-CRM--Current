import { useMemo, useState } from "react";
import { Download, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import PageHeader from "~/components/page-header";
import Container from "~/components/container";
import { useComplianceReport } from "~/api/compliance-report/use-compliance-report";

/**
 * Phase E — admin/manager Compliance Report page.
 *
 * Renders org totals + per-rep breakdown vs the configured Compliance
 * & Controls thresholds. Reuses the same numbers the dashboard's
 * Activity Discipline cards already track but in a different,
 * exportable shape with explicit pass/fail labels per rep.
 */

const RANGES = [
  { value: "today", label: "Today" },
  { value: "mtd", label: "This month" },
  { value: "qtd", label: "This quarter" },
  { value: "ytd", label: "This year" },
];

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ComplianceReportPage() {
  const [range, setRange] = useState("mtd");
  const { data, isLoading, isFetching } = useComplianceReport({
    dateRange: range,
  });

  const reps = data?.reps ?? [];
  const t = data?.totals;
  const th = data?.thresholds;

  const failingReps = useMemo(
    () => reps.filter((r) => !r.passes_outcome || !r.passes_next_step).length,
    [reps],
  );

  const handleExport = () => {
    if (!data) return;
    const rangeLabel = data.window.range;
    const headers = [
      "Rep",
      "Email",
      "Contacts",
      "Completed",
      "With outcome",
      "Outcome %",
      "Outcome target %",
      "Outcome pass?",
      "Next-step compliant",
      "Next-step %",
      "Next-step target %",
      "Next-step pass?",
      "Overdue",
      "Stale leads",
    ];
    const rows: (string | number)[][] = [headers];
    for (const r of reps) {
      rows.push([
        r.name,
        r.email ?? "",
        r.contacts,
        r.completed,
        r.with_outcome,
        r.outcome_pct,
        th?.outcome_target_pct ?? 0,
        r.passes_outcome ? "PASS" : "FAIL",
        r.next_step_compliant,
        r.next_step_pct,
        th?.next_step_target_pct ?? 0,
        r.passes_next_step ? "PASS" : "FAIL",
        r.overdue,
        r.stale_leads,
      ]);
    }
    downloadCsv(`compliance-report-${rangeLabel}.csv`, rows);
  };

  return (
    <Container>
      <PageHeader
        title="Compliance Report"
        subtitle={
          isFetching
            ? "Refreshing…"
            : failingReps > 0
              ? `${failingReps} rep${failingReps === 1 ? "" : "s"} below at least one goal`
              : "All reps meeting their goals"
        }
      />
      <section className="p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Period:</span>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-48" data-testid="cr-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!data}
            data-testid="cr-export"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Totals card */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completed activities</CardDescription>
              <CardTitle className="text-3xl">
                {isLoading ? <Skeleton className="h-8 w-20" /> : (t?.completed ?? 0)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Calls, meetings, emails, WhatsApps, tasks completed in this period.
              Notes don't count.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Outcome compliance</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    {t?.outcome_pct ?? 0}%
                    {th && (t?.outcome_pct ?? 0) >= th.outcome_target_pct ? (
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200"
                      >
                        on goal
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-rose-50 text-rose-700 border-rose-200"
                      >
                        below goal
                      </Badge>
                    )}
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              How often reps record what happened after a call, meeting, or
              email. Goal: {th?.outcome_target_pct ?? 95}%.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Next-step compliance</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    {t?.next_step_pct ?? 0}%
                    {th &&
                    (t?.next_step_pct ?? 0) >= th.next_step_target_pct ? (
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200"
                      >
                        on goal
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-rose-50 text-rose-700 border-rose-200"
                      >
                        below goal
                      </Badge>
                    )}
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              How often reps book a next step after finishing an activity.
              Goal: {th?.next_step_target_pct ?? 80}%.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending approvals</CardDescription>
              <CardTitle className="text-3xl">
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  (t?.pending_approvals.tactical_disqualify ?? 0) +
                  (t?.pending_approvals.reassignment ?? 0) +
                  (t?.pending_approvals.status_reversal ?? 0)
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Soft disqualifications: {t?.pending_approvals.tactical_disqualify ?? 0} ·
              Reassignments: {t?.pending_approvals.reassignment ?? 0} ·
              Reopen requests: {t?.pending_approvals.status_reversal ?? 0}
            </CardContent>
          </Card>
        </div>

        {/* Per-rep table */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  Per-rep compliance
                </CardTitle>
                <CardDescription>
                  Sorted with the lowest outcome compliance first so the
                  reps who need attention surface at the top.
                </CardDescription>
              </div>
              {!isLoading && th && (
                <div
                  className="text-xs rounded-md border bg-muted/30 p-2 max-w-[28rem]"
                  data-testid="cr-targets-chip"
                >
                  <strong>Goals in use:</strong> outcome{" "}
                  {th.outcome_target_pct}% · next-step{" "}
                  {th.next_step_target_pct}% · stale lead{" "}
                  {th.stale_lead_days}d · daily contacts/rep{" "}
                  {th.daily_contacts_per_rep}.{" "}
                  <span className="text-muted-foreground">
                    Change them at Settings → Compliance &amp; Controls.
                  </span>
                </div>
              )}
            </div>
            {/* Legend: makes the row colours self-explanatory. */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-rose-100 border border-rose-300" />
                Row tint = at least one goal missed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-rose-700 font-semibold">red %</span>
                = below goal
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-amber-700 font-semibold">amber #</span>
                = needs attention
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : reps.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No active reps in this period.
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm" data-testid="cr-table">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-3">Rep</th>
                      <th className="text-right p-3" title="First-time lead contacts in this period">Contacts</th>
                      <th className="text-right p-3" title="Calls / meetings / emails / WhatsApps / tasks completed in period (notes excluded)">Completed</th>
                      <th className="text-right p-3" title="% of completed activities that recorded what happened">Outcome %</th>
                      <th className="text-right p-3" title="% of completed activities followed by a booked next step">Next-step %</th>
                      <th className="text-right p-3" title="Open actionable activities past their due date">Overdue</th>
                      <th className="text-right p-3" title="Active leads with no contact in the configured stale-lead window">Stale leads</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {reps.map((r) => {
                      const failsAny = !r.passes_outcome || !r.passes_next_step;
                      return (
                      <tr
                        key={r.user_id}
                        className={
                          failsAny
                            ? "bg-rose-50/30 dark:bg-rose-950/10"
                            : ""
                        }
                        data-testid={`cr-row-${r.user_id}`}
                      >
                        <td className="p-3">
                          <div className="font-medium flex items-center gap-2 flex-wrap">
                            {r.name}
                            {failsAny && (
                              <Badge
                                variant="outline"
                                className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900"
                              >
                                Below goal
                              </Badge>
                            )}
                          </div>
                          {r.email && (
                            <div className="text-xs text-muted-foreground">
                              {r.email}
                            </div>
                          )}
                          {/* Manager actionability — one-click into this
                              rep's own activity log so they don't have to
                              copy-paste a name into search. */}
                          <a
                            href={`/activities?assigned_to=${r.user_id}`}
                            className="text-[11px] text-primary hover:underline"
                          >
                            Open activity list →
                          </a>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {r.contacts}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {r.completed}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span
                            className={
                              r.passes_outcome
                                ? "text-green-700"
                                : "text-rose-700 font-semibold"
                            }
                            title={
                              r.completed
                                ? `${r.with_outcome} of ${r.completed} activities recorded an outcome`
                                : "No activities completed in this period"
                            }
                          >
                            {r.outcome_pct}%
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span
                            className={
                              r.passes_next_step
                                ? "text-green-700"
                                : "text-rose-700 font-semibold"
                            }
                            title={
                              r.completed
                                ? `${r.next_step_compliant} of ${r.completed} activities had a next step booked`
                                : "No activities completed in this period"
                            }
                          >
                            {r.next_step_pct}%
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {r.overdue > 0 ? (
                            <span className="text-amber-700 font-semibold">
                              {r.overdue}
                            </span>
                          ) : (
                            r.overdue
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {r.stale_leads > 0 ? (
                            <span className="text-amber-700 font-semibold">
                              {r.stale_leads}
                            </span>
                          ) : (
                            r.stale_leads
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!isLoading && (
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <AlertTriangle className="h-3 w-3" />
                Numbers reflect activity completed in the selected period.
                Outcome & next-step compliance match the same definitions
                the dashboard's Activity Discipline cards use, and the
                values you set on the Compliance &amp; Controls tab.
                {isFetching && (
                  <Loader2 className="h-3 w-3 animate-spin ml-1" />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </Container>
  );
}
