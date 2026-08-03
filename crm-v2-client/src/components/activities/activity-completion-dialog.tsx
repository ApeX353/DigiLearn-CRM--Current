import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { addDays, format } from "date-fns";
import { useActivityCompletionStore } from "~/stores/use-activity-completion-store";
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
  ACTIVITY_OUTCOMES,
  ACTIVITY_OUTCOME_LABELS,
  isActionableActivityType,
  type ActivityOutcome,
  type ActivityType,
  useActivityList,
  useUpdateActivityStatus,
} from "~/api/activities";
import { useAnyRole } from "~/hooks/use-permission";
import { shouldRequireFollowUp } from "~/lib/follow-up-policy";
import { getActivityChip, getActivityLabel } from "~/lib/activity-visuals";
import { toast } from "sonner";

// NEXT2: same actionable follow-up options the post-completion prompt offers.
const NEXT_STEP_TYPES: Array<{ value: ActivityType; label: string }> = [
  { value: "task", label: "Task" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "whatsapp", label: "WhatsApp" },
];

function suggestNextStepType(sourceType: ActivityType): ActivityType {
  switch (sourceType) {
    case "meeting":
      return "email";
    case "call":
      return "task";
    default:
      return "task";
  }
}

/**
 * Mounted once at the app root. Reads from the activity-completion
 * queue (populated via `useActivityCompletionStore.request(...)`)
 * and forces the user to capture an outcome before the activity is
 * actually persisted as done.
 *
 * Enforcement:
 *
 *   - The dialog CANNOT be dismissed without recording an outcome:
 *     Esc, outside-click, the close affordance, and the onOpenChange
 *     handler all refuse to close the dialog when it's open.
 *   - "Save" requires a selected outcome; button is disabled until
 *     the user picks one.
 *   - Only "Cancel" unwinds — the callsite's `onCancelled` callback
 *     fires and the activity stays open.
 *
 * Server enforces the same rule independently (`UpdateStatusDto`
 * + service `BadRequestException`), so even a malicious client that
 * bypassed this dialog can't land a completion without outcome.
 */
const DEFAULT_OUTCOME: ActivityOutcome = "successful";

