/**
 * Engagement workspace — the activity area that lives on every record
 * detail page (lead / deal / school / contact).
 *
 *   ┌─ PLANNED ────────────────────────────────────────────────┐
 *   │  Next planned activity card with subject, due, owner,    │
 *   │  related context, and quick actions (complete / open).   │
 *   │  Empty state prompts the rep to schedule the next move.  │
 *   └──────────────────────────────────────────────────────────┘
 *   ┌─ DONE ──────────────────────────────────────────────────┐
 *   │  One unified filter row (Content · Type · Audit groups). │
 *   │  Feed of completed history, ordered by completed_at.    │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Composed entirely from the activity-kit primitives so every record
 * page (lead, deal, school, contact, …) and the global Activities
 * page draw from the same visual + behavioural language.
 */
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CalendarPlus, FileText, History, Loader2 } from "lucide-react";
import {
  useActivityList,
  useUpdateActivityStatus,
  type Activity,
  type ActivityType,
} from "~/api/activities";
import { useEntityActivityLogs, type ActivityLog } from "~/api/activity-logs";
import { useActivityCompletionStore } from "~/stores/use-activity-completion-store";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { CreateActivityModal } from "~/components/activities/create-activity-modal";
import { ActivityInspectorSheet } from "~/components/activities/activity-inspector-sheet";
import { FilesTab } from "~/components/deals/tabs/files-tab";
import {
  ActivityEmptyState,
  CompletedActivityFeedItem,
  FeedFilterBar,
  PlannedActivityCard,
  activityIsOpen,
  applyFeedFilter,
  type FeedFilter,
} from "~/components/activities/activity-kit";

interface EngagementWorkspaceProps {
  leadId?: string;
  dealId?: string;
  schoolId?: string;
  contactId?: string;
  scope: "lead" | "deal" | "school" | "contact";
  isReadonly?: boolean;
  /**
   * Pre-filter the Done feed on mount. Used by record-page tabs that
   * want to land users straight on a single activity type — e.g. the
   * Notes / Emails / Calls tabs on lead/deal/school pages. The filter
   * bar stays interactive; the prop just seeds its initial state.
   */
  initialFilter?: FeedFilter;
  /**
   * Hide the filter bar when the page has already constrained the
   * feed to a single type (e.g. the "Calls" tab — showing the filter
   * bar below it invites contradictory UI).
   */
  hideFilterBar?: boolean;
}

const CHANGELOG_ENTITY_BY_SCOPE: Record<EngagementWorkspaceProps["scope"], string> = {
  lead: "Lead",
  deal: "deal",
  school: "School",
  contact: "Contact",
};

