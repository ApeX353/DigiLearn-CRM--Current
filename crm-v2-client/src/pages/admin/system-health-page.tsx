import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Play,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useAnyRole } from "~/hooks/use-permission";
import { apiErrorMessage } from "~/api/axios";
import {
  fetchDayLogText,
  useDayLog,
  useDiagnosticsHealth,
  useInvestigate,
  useJobSummary,
  usePeople,
  useRunJob,
  useSystemEvents,
} from "~/api/diagnostics/use-diagnostics";
import type { JobRunSummary, LogEntry, LogKind, PersonSummary, SystemEventSummary } from "~/api/diagnostics/types";

/**
 * System Health: the page that answers "is the CRM alright, and if not, for
 * whom?" in sentences first and numbers second. Three readers, two registers:
 * the owner (admin) sees plain language only; support (admin_support) can
 * open the technical panel on any item; the assistant gets the same data via
 * the API, which is why every item carries its reference code.
 */
export default function SystemHealthPage() {
  const allowed = useAnyRole(["admin", "admin_support"]);
  const isSupport = useAnyRole(["admin_support"]);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const refParam = params.get("ref");

  // The API decides whether an admin may see this yet (setting
  // diagnostics.visible_to_admin); a 403 on the health call means not yet.
  const health = useDiagnosticsHealth(allowed);
  const refused = health.isError && (health.error as { response?: { status?: number } })?.response?.status === 403;

  if (!allowed || refused) {
    return (
      <Container>
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertTitle>Not available</AlertTitle>
          <AlertDescription>
            {refused ? "System Health is not switched on for your account yet." : "System Health is limited to admin and support accounts."}
          </AlertDescription>
        </Alert>
      </Container>
    );
  }

  return (
    <Container>
      <PageHeader
        title="System Health"
        subtitle="What the CRM has been doing on its own, who is running into trouble, and what a reference code means"
      />
      <section className="space-y-4 p-4">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            const next = new URLSearchParams(params);
            next.set("tab", v);
            setParams(next, { replace: true });
          }}
        >
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="log">Day log</TabsTrigger>
            <TabsTrigger value="jobs">Scheduled jobs</TabsTrigger>
            <TabsTrigger value="people">People</TabsTrigger>
            <TabsTrigger value="lookup">Look up a code</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <OverviewTab isSupport={isSupport} />
          </TabsContent>
          <TabsContent value="log">
            <DayLogTab />
          </TabsContent>
          <TabsContent value="jobs">
            <JobsTab isSupport={isSupport} />
          </TabsContent>
          <TabsContent value="people">
            <PeopleTab />
          </TabsContent>
          <TabsContent value="lookup">
            <LookupTab initialReference={refParam} isSupport={isSupport} />
          </TabsContent>
        </Tabs>
      </section>
    </Container>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */
