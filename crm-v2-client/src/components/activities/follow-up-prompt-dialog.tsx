import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { Sparkles, AlertTriangle, CalendarCheck } from "lucide-react";
import { useFollowUpPromptStore } from "~/stores/use-follow-up-prompt-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import {
  isActionableActivityType,
  type Activity,
  type ActivityType,
  useActivityList,
  useCreateActivity,
} from "~/api/activities";
import { useAnyRole } from "~/hooks/use-permission";
import { getActivityChip, getActivityLabel } from "~/lib/activity-visuals";
import { toast } from "sonner";

/**
 * Mounted once at the app root. Listens to the follow-up prompt queue
 * and enforces the CRM discipline rule: once an activity is marked
 * done on an active record, the user MUST log the next step before
 * they can do anything else.
 *
 * Two tiers of behaviour:
 *
 *   - `entry.required === true` (active lead/deal, non-note type):
 *     dialog is MODAL in the strict sense. Skip / skip-all buttons
 *     are hidden, onOpenChange close attempts are ignored, Esc and
 *     outside-click are intercepted by Radix, and a route-change
 *     `useBlocker` prevents navigation until a follow-up is logged.
 *
 *   - `entry.required === false` (terminal record, note, or
 *     bulk-done where the rule doesn't apply): legacy low-friction
 *     behaviour — Skip and Skip-all are back, dismissable freely.
 *
 * Required-ness is decided at enqueue time by `shouldRequireFollowUp`
 * in `~/lib/follow-up-policy`.
 */
// Product rule: Notes are CONTEXT, not FOLLOW-UP DISCIPLINE. A note is
// not an actionable commitment to do something in the future — it's a
// record of what was observed. Letting a rep pick "Note" as the required
// next step on an active lead/deal would be a discipline loophole (drop
// a note, satisfy the prompt, keep the record alive with no real next
// action). So the picker only offers ACTIONABLE types. Notes can still
// be logged separately via the Log Activity button any time.
const FOLLOW_UP_TYPES: Array<{ value: ActivityType; label: string }> = [
  { value: "task", label: "Task" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "whatsapp", label: "WhatsApp" },
];

function suggestFollowUpType(sourceType: ActivityType): ActivityType {
  switch (sourceType) {
    case "meeting":
      return "email";
    case "call":
      return "task";
    case "task":
      return "task";
    default:
      return "task";
  }
}

/**
 * Strip any accumulated follow-up prefix from a prior round so we
 * don't end up with "Next step after: Next step after: Follow-up:
 * Follow-up: Meeting about proposal". When a rep completes a task
 * that was itself scheduled by this dialog, its subject already
 * carries a prefix; we want the fresh prompt to re-prefix a CLEAN
 * subject, not pile a second prefix on top.
 */
const FOLLOW_UP_PREFIX_RE =
  /^(?:Follow-up:\s*|Next step after(?:\s+call)?:\s*)+/i;

function stripFollowUpPrefix(subject: string): string {
  return subject.replace(FOLLOW_UP_PREFIX_RE, "").trim();
}

function defaultSubject(sourceSubject: string, sourceType: ActivityType) {
  const clean = stripFollowUpPrefix(sourceSubject);
  switch (sourceType) {
    case "meeting":
      return `Follow-up: ${clean}`;
    case "call":
      return `Next step after call: ${clean}`;
    case "task":
      return `Next step after: ${clean}`;
    default:
      return `Follow-up: ${clean}`;
  }
}