export function EngagementWorkspace({
  leadId,
  dealId,
  schoolId,
  contactId,
  scope,
  isReadonly,
  initialFilter,
  hideFilterBar,
}: EngagementWorkspaceProps) {
  const [feedFilter, setFeedFilter] = useState<FeedFilter>(
    initialFilter ?? { kind: "all" },
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaultType, setCreateDefaultType] = useState<ActivityType>(
    "task",
  );
  const [inspectorActivity, setInspectorActivity] = useState<Activity | null>(
    null,
  );

  // The workspace fetches everything through the existing /activities
  // endpoint. school_id is an indirect filter — backend joins on
  // lead.school_id so the rep on a school page sees every activity
  // tied to any of the school's leads in one query.
  const queryParent = useMemo(
    () => ({
      lead_id: leadId,
      deal_id: dealId,
      contact_id: contactId,
      school_id: schoolId,
    }),
    [leadId, dealId, contactId, schoolId],
  );
  const hasParent = !!(leadId || dealId || contactId || schoolId);
  const activeEntityId = leadId ?? dealId ?? schoolId ?? contactId ?? "";
  const activePane =
    feedFilter.kind === "content" && feedFilter.value === "files"
      ? "files"
      : feedFilter.kind === "changelog"
        ? "changelog"
        : "activities";

  // Open / planned activities — small slice, ordered by due_at.
  const {
    data: openData,
    isLoading: loadingOpen,
    error: openError,
  } = useActivityList({
    ...queryParent,
    open_only: true,
    limit: 100,
    page: 1,
    include_details: true,
    enabled: hasParent,
  });

  // Closed / done activities — larger slice for the history feed.
  const {
    data: doneData,
    isLoading: loadingDone,
    error: doneError,
  } = useActivityList({
    ...queryParent,
    status: "completed",
    limit: 100,
    page: 1,
    include_details: true,
    enabled: hasParent,
  });

  const updateStatus = useUpdateActivityStatus();

  // The planned card surfaces the rep's NEXT actionable step. Notes
  // are historical records (no due state, no follow-up owed), so they
  // can never be a "planned next step" and are excluded here. Without
  // this filter, a freshly-logged note with no due date would sort to
  // the top of the open list and hijack the Planned slot — which is
  // why users reported that "my note didn't show up": it was being
  // rendered as the planned card (a slot that doesn't show note
  // content) while the Done feed below already had the same note
  // listed correctly. Now the Planned card stays null when only notes
  // are open, and notes only live in the Done/history feed.
  const plannedActivity = useMemo<Activity | null>(() => {
    // The Planned card is strictly the next UPCOMING, dated step. It must
    // NOT fall back to "newest open regardless of date": logged calls and
    // WhatsApps are saved with status "scheduled" and no due date, so the
    // old fallback promoted a random logged interaction into the Planned
    // slot AND — because the history feed only carried completed + notes —
    // left every other undated interaction with nowhere to render. Reps
    // saw a near-empty timeline (≈63% of all activity was invisible).
    // With no dated next step, Planned is simply empty (prompt to schedule)
    // and all logged interactions live in the Activity log below.
    const dated = (openData?.data ?? [])
      .filter((a) => a.type !== "note" && (a.due_at || a.scheduled_at))
      .sort((a, b) => {
        const ad = new Date(a.due_at ?? a.scheduled_at!).getTime();
        const bd = new Date(b.due_at ?? b.scheduled_at!).getTime();
        return ad - bd;
      });
    return dated[0] ?? null;
  }, [openData]);

  // The historical feed is every logged interaction EXCEPT the single
  // upcoming Planned card: completed activities plus all open items
  // (calls / WhatsApps / emails / notes logged as "scheduled" with no due
  // date). Restricting it to completed + notes was the regression that
  // hid the bulk of every rep's history. De-duped by id since a record
  // can only appear in one of the two source queries.
  const feedActivities = useMemo<Activity[]>(() => {
    const done = doneData?.data ?? [];
    const plannedId = plannedActivity?.id;
    const openLogged = (openData?.data ?? []).filter(
      (a) => a.id !== plannedId,
    );
    const byId = new Map<string, Activity>();
    for (const a of [...done, ...openLogged]) byId.set(a.id, a);
    const combined = [...byId.values()];
    return applyFeedFilter(combined, feedFilter).sort((a, b) => {
      const at = new Date(
        a.completed_at ?? a.scheduled_at ?? a.created_at,
      ).getTime();
      const bt = new Date(
        b.completed_at ?? b.scheduled_at ?? b.created_at,
      ).getTime();
      return bt - at;
    });
  }, [doneData, openData, plannedActivity, feedFilter]);

  const requestCompletion = useActivityCompletionStore((s) => s.request);

  async function toggleComplete(a: Activity) {
    // Mark-done flow: route through the outcome-capture dialog. The
    // dialog calls the real status mutation once the user picks an
    // outcome, so the request is fire-and-forget from here.
    if (activityIsOpen(a)) {
      requestCompletion({ activity: a });
      return;
    }
    // Reopen flow: no outcome needed — go straight to the mutation.
    await updateStatus.mutateAsync({ id: a.id, status: "scheduled" });
  }

  function openInspector(a: Activity) {
    setInspectorActivity(a);
  }

  return (
    <div className="space-y-4">
      {/* PLANNED section — the header uses a 3-column grid so the
          section label (Planned pill + "Next step" title) sits in
          the centre column while the Schedule-next action anchors
          the right column. Previously the label flex-aligned to the
          left and only read as "centred" by coincidence on narrow
          panes. */}
      <section aria-labelledby="planned-header">
        <div className="mb-2 grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <span className="hidden sm:block" aria-hidden />
          <div className="flex items-center justify-center gap-2">
            <Badge
              variant="secondary"
              className="rounded-full border bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
            >
              Planned
            </Badge>
            <h3 id="planned-header" className="text-sm font-semibold">
              Next step
            </h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isReadonly}
            onClick={() => {
              setCreateDefaultType("task");
              setCreateOpen(true);
            }}
            className="justify-self-stretch sm:justify-self-end"
          >
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
            Schedule next
          </Button>
        </div>

        {loadingOpen ? (
          <div className="flex items-center justify-center rounded-md border bg-background py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : openError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Next step could not be loaded</p>
              <p className="text-xs text-muted-foreground">
                Refresh this record after the API is reachable.
              </p>
            </div>
          </div>
        ) : plannedActivity ? (
          <PlannedActivityCard
            activity={plannedActivity}
            onComplete={toggleComplete}
            onOpen={openInspector}
            disabled={isReadonly}
          />
        ) : (
          <ActivityEmptyState
            scope={scope}
            disabled={isReadonly}
            onSchedule={(type) => {
              setCreateDefaultType(type);
              setCreateOpen(true);
            }}
          />
        )}
      </section>

      {/* Activity log section header — relabelled from "Done /
          Completed history" because notes appear here too (they're
          logged, not completed) and users reported assuming their
          freshly-logged note "didn't save" because they expected it
          in a section called Done. "Activity log" covers both
          completed-and-filed actions and logged notes. */}
      <div className="grid grid-cols-1 items-center gap-2 pt-2 sm:grid-cols-[1fr_auto_1fr]">
        <span className="hidden sm:block" aria-hidden />
        <div className="flex items-center justify-center gap-2">
          <Badge
            variant="secondary"
            className="rounded-full border bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
          >
            Log
          </Badge>
          <h3 className="text-sm font-semibold">Activity log</h3>
          <span className="text-xs text-muted-foreground">
            {activePane === "files"
              ? "Files"
              : activePane === "changelog"
                ? "Change history"
                : `${feedActivities.length} item${feedActivities.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <span className="hidden sm:block" aria-hidden />
      </div>

      {/* Single unified filter row — suppressed when the host page
          has already locked the feed to a specific type (e.g. Calls
          tab); in that case the type tab IS the filter. */}
      {!hideFilterBar && (
        <FeedFilterBar value={feedFilter} onChange={setFeedFilter} />
      )}

      {activePane === "files" ? (
        activeEntityId ? (
          <FilesTab
            entity={scope}
            entityId={activeEntityId}
            isReadonly={isReadonly}
          />
        ) : (
          <div className="rounded-md border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
            Files will appear once this record has been saved.
          </div>
        )
      ) : activePane === "changelog" ? (
        <ChangelogPanel scope={scope} entityId={activeEntityId} />
      ) : (
        <div className="rounded-md border bg-background">
          {loadingDone ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
          ) : doneError ? (
          <div className="flex items-start gap-2 px-4 py-6 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Activity log could not be loaded</p>
              <p className="text-xs text-muted-foreground">
                Completed activities and notes will appear here once the
                request succeeds.
              </p>
            </div>
          </div>
          ) : feedActivities.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No activity logged yet for this {scope}. Notes and completed
            calls, meetings, or follow-ups will show up here.
          </div>
          ) : (
          <ul className="divide-y">
            {feedActivities.map((activity) => (
              <CompletedActivityFeedItem
                key={activity.id}
                activity={activity}
                onOpen={openInspector}
                onReopen={
                  activity.status === "completed"
                    ? () => toggleComplete(activity)
                    : undefined
                }
              />
            ))}
          </ul>
          )}
        </div>
      )}

      <CreateActivityModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        leadId={leadId}
        dealId={dealId}
        defaultType={createDefaultType}
      />

      <ActivityInspectorSheet
        activity={inspectorActivity}
        open={!!inspectorActivity}
        isReadonly={isReadonly}
        onOpenChange={(open) => {
          if (!open) setInspectorActivity(null);
        }}
      />
    </div>
  );
}

function ChangelogPanel({
  scope,
  entityId,
}: {
  scope: EngagementWorkspaceProps["scope"];
  entityId: string;
}) {
  const entity = CHANGELOG_ENTITY_BY_SCOPE[scope];
  const { data, isLoading, error } = useEntityActivityLogs(entity, entityId);
  const logs = data?.data ?? [];

  if (!entityId) {
    return (
      <div className="rounded-md border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
        Changelog entries will appear once this record has been saved.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background">
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 px-4 py-6 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Changelog could not be loaded</p>
            <p className="text-xs text-muted-foreground">
              Refresh this record after the API is reachable.
            </p>
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          <History className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p>No changelog entries yet</p>
          <p className="text-xs">Updates, stage moves, uploads, and approvals will appear here.</p>
        </div>
      ) : (
        <ul className="divide-y">
          {logs.map((log) => (
            <ChangelogItem key={log.id} log={log} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChangelogItem({ log }: { log: ActivityLog }) {
  const user = log.user ?? log.actioned_by_user;
  const actor = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
      user.email
    : "System";

  return (
    <li className="flex gap-3 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {log.action === "create" ? (
          <FileText className="h-4 w-4" />
        ) : (
          <History className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize">
            {log.action.replace(/_/g, " ")}
          </Badge>
          <span className="text-xs text-muted-foreground">{actor}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(log.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>
        <p className="text-sm font-medium">
          {log.summary || `${log.entity} ${log.action}`}
        </p>
        {log.new_values && Object.keys(log.new_values).length > 0 && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {Object.keys(log.new_values)
              .slice(0, 5)
              .map((key) => key.replace(/_/g, " "))
              .join(", ")}
          </p>
        )}
      </div>
    </li>
  );
}