function OverviewTab({ isSupport }: { isSupport: boolean }) {
  const health = useDiagnosticsHealth();
  const jobs = useJobSummary();
  const since = useMemo(() => new Date(new Date().setHours(0, 0, 0, 0)).toISOString(), []);
  const problems = useSystemEvents({ level: "error", from: since, limit: "20" });

  const h = health.data;
  const overdue = (jobs.data ?? []).filter((j) => j.overdue);
  const failed = (jobs.data ?? []).filter((j) => j.lastRun?.status === "failed");
  const errorsToday = problems.data?.meta?.totalItems ?? 0;

  const headline = health.isLoading
    ? "Checking…"
    : !h
      ? "Could not reach the API."
      : h.db !== "ok"
        ? "The database is not answering. Everything else is secondary until that is fixed."
        : errorsToday === 0 && failed.length === 0 && overdue.length === 0
          ? "All quiet. No errors today, every scheduled job on time."
          : [
              errorsToday ? `${errorsToday} error${errorsToday === 1 ? "" : "s"} today` : "",
              failed.length ? `${failed.length} scheduled job${failed.length === 1 ? "" : "s"} failed on the last run` : "",
              overdue.length ? `${overdue.length} job${overdue.length === 1 ? "" : "s"} overdue` : "",
            ]
              .filter(Boolean)
              .join(", ") + ".";
  const tone = !h || h.db !== "ok" || failed.length ? "destructive" : errorsToday || overdue.length ? "warning" : "ok";

  return (
    <div className="space-y-4">
      <Card className={tone === "destructive" ? "border-destructive" : tone === "warning" ? "border-amber-400" : "border-emerald-400"}>
        <CardContent className="flex items-start gap-3 p-4">
          {tone === "ok" ? (
            <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
          ) : (
            <AlertTriangle className={`mt-0.5 size-5 ${tone === "destructive" ? "text-destructive" : "text-amber-600"}`} />
          )}
          <div className="space-y-1">
            <p className="text-base font-medium">{headline}</p>
            {h && (
              <p className="text-xs text-muted-foreground">
                API build {h.build.shortCommit} · up {humanDuration(h.uptimeSeconds)} · database answered in {h.dbLatencyMs} ms
                {isSupport ? ` · ${h.memoryMb} MB · pool ${h.pool?.idle ?? "?"}/${h.pool?.total ?? "?"} idle` : ""}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Problems today</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {problems.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {problems.data && problems.data.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing has gone wrong today.</p>
          )}
          {(problems.data?.data ?? []).map((e) => (
            <EventLine key={e.id} event={e} isSupport={isSupport} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Scheduled jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {(jobs.data ?? [])
            .filter((j) => j.overdue || j.lastRun?.status === "failed" || j.lastRun?.status === "lost")
            .map((j) => (
              <p key={j.name} className="text-sm">
                <AlertTriangle className="mr-1 inline size-4 text-amber-600" />
                {j.sentence}
              </p>
            ))}
          {(jobs.data ?? []).every((j) => !j.overdue && j.lastRun?.status !== "failed" && j.lastRun?.status !== "lost") && (
            <p className="text-sm text-muted-foreground">Every scheduled job ran when it should have. The full list is under "Scheduled jobs".</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EventLine({ event, isSupport }: { event: SystemEventSummary; isSupport: boolean }) {
  const [open, setOpen] = useState(false);
  const who = event.user?.name ?? (event.source === "job" ? "A scheduled job" : "Someone not signed in");
  const what =
    event.kind === "http_403"
      ? "was refused permission"
      : event.kind === "db_constraint"
        ? "hit a database rule"
        : event.kind === "job_failure"
          ? "failed"
          : "hit an error";
  return (
    <div className="rounded-md border p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={event.level === "error" ? "destructive" : "secondary"}>{event.reference}</Badge>
        <span>
          {who} {what}
          {event.path ? ` on ${friendlyPath(event.path)}` : ""} at {format(new Date(event.created_at), "HH:mm")}.
        </span>
        <CopyButton text={event.reference} label="Copy code" />
        {isSupport && (
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide details" : "Technical details"}
          </Button>
        )}
      </div>
      <p className="mt-1 text-muted-foreground">{event.message}</p>
      {open && isSupport && (
        <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(
            { method: event.method, path: event.path, status: event.status_code, request_id: event.request_id, roles: event.user_roles, stack: event.stack, body: event.body, details: event.details },
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Day log                                                             */
/* ------------------------------------------------------------------ */
const LOG_KINDS: Array<{ key: LogKind; label: string }> = [
  { key: "action", label: "People's actions" },
  { key: "session", label: "Sign-ins" },
  { key: "automation", label: "Automation" },
  { key: "problem", label: "Problems" },
  { key: "message", label: "Messages" },
  { key: "browser", label: "Browser errors" },
];

function hararToday(): string {
  // Africa/Harare is UTC+2 with no daylight saving.
  return new Date(Date.now() + 120 * 60_000).toISOString().slice(0, 10);
}

function shiftDay(day: string, by: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + by)).toISOString().slice(0, 10);
}

/**
 * The logbook: one day of what people and the system did, in sentences, in
 * Harare time, with repeats folded. Read it the way you'd skim a diary; the
 * summary line says whether the day was normal before you read a line.
 */
function DayLogTab() {
  const [day, setDay] = useState(hararToday());
  const [kinds, setKinds] = useState<LogKind[]>([]);
  const [person, setPerson] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const log = useDayLog(day, kinds.join(","), person, debouncedQ);
  const [downloading, setDownloading] = useState(false);

  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of log.data?.entries ?? []) if (e.actorId && e.actor) m.set(e.actorId, e.actor);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [log.data]);

  const byHour = useMemo(() => {
    const groups = new Map<string, LogEntry[]>();
    for (const e of log.data?.entries ?? []) {
      const h = e.time.slice(0, 2) + ":00";
      groups.set(h, [...(groups.get(h) ?? []), e]);
    }
    return [...groups.entries()];
  }, [log.data]);

  const download = async () => {
    setDownloading(true);
    try {
      const text = await fetchDayLogText(day);
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crm-day-log-${day}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiErrorMessage(e, "Could not prepare the text file."));
    } finally {
      setDownloading(false);
    }
  };

  const toggleKind = (k: LogKind) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const isToday = day >= hararToday();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setDay(shiftDay(day, -1))}>
          ← Previous day
        </Button>
        <Input type="date" value={day} max={hararToday()} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-44" />
        <Button variant="outline" size="sm" disabled={isToday} onClick={() => setDay(shiftDay(day, 1))}>
          Next day →
        </Button>
        <Button variant="outline" size="sm" disabled={downloading} onClick={download}>
          <Copy className="mr-1 size-4" /> Download as text
        </Button>
        <span className="text-xs text-muted-foreground">Times are Harare time.</span>
      </div>

      <Card>
        <CardContent className="p-4">
          {log.isLoading && <p className="text-sm text-muted-foreground">Reading the day…</p>}
          {log.isError && <p className="text-sm text-destructive">{apiErrorMessage(log.error, "Could not read the log.")}</p>}
          {log.data && <p className="text-base">{log.data.summary.headline}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {LOG_KINDS.map((k) => (
          <Button key={k.key} size="sm" variant={kinds.length === 0 || kinds.includes(k.key) ? "default" : "outline"} onClick={() => toggleKind(k.key)}>
            {k.label}
          </Button>
        ))}
        {kinds.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setKinds([])}>
            Show everything
          </Button>
        )}
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
        >
          <option value="">Everyone</option>
          {people.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the day (a name, a lead, a code)" className="max-w-xs" />
      </div>

      {log.data && log.data.entries.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing recorded for this day with these filters.</p>
      )}
      {byHour.map(([hour, items]) => (
        <Card key={hour}>
          <CardHeader className="py-2">
            <CardTitle className="text-sm text-muted-foreground">{hour}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pb-3">
            {items.map((e, i) => (
              <div key={`${e.at}-${i}`} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{e.time}</span>
                <Badge
                  variant={e.kind === "problem" ? "destructive" : e.kind === "action" ? "default" : "secondary"}
                  className="shrink-0"
                >
                  {LOG_KINDS.find((k) => k.key === e.kind)?.label ?? e.kind}
                </Badge>
                <span className="min-w-0 break-words">{e.sentence}</span>
                {e.reference && <CopyButton text={e.reference} label="Copy code" />}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      {log.data?.truncated && (
        <p className="text-xs text-muted-foreground">Showing the first 2,000 of {log.data.total} entries; narrow with the filters.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */
function JobsTab({ isSupport }: { isSupport: boolean }) {
  const jobs = useJobSummary();
  const run = useRunJob();
  return (
    <div className="space-y-2">
      {jobs.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {(jobs.data ?? []).map((j) => (
        <JobCard
          key={j.name}
          job={j}
          isSupport={isSupport}
          onRun={async () => {
            try {
              const out = (await run.mutateAsync(j.name)) as { status: string; skipReason?: string; errorReference?: string };
              toast[out.status === "failed" ? "error" : "success"](
                out.status === "ok"
                  ? `${j.title} ran.`
                  : out.status === "skipped"
                    ? `${j.title} did not need to run: ${out.skipReason ?? "skipped"}.`
                    : `${j.title} failed (reference ${out.errorReference ?? "none"}).`,
              );
            } catch (e) {
              toast.error(apiErrorMessage(e, `Could not run ${j.title}.`));
            }
          }}
          running={run.isPending}
        />
      ))}
    </div>
  );
}

function JobCard({ job, isSupport, onRun, running }: { job: JobRunSummary; isSupport: boolean; onRun: () => void; running: boolean }) {
  const status = job.lastRun?.status;
  const tone = status === "failed" || status === "lost" || job.overdue ? "destructive" : status === "skipped" ? "secondary" : "default";
  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{job.title}</span>
            <Badge variant={tone}>{status ?? "never ran"}</Badge>
            {job.overdue && <Badge variant="destructive">overdue</Badge>}
            {job.failuresLast24h > 0 && <Badge variant="outline">{job.failuresLast24h} failure{job.failuresLast24h === 1 ? "" : "s"} in 24 h</Badge>}
          </div>
          <p className="text-sm">{job.sentence}</p>
          <p className="text-xs text-muted-foreground">
            {job.purpose} Runs every {humanDuration(job.everyMs / 1000)}.
            {job.lastRun?.errorReference ? ` Reference ${job.lastRun.errorReference}.` : ""}
          </p>
        </div>
        {isSupport && (
          <Button variant="outline" size="sm" disabled={running} onClick={onRun}>
            <Play className="mr-1 size-4" /> Run now
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */
function PeopleTab() {
  const [days, setDays] = useState(7);
  const people = usePeople(days);
  const sorted = useMemo(
    () => [...(people.data ?? [])].sort((a, b) => Number(b.attention) - Number(a.attention) || b.errors + b.denials - (a.errors + a.denials)),
    [people.data],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Looking at the last</span>
        {[7, 14, 30].map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
            {d} days
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Nobody has to report a problem for it to show here. A person with a warning badge has hit several errors or refusals, or has not used the CRM for a few days; worth a call before they give up.
      </p>
      {people.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {sorted.map((p) => (
        <PersonCard key={p.id} person={p} />
      ))}
    </div>
  );
}

function PersonCard({ person }: { person: PersonSummary }) {
  return (
    <Card className={person.attention ? "border-amber-400" : undefined}>
      <CardContent className="flex flex-wrap items-start gap-3 p-4">
        <UserRound className="mt-0.5 size-5 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{person.name}</span>
            <span className="text-xs text-muted-foreground">{person.roles.join(", ")}</span>
            {person.attention && <Badge variant="outline">needs a look</Badge>}
          </div>
          <p className="text-sm">{person.summary}</p>
          {person.lastReference && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Latest code {person.lastReference}
              <CopyButton text={person.lastReference} label="Copy" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */
function LookupTab({ initialReference, isSupport }: { initialReference: string | null; isSupport: boolean }) {
  const [input, setInput] = useState(initialReference ?? "");
  const [reference, setReference] = useState<string | null>(initialReference);
  const bundle = useInvestigate(reference);

  useEffect(() => {
    if (initialReference) {
      setInput(initialReference);
      setReference(initialReference);
    }
  }, [initialReference]);

  const b = bundle.data;
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setReference(input.trim() || null);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type the code from the error message, e.g. ERR-7K3M2Q"
          className="max-w-sm"
        />
        <Button type="submit">
          <Search className="mr-1 size-4" /> Look up
        </Button>
      </form>
      {bundle.isLoading && <p className="text-sm text-muted-foreground">Looking…</p>}
      {bundle.isError && (
        <Alert>
          <AlertTitle>Nothing found</AlertTitle>
          <AlertDescription>{apiErrorMessage(bundle.error, "No record for that code. It may be older than 30 days, or mistyped.")}</AlertDescription>
        </Alert>
      )}
      {b && (
        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-2 p-4">
              <p className="text-base">{b.summary}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Clock className="size-3" /> {format(new Date(b.event.created_at), "d MMM yyyy HH:mm")} · build {b.deployed.shortCommit}
                {b.user ? ` · ${b.user.name} has ${b.user.eventsLast7Days} recorded problem${b.user.eventsLast7Days === 1 ? "" : "s"} in the last 7 days` : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={JSON.stringify(b, null, 2)} label="Copy everything for support" />
                <Button variant="outline" size="sm" asChild>
                  <a href={`/bug-reports?prefill=${encodeURIComponent(b.reference)}`}>Open a ticket with this code</a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Section title={`What else happened around it (${format(new Date(b.window.from), "HH:mm")}–${format(new Date(b.window.to), "HH:mm")})`}>
            {b.activityLogs.length === 0 && b.jobRuns.length === 0 && b.deliveries.length === 0 && b.clientEvents.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing else was recorded in that window.</p>
            )}
            {b.activityLogs.map((l) => (
              <p key={l.id} className="text-sm">
                <Activity className="mr-1 inline size-3 text-muted-foreground" />
                {format(new Date(l.at), "HH:mm")} · {l.actor ?? "system"} {l.action} {l.entity}: {l.summary}
                {l.from && (l.from.screen || l.from.form) ? (
                  <span className="text-muted-foreground">
                    {" "}— from {[l.from.screen ? `the ${l.from.screen} page` : null, l.from.form ?? null, l.from.action ? `after '${l.from.action}'` : null].filter(Boolean).join(", ")}
                  </span>
                ) : null}
              </p>
            ))}
            {b.jobRuns.map((j) => (
              <p key={j.id} className="text-sm">
                <Clock className="mr-1 inline size-3 text-muted-foreground" />
                Job {j.name} was {j.status} ({format(new Date(j.started_at), "HH:mm")}){j.error_reference ? `, reference ${j.error_reference}` : ""}.
              </p>
            ))}
            {b.deliveries.map((d) => (
              <p key={d.id} className="text-sm">
                {d.channel} to {d.target_masked ?? "?"}: {d.success ? "sent" : `failed (${d.error ?? "no detail"})`}
              </p>
            ))}
            {b.clientEvents.map((c) => (
              <p key={c.id} className="text-sm">
                Browser: {c.message} on {c.page_url ?? "?"}
              </p>
            ))}
          </Section>

          {isSupport && (
            <Section title="Technical details (support only)">
              <pre className="max-h-96 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(b.event, null, 2)}</pre>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* bits                                                                */
/* ------------------------------------------------------------------ */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">{children}</CardContent>
    </Card>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("Copied.");
        } catch {
          toast.error("Could not copy; select it by hand.");
        }
      }}
    >
      <Copy className="mr-1 size-3" /> {label}
    </Button>
  );
}

function friendlyPath(path: string): string {
  const seg = path.replace(/^\/api\/v2\//, "").split(/[/?]/)[0];
  return seg ? seg.replace(/[-_]/g, " ") : path;
}

function humanDuration(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} s`;
  const min = Math.round(seconds / 60);
  if (min < 90) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export function ago(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}
