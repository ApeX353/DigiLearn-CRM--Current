import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  CheckSquare,
  Mail,
  MessageSquare,
  Phone,
  Users,
} from "lucide-react";
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
import { RichTextEditor } from "~/components/ui/rich-text-editor";
import { isRichTextEmpty, richTextToPlain } from "~/lib/rich-text";
import {
  ACTIVITY_OUTCOMES,
  ACTIVITY_OUTCOME_LABELS,
  type Activity,
  type ActivityOutcome,
  type ActivityType,
  useCreateActivity,
  useUpdateActivityStatus,
} from "~/api/activities";
import type { NextStepPayload } from "~/api/activities/use-activities";
import { useUpdateLead } from "~/api/leads/use-leads";
import { NURTURE_REASONS } from "~/api/leads/lead-action-constants";
import { useCloseDeal } from "~/api/deals/use-deals";
import { shouldRequireFollowUp } from "~/lib/follow-up-policy";
import { getActivityChip, getActivityLabel } from "~/lib/activity-visuals";
import { handleApiError } from "~/api/axios";
import { toast } from "sonner";

/**
 * Close-the-loop dialog — the single gate every "mark done" passes through.
 *
 * Replaces the old stacked pair (outcome dialog, then follow-up dialog)
 * with one two-step flow:
 *
 *   Step 1 — what happened. Outcome (no pre-selected default — a default
 *   turns a mandatory field into a rubber stamp) and a mandatory note.
 *   Both are rendered read-only in the activity log afterwards.
 *
 *   Step 2 — what happens next. Either schedule the next step (sent to
 *   the server IN THE SAME REQUEST as the completion, so a dead browser
 *   can't leave a completed activity with no follow-up), or declare there
 *   is no next step — which forces a record decision: a lead is nurtured
 *   (with a re-engage date that auto-schedules the re-engagement task) or
 *   disqualified (with a reason); a deal is marked won or lost (with a
 *   reason). An ACTIVE record with nothing planned is not a state this
 *   dialog can produce.
 *
 * Nothing is saved until the final button: cancelling at any point leaves
 * the activity open rather than half-completed. The exception is entries
 * queued at stage "next-step" (bulk remainders, generic PATCHes that
 * already completed the activity) — there the outcome is already stored,
 * only the follow-up decision is missing, so the dialog opens at step 2
 * and cannot be dismissed until the record has a future.
 */

/** Follow-up types a rep can schedule from step 2. Notes are excluded on
 * purpose — a note is context, not a commitment, and letting it satisfy
 * the next-step rule would be a discipline loophole. */
const NEXT_STEP_TYPES: Array<{
  value: ActivityType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "call", label: "Call", icon: Phone },
  { value: "meeting", label: "Meeting", icon: Users },
  { value: "task", label: "Task", icon: CheckSquare },
  { value: "email", label: "Email", icon: Mail },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
];

/**
 * Mirror of the server's DISQUALIFY_REASONS enum (leads/constants).
 * Admin-kind reasons first — those apply directly; tactical ones are
 * gated server-side behind manager approval, and the 400 that comes
 * back explains the escalation path.
 */
const DISQUALIFY_REASONS = [
  "Duplicate entry",
  "Wrong contact/school",
  "School closed",
  "Already has solution",
  "No budget",
  "Not interested",
  "Cannot reach contact",
  "Other",
] as const;