export function ActivityCompletionDialog() {
  const queue = useActivityCompletionStore((s) => s.queue);
  const dequeue = useActivityCompletionStore((s) => s.dequeue);
  const updateStatus = useUpdateActivityStatus();

  const head = queue[0] ?? null;
  const sourceActivity = head?.activity ?? null;

  const [outcome, setOutcome] = useState<ActivityOutcome>(DEFAULT_OUTCOME);
  const [note, setNote] = useState("");

  // NEXT2 — capture the next step BEFORE completing so it rides along in the
  // same request. The server runs the next-step-compliance gate before it
  // persists, so a next step collected AFTER the completion call (the old
  // post-completion prompt) arrived too late and the completion 400'd.
  const [nextType, setNextType] = useState<ActivityType>("task");
  const [nextSubject, setNextSubject] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [nextDesc, setNextDesc] = useState("");

  // Mirror the server gate's escape hatches (assertNextStepCompliance):
  // manager/admin bypass, and an already-open actionable step on the record.
  const isManagerOrAdmin = useAnyRole(["admin", "sales_manager"]);
  const parentLeadId = sourceActivity?.lead_id ?? undefined;
  // Server ORs lead/deal; querying the lead when present covers the deal too.
  const parentDealId = parentLeadId
    ? undefined
    : (sourceActivity?.deal_id ?? undefined);
  const hasParentRecord = Boolean(parentLeadId || parentDealId);

  const { data: openSiblings } = useActivityList({
    lead_id: parentLeadId,
    deal_id: parentDealId,
    open_only: true,
    page: 1,
    limit: 25,
    enabled: Boolean(sourceActivity) && hasParentRecord && !isManagerOrAdmin,
  });

  const hasOpenNextStep = useMemo(() => {
    if (!sourceActivity) return false;
    return (openSiblings?.data ?? []).some(
      (a) =>
        a.id !== sourceActivity.id &&
        isActionableActivityType(a.type) &&
        a.status !== "completed" &&
        a.status !== "cancelled",
    );
  }, [openSiblings, sourceActivity]);

  useEffect(() => {
    if (!sourceActivity) return;
    setOutcome(DEFAULT_OUTCOME);
    setNote("");
    setNextType(suggestNextStepType(sourceActivity.type));
    setNextSubject(`Follow-up: ${sourceActivity.subject}`);
    setNextDue(format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm"));
    setNextDesc("");
  }, [sourceActivity]);

  // Does the next-step section apply at all? (actionable type, live parent
  // record, non-terminal, non-manager, outcome isn't a relationship-close).
  const nextStepApplicable = sourceActivity
    ? shouldRequireFollowUp(
        { ...sourceActivity, completion_outcome: outcome },
        { isManagerOrAdmin, hasOpenNextStep: false },
      )
    : false;

  // Required unless the record already carries an open next step. While the
  // sibling lookup is in flight `hasOpenNextStep` is false, so we err toward
  // requiring it — that's the safe direction (a missing next step is what
  // 400s the completion).
  const nextStepRequired = nextStepApplicable && !hasOpenNextStep;

  if (!sourceActivity || !head) return null;

  const onCancel = () => {
    head.onCancelled?.();
    dequeue();
  };

  const onSubmit = async () => {
    if (!outcome) {
      toast.error("Pick an outcome before saving.");
      return;
    }

    const trimmedNextSubject = nextSubject.trim();
    let nextStep:
      | { type: ActivityType; subject: string; due_at: string; description?: string }
      | undefined;
    if (nextStepApplicable && trimmedNextSubject && nextDue) {
      nextStep = {
        type: nextType,
        subject: trimmedNextSubject,
        due_at: new Date(nextDue).toISOString(),
        description: nextDesc.trim() || undefined,
      };
    }

    if (nextStepRequired && !nextStep) {
      toast.error(
        "Add the next step (subject and due date) before marking this done.",
      );
      return;
    }

    try {
      const updated = await updateStatus.mutateAsync({
        id: sourceActivity.id,
        status: "completed",
        outcome,
        completionNote: note.trim() || undefined,
        nextStep,
      });
      head.onCompleted?.(updated);
      toast.success(
        nextStep ? "Activity marked done · next step scheduled" : "Activity marked done",
      );
      dequeue();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not mark activity done";
      toast.error(message);
    }
  };

  const recordContext = (() => {
    const parts: string[] = [];
    if (sourceActivity.lead?.lead_name) {
      parts.push(`Lead: ${sourceActivity.lead.lead_name}`);
    }
    const dealName =
      sourceActivity.deal?.deal_name ?? sourceActivity.deal?.title;
    if (dealName) parts.push(`Deal: ${dealName}`);
    return parts.join("  •  ");
  })();

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        // Never let Radix auto-close this dialog. The only exits are
        // the explicit Cancel / Save buttons below so the outcome
        // rule can't be bypassed.
        if (!nextOpen) {
          // no-op
        }
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Record the outcome
          </DialogTitle>
          <DialogDescription>
            Marking a{" "}
            <Badge
              variant="outline"
              className={getActivityChip(sourceActivity.type)}
            >
              {getActivityLabel(sourceActivity.type)}
            </Badge>{" "}
            as done:{" "}
            <span className="font-medium">{sourceActivity.subject}</span>
            {recordContext && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {recordContext}
              </span>
            )}
            <span className="mt-2 block text-xs font-medium text-amber-700 dark:text-amber-400">
              An outcome is required for every completed activity — it
              becomes part of the record's audit trail.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="completion-outcome">Outcome</Label>
            <Select
              value={outcome}
              onValueChange={(v) => setOutcome(v as ActivityOutcome)}
            >
              <SelectTrigger id="completion-outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_OUTCOMES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ACTIVITY_OUTCOME_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="completion-note">Notes (optional)</Label>
            <Textarea
              id="completion-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything worth noting about how this went."
              rows={3}
            />
          </div>

          {/* NEXT2 — collect the next step in the SAME step as completing, so
              the single update-status call carries it and the server gate
              passes. Only shown when the record needs one (actionable work on
              a live lead/deal, not a manager, outcome isn't a relationship
              close). Optional-but-prefilled when the record already has an
              open next step. */}
          {nextStepApplicable && (
            <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {nextStepRequired
                  ? "This record needs a next step — add it now so it's scheduled together with this completion."
                  : "Add a next step (optional — this record already has one open)."}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="next-step-type">Next step</Label>
                  <Select
                    value={nextType}
                    onValueChange={(v) => setNextType(v as ActivityType)}
                  >
                    <SelectTrigger id="next-step-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NEXT_STEP_TYPES.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="next-step-due">Due</Label>
                  <Input
                    id="next-step-due"
                    type="datetime-local"
                    value={nextDue}
                    onChange={(e) => setNextDue(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="next-step-subject">Subject</Label>
                <Input
                  id="next-step-subject"
                  value={nextSubject}
                  onChange={(e) => setNextSubject(e.target.value)}
                  placeholder="What needs to happen next?"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              !outcome ||
              updateStatus.isPending ||
              (nextStepRequired && (!nextSubject.trim() || !nextDue))
            }
          >
            {updateStatus.isPending ? "Saving…" : "Mark done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