export function FollowUpPromptDialog() {
  const queue = useFollowUpPromptStore((state) => state.queue);
  const dequeue = useFollowUpPromptStore((state) => state.dequeue);
  const clearOptional = useFollowUpPromptStore(
    (state) => state.clearOptional,
  );
  const hasRequired = useFollowUpPromptStore((state) => state.hasRequired);
  const createActivity = useCreateActivity();

  const head = queue[0] ?? null;
  const hasMore = queue.length > 1;
  const enqueuedRequired = head?.required ?? false;

  const sourceActivity = head?.activity ?? null;

  // ---- Gate relaxation (LCK1 / C9) -----------------------------
  //
  // `entry.required` is decided at enqueue time, where the caller
  // only knows the completed activity itself. It cannot see the two
  // escape hatches the SERVER honours in
  // `assertNextStepCompliance`: the manager/admin bypass, and an
  // already-open actionable activity on the same lead/deal. Resolve
  // both here, then downgrade the prompt from "trap" to "nudge"
  // when either applies.
  //
  // Note this dialog only ever opens AFTER a completion the server
  // already accepted — so when a next step already exists, the hard
  // lock was enforcing a rule that had, by definition, been
  // satisfied. That is exactly the case where a rep with a meeting
  // booked two weeks out could not log the call they made in the
  // meantime.
  const isManagerOrAdmin = useAnyRole(["admin", "sales_manager"]);

  const parentLeadId = sourceActivity?.lead_id ?? undefined;
  // The server ORs lead/deal; querying the lead when present covers
  // the deal too, since deal activities carry the originating lead.
  const parentDealId = parentLeadId
    ? undefined
    : (sourceActivity?.deal_id ?? undefined);
  const hasParentRecord = Boolean(parentLeadId || parentDealId);

  const { data: openSiblings, isLoading: siblingsLoading } = useActivityList({
    lead_id: parentLeadId,
    deal_id: parentDealId,
    open_only: true,
    page: 1,
    limit: 25,
    enabled: enqueuedRequired && hasParentRecord && !isManagerOrAdmin,
  });

  /**
   * The soonest open actionable commitment already standing on this
   * record, excluding the activity that was just completed.
   */
  const existingNextStep = useMemo<Activity | null>(() => {
    if (!sourceActivity) return null;
    const rows = openSiblings?.data ?? [];
    const candidates = rows.filter(
      (a) =>
        a.id !== sourceActivity.id &&
        isActionableActivityType(a.type) &&
        a.status !== "completed" &&
        a.status !== "cancelled",
    );
    candidates.sort((a, b) => {
      // Dated commitments first (soonest wins); undated trail behind
      // but still count — an open task with no date is still work.
      const at = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const bt = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return at - bt;
    });
    return candidates[0] ?? null;
  }, [openSiblings, sourceActivity]);

  // While the lookup is in flight we stay permissive rather than
  // flashing an undismissable modal we may be about to relax.
  const isRequired =
    enqueuedRequired &&
    !isManagerOrAdmin &&
    !siblingsLoading &&
    !existingNextStep;

  // Route-change guard — two layers:
  //
  //   1. While the dialog is open, Radix `Dialog` is modal by
  //      default: it renders a full-viewport overlay and traps
  //      focus, so in-app clicks on the sidebar/breadcrumb/tabs
  //      can't land. That alone prevents every normal intra-SPA
  //      navigation while a required prompt is up.
  //
  //   2. `beforeunload` catches the remaining exits — browser
  //      refresh, tab-close, hard address-bar change. The
  //      confirm-leave dialog fires any time the queue carries a
  //      required entry.
  //
  // We deliberately do NOT use react-router's `useBlocker` because
  // this app still mounts the legacy `<BrowserRouter>` (not the
  // data router) — calling `useBlocker` there throws at render
  // time and blanks the whole app shell.
  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      if (!hasRequired()) return;
      event.preventDefault();
      // Legacy browsers required returnValue to trigger the dialog.
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasRequired]);

  const [type, setType] = useState<ActivityType>("task");
  const [subject, setSubject] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!sourceActivity) return;
    const suggested = suggestFollowUpType(sourceActivity.type);
    setType(suggested);
    setSubject(defaultSubject(sourceActivity.subject, sourceActivity.type));
    setDueAt(format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm"));
    setDescription("");
  }, [sourceActivity]);

  const open = Boolean(sourceActivity);

  const contextLine = useMemo(() => {
    if (!sourceActivity) return "";
    const parts: string[] = [];
    if (sourceActivity.lead?.lead_name) {
      parts.push(`Lead: ${sourceActivity.lead.lead_name}`);
    }
    const dealName =
      sourceActivity.deal?.deal_name ?? sourceActivity.deal?.title;
    if (dealName) parts.push(`Deal: ${dealName}`);
    return parts.join("  •  ");
  }, [sourceActivity]);

  if (!sourceActivity) return null;

  const onSkip = () => {
    // Skip is never allowed for required entries — the button is
    // hidden in that branch, but we also guard here in case some
    // other caller tries to dismiss programmatically.
    if (isRequired) return;
    dequeue();
  };

  const onSkipAll = () => {
    if (isRequired) return;
    // Drop only the non-required items so any required prompt stays
    // on screen.
    clearOptional();
  };

  const onCreate = async () => {
    if (!subject.trim()) {
      toast.error("A subject is required");
      return;
    }
    try {
      await createActivity.mutateAsync({
        type,
        subject: subject.trim(),
        description: description.trim() || undefined,
        due_at: dueAt || undefined,
        lead_id: sourceActivity.lead_id ?? undefined,
        deal_id: sourceActivity.deal_id ?? undefined,
        contact_id: sourceActivity.contact_id ?? undefined,
        assigned_to_id: sourceActivity.assigned_to_id ?? undefined,
        ...(type === "task"
          ? { task: { status: "todo", priority: "medium" } }
          : {}),
        ...(type === "meeting"
          ? {
              meeting: {
                title: subject.trim(),
                platform: "other",
                start_time: dueAt || new Date().toISOString(),
              },
            }
          : {}),
        ...(type === "call"
          ? { call: { phone_number: "" } }
          : {}),
      });
      toast.success("Follow-up scheduled");
      dequeue();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create follow-up";
      toast.error(message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) return;
        // Required prompts cannot be dismissed by clicking outside,
        // pressing Esc, or the built-in close affordance. The only
        // way out is "Schedule follow-up".
        if (isRequired) {
          toast.warning(
            "Log the next step first — this record needs a follow-up.",
          );
          return;
        }
        dequeue();
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        // Block the two Radix-native close affordances for required
        // prompts. Without these, Esc and outside-pointer-down would
        // still trigger onOpenChange(false) on Radix.
        onEscapeKeyDown={(event) => {
          if (isRequired) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isRequired) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isRequired) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isRequired ? (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            ) : (
              <Sparkles className="h-5 w-5 text-amber-500" />
            )}
            {isRequired ? "Next step required" : "What's the next step?"}
          </DialogTitle>
          <DialogDescription>
            {isRequired ? (
              <>
                Every active record must have a next action. You just
                completed a{" "}
                <Badge
                  variant="outline"
                  className={getActivityChip(sourceActivity.type)}
                >
                  {getActivityLabel(sourceActivity.type)}
                </Badge>
                : <span className="font-medium">{sourceActivity.subject}</span>
                {contextLine && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {contextLine}
                  </span>
                )}
                <span className="mt-2 block text-xs font-medium text-amber-700 dark:text-amber-400">
                  Log the next step to continue. This record cannot be
                  left without one.
                </span>
              </>
            ) : (
              <>
                Capture the follow-up while it's fresh. You just completed a{" "}
                <Badge
                  variant="outline"
                  className={getActivityChip(sourceActivity.type)}
                >
                  {getActivityLabel(sourceActivity.type)}
                </Badge>
                : <span className="font-medium">{sourceActivity.subject}</span>
                {contextLine && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {contextLine}
                  </span>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* The record already carries a commitment — say so plainly
            and offer the one-click exit, so the rep can go straight
            back to logging the interim work they actually did. */}
        {existingNextStep && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
            <div className="flex items-start gap-2">
              <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-0.5">
                <p className="font-medium text-emerald-900 dark:text-emerald-200">
                  This record already has a next step
                </p>
                <p className="text-emerald-800 dark:text-emerald-300">
                  {getActivityLabel(existingNextStep.type)}:{" "}
                  <span className="font-medium">
                    {existingNextStep.subject}
                  </span>
                  {existingNextStep.due_at && (
                    <> — due {format(new Date(existingNextStep.due_at), "d MMM yyyy")}</>
                  )}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Keep it and carry on, or add another below.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="follow-up-type">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as ActivityType)}
              >
                <SelectTrigger id="follow-up-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOW_UP_TYPES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="follow-up-due">Due</Label>
              <Input
                id="follow-up-due"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="follow-up-subject">Subject</Label>
            <Input
              id="follow-up-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What needs to happen next?"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="follow-up-desc">Notes (optional)</Label>
            <Textarea
              id="follow-up-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context from the meeting, action items, etc."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {/* Skip controls are ONLY rendered for optional prompts.
              Required prompts force the user through the Schedule
              follow-up path. */}
          {!isRequired ? (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onSkip}>
                {existingNextStep ? "Keep existing next step" : "Skip"}
              </Button>
              {hasMore && (
                <Button variant="ghost" onClick={onSkipAll}>
                  Skip all ({queue.filter((e) => !e.required).length})
                </Button>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              Required for active records
            </span>
          )}
          <Button
            onClick={onCreate}
            disabled={createActivity.isPending}
            variant={existingNextStep ? "outline" : "default"}
          >
            {createActivity.isPending
              ? "Creating…"
              : existingNextStep
                ? "Add another step"
                : "Schedule follow-up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