function defaultDueIso(days: number): string {
  const d = addDays(new Date(), days);
  d.setHours(9, 0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function ActivityCompletionDialog() {
  const queue = useActivityCompletionStore((s) => s.queue);
  const dequeue = useActivityCompletionStore((s) => s.dequeue);
  const updateStatus = useUpdateActivityStatus();
  const createActivity = useCreateActivity();
  const updateLead = useUpdateLead();
  const closeDeal = useCloseDeal();

  const head = queue[0] ?? null;
  const activity = head?.activity ?? null;
  const startStage = head?.stage ?? "outcome";
  /** stage "next-step" = already completed; only step 2 applies. */
  const alreadyCompleted = startStage === "next-step";

  // ---------- step 1 state ----------
  const [outcome, setOutcome] = useState<ActivityOutcome | "">("");
  const [note, setNote] = useState("");
  // ---------- step navigation ----------
  const [step, setStep] = useState<1 | 2>(1);
  // ---------- step 2 state ----------
  const [mode, setMode] = useState<"schedule" | "none">("schedule");
  const [nsType, setNsType] = useState<ActivityType>("task");
  const [nsSubject, setNsSubject] = useState("");
  const [nsDue, setNsDue] = useState(defaultDueIso(1));
  const [nsDescription, setNsDescription] = useState("");
  const [leadPath, setLeadPath] = useState<"nurture" | "disqualify">(
    "nurture",
  );
  const [nurtureReason, setNurtureReason] = useState<string>("");
  const [nurtureDate, setNurtureDate] = useState(
    format(addDays(new Date(), 45), "yyyy-MM-dd"),
  );
  const [disqualifyReason, setDisqualifyReason] = useState<string>("");
  /** Free text behind the "Other" choice — the server stores it as the
   * lead's reason, so without it "Other" would be recorded as nothing. */
  const [otherReason, setOtherReason] = useState("");
  const [dealPath, setDealPath] = useState<"lost" | "won">("lost");
  const [lostReason, setLostReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activity) return;
    setOutcome("");
    setNote("");
    setStep(alreadyCompleted ? 2 : 1);
    setMode("schedule");
    setNsType("task");
    setNsSubject("");
    setNsDue(defaultDueIso(1));
    setNsDescription("");
    setLeadPath("nurture");
    setNurtureReason("");
    setNurtureDate(format(addDays(new Date(), 45), "yyyy-MM-dd"));
    setDisqualifyReason("");
    setOtherReason("");
    setDealPath("lost");
    setLostReason("");
    setSaving(false);
  }, [activity, alreadyCompleted]);

  // A stage-"next-step" entry means an already-completed activity whose
  // record has nothing scheduled. Refreshing the page would silently
  // drop that obligation, so warn — mirror of the old follow-up lock.
  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      if (
        useActivityCompletionStore
          .getState()
          .queue.some((r) => r.stage === "next-step")
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const recordContext = useMemo(() => {
    if (!activity) return "";
    const parts: string[] = [];
    if (activity.lead?.lead_name) parts.push(`Lead: ${activity.lead.lead_name}`);
    const dealName = activity.deal?.deal_name ?? activity.deal?.title;
    if (dealName) parts.push(`Deal: ${dealName}`);
    return parts.join("  •  ");
  }, [activity]);

  if (!activity || !head) return null;

  // What kind of record does the "no next step" branch decide about?
  // Deal wins over lead: if the activity sits on a deal, the deal is the
  // live record (its lead is already Converted).
  const decisionKind: "deal" | "lead" | "none" = activity.deal_id
    ? "deal"
    : activity.lead_id
      ? "lead"
      : "none";
  // A lead already parked in Nurture isn't "moved" there again — completing
  // its re-engagement touch with no next step just sets the NEXT wake-up.
  const alreadyNurture = activity.lead?.status === "Nurture";

  /**
   * Whether this completion needs a step 2 at all. Uses the same policy
   * as every other surface, with the outcome the rep just picked patched
   * in — a relationship-terminal outcome ("information shared", …)
   * legitimately closes the interaction without future work.
   */
  const followUpNeeded = shouldRequireFollowUp({
    ...activity,
    completion_outcome: (outcome || undefined) as Activity["completion_outcome"],
  });

  /**
   * When step 2 is skipped, say WHY. A rep on a disqualified lead sees
   * "Step 1 of 1" where yesterday they saw two steps — without this line
   * that reads as the dialog being broken, not as the record being closed.
   */
  const noFollowUpReason = followUpNeeded
    ? null
    : activity.type === "note"
      ? "Notes are context, not work — no next step needed."
      : activity.lead?.status === "Disqualified" ||
          activity.lead?.status === "Converted"
        ? `This lead is ${activity.lead?.status} — work is still logged, but a closed record needs no next step.`
        : activity.deal?.closeStatus === "won" ||
            activity.deal?.closeStatus === "lost"
          ? `This deal is ${activity.deal?.closeStatus} — work is still logged, but a closed record needs no next step.`
          : outcome
            ? "This outcome closes the interaction — nothing further is owed, so there is no next step to schedule."
            : "This activity isn't linked to an active record, so no next step is required.";

  const step1Valid = Boolean(outcome) && !isRichTextEmpty(note);
  const scheduleValid =
    nsSubject.trim().length > 0 && Boolean(nsDue);
  // "Other" is only a real reason once it says something.
  const reasonComplete = (reason: string) =>
    Boolean(reason) && (reason !== "Other" || otherReason.trim().length > 0);
  // The min= attribute constrains the picker, not typed input — an ISO
  // string comparison keeps a hand-typed past date from creating a
  // re-engagement task that is overdue at birth.
  const nurtureDateValid =
    Boolean(nurtureDate) && nurtureDate >= format(new Date(), "yyyy-MM-dd");
  const noneValid =
    decisionKind === "none"
      ? true
      : decisionKind === "deal"
        ? dealPath === "won" || lostReason.trim().length > 0
        : leadPath === "nurture"
          ? reasonComplete(nurtureReason) && nurtureDateValid
          : reasonComplete(disqualifyReason);

  const onCancel = () => {
    head.onCancelled?.();
    dequeue();
  };

  /** The atomic completion call used by every stage-"outcome" path. */
  const complete = (nextStep?: NextStepPayload) =>
    updateStatus.mutateAsync({
      id: activity.id,
      status: "completed",
      outcome: outcome as ActivityOutcome,
      completionNote: richTextToPlain(note).trim() ? note : undefined,
      nextStep,
      loopHandled: true,
    });

  const finish = async (completed: Activity, message: string) => {
    toast.success(message);
    // Await, don't fire-and-forget: the bulk callsite's onCompleted runs
    // the batch mutation for the remaining rows, and its failure must
    // surface as an error here rather than vanish after the dialog closed.
    await head.onCompleted?.(completed);
    dequeue();
  };

  const onSubmit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // ----- No step 2 needed: single atomic save. -----
      if (!alreadyCompleted && (step === 1 ? !followUpNeeded : false)) {
        const updated = await complete();
        await finish(updated, "Activity marked done");
        return;
      }

      // ----- Step 2: schedule the next step. -----
      if (mode === "schedule") {
        const nextStep: NextStepPayload = {
          type: nsType,
          subject: nsSubject.trim(),
          due_at: new Date(nsDue).toISOString(),
          description: nsDescription.trim() || undefined,
        };
        if (alreadyCompleted) {
          // Activity already completed elsewhere — create the follow-up
          // directly on the same record.
          await createActivity.mutateAsync({
            type: nsType,
            subject: nextStep.subject,
            description: nextStep.description,
            due_at: nextStep.due_at,
            lead_id: activity.lead_id ?? undefined,
            deal_id: activity.deal_id ?? undefined,
            contact_id: activity.contact_id ?? undefined,
            assigned_to_id:
              activity.assigned_to_id ?? activity.created_by?.id ?? undefined,
            ...(nsType === "task"
              ? { task: { status: "todo", priority: "medium" } }
              : {}),
            ...(nsType === "meeting"
              ? {
                  meeting: {
                    title: nextStep.subject,
                    platform: "other",
                    start_time: nextStep.due_at,
                  },
                }
              : {}),
          });
          await finish(activity, "Next step scheduled");
        } else {
          const updated = await complete(nextStep);
          await finish(updated, "Done — next step scheduled");
        }
        return;
      }

      // ----- Step 2: no next step → decide the record. -----
      if (decisionKind === "deal") {
        try {
          await closeDeal.mutateAsync({
            id: activity.deal_id as string,
            data:
              dealPath === "won"
                ? { close_status: "won" }
                : { close_status: "lost", lost_reason: lostReason.trim() },
          });
        } catch (err) {
          // Retry path: if the FIRST attempt closed the deal but the
          // completion after it failed, re-submitting must not dead-end
          // on "deal is already closed" forever. Any other close failure
          // is real and aborts.
          if (!/already closed/i.test(handleApiError(err))) throw err;
        }
        const updated = alreadyCompleted ? activity : await complete();
        await finish(
          updated,
          dealPath === "won" ? "Deal marked won" : "Deal marked lost",
        );
        return;
      }

      if (decisionKind === "lead") {
        if (leadPath === "nurture") {
          const reengageIso = new Date(
            `${nurtureDate}T09:00:00`,
          ).toISOString();
          await updateLead.mutateAsync({
            id: activity.lead_id as string,
            data: {
              status: "Nurture",
              nurture_reason: nurtureReason,
              follow_up_date: reengageIso,
              ...(nurtureReason === "Other" && {
                other_value: otherReason.trim(),
              }),
            },
          });
          const reengageSubject = `Re-engage: ${
            activity.lead?.lead_name ?? "lead"
          }`;
          if (alreadyCompleted) {
            await createActivity.mutateAsync({
              type: "task",
              subject: reengageSubject,
              due_at: reengageIso,
              lead_id: activity.lead_id ?? undefined,
              contact_id: activity.contact_id ?? undefined,
              // Never ownerless: fall back to whoever logged the source
              // activity, matching the atomic server path's guarantee.
              assigned_to_id:
                activity.assigned_to_id ??
                activity.created_by?.id ??
                undefined,
              task: { status: "todo", priority: "medium" },
            });
            await finish(activity, "Lead moved to Nurture — re-engagement scheduled");
          } else {
            // The re-engagement task IS the next step — scheduled in the
            // same request as the completion.
            const updated = await complete({
              type: "task",
              subject: reengageSubject,
              due_at: reengageIso,
              description: `Nurture: ${nurtureReason}`,
            });
            await finish(updated, "Lead moved to Nurture — re-engagement scheduled");
          }
        } else {
          // Disqualify FIRST so the server's next-step gate sees the
          // terminal record when the completion lands.
          await updateLead.mutateAsync({
            id: activity.lead_id as string,
            data: {
              status: "Disqualified",
              disqualify_reason: disqualifyReason,
              ...(disqualifyReason === "Other" && {
                other_value: otherReason.trim(),
              }),
            },
          });
          const updated = alreadyCompleted ? activity : await complete();
          await finish(updated, "Lead disqualified");
        }
        return;
      }

      // No parent record — completing is all there is to do.
      const updated = alreadyCompleted ? activity : await complete();
      await finish(updated, "Activity marked done");
    } catch (err) {
      toast.error("Could not close the loop", {
        description: handleApiError(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const submitLabel = (() => {
    if (step === 1) return followUpNeeded ? "Continue" : "Mark done";
    if (mode === "schedule")
      return alreadyCompleted ? "Schedule next step" : "Mark done & schedule";
    if (decisionKind === "deal")
      return dealPath === "won" ? "Mark deal won" : "Mark deal lost";
    if (decisionKind === "lead")
      return leadPath === "nurture"
        ? alreadyNurture
          ? "Keep in Nurture"
          : "Move to Nurture"
        : "Disqualify lead";
    return "Mark done";
  })();

  const submitDisabled =
    saving ||
    (step === 1
      ? !step1Valid
      : mode === "schedule"
        ? !scheduleValid
        : !noneValid);

  return (
    <Dialog
      open
      onOpenChange={() => {
        // Explicit buttons only — Radix never auto-closes this dialog.
      }}
    >
      <DialogContent
        className="sm:max-w-xl"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 1 ? (
              <>Record the outcome</>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                What happens next?
              </>
            )}
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {alreadyCompleted ? "Next step" : `Step ${step} of ${followUpNeeded ? 2 : 1}`}
            </span>
          </DialogTitle>
          <DialogDescription>
            <Badge
              variant="outline"
              className={getActivityChip(activity.type)}
            >
              {getActivityLabel(activity.type)}
            </Badge>{" "}
            <span className="font-medium">{activity.subject}</span>
            {recordContext && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {recordContext}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="completion-outcome">Outcome</Label>
              <Select
                value={outcome}
                onValueChange={(v) => setOutcome(v as ActivityOutcome)}
              >
                <SelectTrigger id="completion-outcome">
                  <SelectValue placeholder="How did it go?" />
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
              <Label>What happened?</Label>
              <RichTextEditor
                value={note}
                onChange={setNote}
                placeholder="The part a colleague can actually read — what was said, agreed, promised…"
                minHeight={88}
              />
              <p className="text-xs text-muted-foreground">
                Required. Shown in the activity log as part of the record's
                history.
              </p>
            </div>
            {noFollowUpReason && (
              <p className="rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                {noFollowUpReason}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "schedule" ? "default" : "outline"}
                onClick={() => setMode("schedule")}
              >
                Schedule next step
              </Button>
              <Button
                type="button"
                variant={mode === "none" ? "default" : "outline"}
                onClick={() => setMode("none")}
              >
                No next step
              </Button>
            </div>

            {mode === "schedule" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {NEXT_STEP_TYPES.map(({ value, label, icon: Icon }) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={nsType === value ? "default" : "outline"}
                      className="h-8"
                      onClick={() => setNsType(value)}
                    >
                      <Icon className="mr-1.5 h-3.5 w-3.5" />
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ns-subject">What needs to happen?</Label>
                  <Input
                    id="ns-subject"
                    value={nsSubject}
                    onChange={(e) => setNsSubject(e.target.value)}
                    placeholder="e.g. Send revised quote to the bursar"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ns-due">When</Label>
                    <Input
                      id="ns-due"
                      type="datetime-local"
                      value={nsDue}
                      onChange={(e) => setNsDue(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ns-desc">Notes (optional)</Label>
                    <Textarea
                      id="ns-desc"
                      rows={1}
                      value={nsDescription}
                      onChange={(e) => setNsDescription(e.target.value)}
                      placeholder="Anything the future you needs"
                    />
                  </div>
                </div>
              </div>
            ) : decisionKind === "deal" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  A deal can't stay open with nothing planned. If there is
                  genuinely no next step, the deal is decided now.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={dealPath === "lost" ? "default" : "outline"}
                    onClick={() => setDealPath("lost")}
                  >
                    Mark lost
                  </Button>
                  <Button
                    type="button"
                    variant={dealPath === "won" ? "default" : "outline"}
                    onClick={() => setDealPath("won")}
                  >
                    Mark won
                  </Button>
                </div>
                {dealPath === "lost" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="lost-reason">Why was it lost?</Label>
                    <Textarea
                      id="lost-reason"
                      rows={2}
                      value={lostReason}
                      onChange={(e) => setLostReason(e.target.value)}
                      placeholder="Required — logged on the deal"
                    />
                  </div>
                )}
              </div>
            ) : decisionKind === "lead" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {alreadyNurture
                    ? "This lead is parked in Nurture. Still not ready? Set the next wake-up date — or disqualify it if it's truly dead."
                    : "An active lead can't sit with nothing planned. Park it with a wake-up date, or close it with a reason."}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={leadPath === "nurture" ? "default" : "outline"}
                    onClick={() => setLeadPath("nurture")}
                  >
                    Nurture
                  </Button>
                  <Button
                    type="button"
                    variant={
                      leadPath === "disqualify" ? "default" : "outline"
                    }
                    onClick={() => setLeadPath("disqualify")}
                  >
                    Disqualify
                  </Button>
                </div>
                {leadPath === "nurture" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Why park it?</Label>
                      <Select
                        value={nurtureReason}
                        onValueChange={setNurtureReason}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a reason" />
                        </SelectTrigger>
                        <SelectContent>
                          {NURTURE_REASONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="nurture-date">Re-engage on</Label>
                      <Input
                        id="nurture-date"
                        type="date"
                        value={nurtureDate}
                        min={format(new Date(), "yyyy-MM-dd")}
                        onChange={(e) => setNurtureDate(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        A re-engagement task is scheduled for this date.
                      </p>
                    </div>
                    {nurtureReason === "Other" && (
                      <div className="col-span-2 space-y-1.5">
                        <Label htmlFor="nurture-other">What's the reason?</Label>
                        <Input
                          id="nurture-other"
                          value={otherReason}
                          onChange={(e) => setOtherReason(e.target.value)}
                          placeholder="Required — recorded on the lead"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Why disqualify?</Label>
                    <Select
                      value={disqualifyReason}
                      onValueChange={setDisqualifyReason}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {DISQUALIFY_REASONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {disqualifyReason === "Other" && (
                      <Input
                        value={otherReason}
                        onChange={(e) => setOtherReason(e.target.value)}
                        placeholder="What's the reason? Required — recorded on the lead"
                      />
                    )}
                    <p className="text-xs text-muted-foreground">
                      Commercial reasons (no budget, not interested…) need
                      manager approval first — if yours is declined here,
                      raise it with your manager or park the lead in
                      Nurture instead.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This activity isn't tied to a lead or deal, so there is no
                record to keep alive — completing it is all there is to do.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            {step === 2 && !alreadyCompleted && (
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                disabled={saving}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
            )}
            {!alreadyCompleted && (
              <Button variant="ghost" onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
          <Button
            onClick={() => {
              if (step === 1 && followUpNeeded) {
                setStep(2);
                return;
              }
              void onSubmit();
            }}
            disabled={submitDisabled}
          >
            {saving ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
