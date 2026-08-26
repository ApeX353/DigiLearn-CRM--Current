import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import {
  CalendarClock,
  CheckSquare,
  Layers,
  Lightbulb,
  Link2,
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
  useBulkUpdateActivityStatus,
  useCreateActivity,
  useUpdateActivityStatus,
} from "~/api/activities";
import type {
  CompletionLinks,
  NextStepPayload,
} from "~/api/activities/use-activities";
import { Checkbox } from "~/components/ui/checkbox";
import {
  isOverdueOrDueToday,
  siblingWhen,
  useOpenSiblings,
} from "~/lib/use-open-siblings";
import { formatActivityMoment } from "~/components/activities/activity-kit";
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
 * ONE surface, both halves of the rule visible at once:
 *
 *   What happened — outcome (no pre-selected default) and a mandatory
 *   note. Picking a no-contact outcome ("No response", "Unsuccessful")
 *   prefills the note with the honest sentence, editable — the field
 *   used to force prose where there was nothing to say, and the reps'
 *   answer was keyboard mash ("fff", "dd"). Both render read-only in the
 *   activity log afterwards.
 *
 *   Also covered — the other open items on this record that THIS
 *   conversation settled (the held meeting, the training follow-up the
 *   same call answered). Ticked ones close in the same request with the
 *   same outcome. One line of communication: a school is one
 *   conversation, not a stack of parallel follow-up chains.
 *
 *   What happens next — four answers, all of which keep the rule that
 *   an active record owes ONE future:
 *     · Already planned — the record has an open dated step; point at it.
 *       Nothing new is created. Default whenever such a step exists.
 *     · Schedule — prefilled from the outcome (No response → retry call
 *       tomorrow; Proposal sent → follow-up day 3 per SLA), editable.
 *       Sent in the SAME request as the completion.
 *     · Decide later today — creates a "Decide next step" task due
 *       5 PM today. The record still has a future; the future is
 *       "make the real plan", not an invented follow-up.
 *     · No next step — the record is decided now: lead → Nurture (with
 *       re-engage date) or Disqualify (with reason); deal → won / lost.
 *
 * Bulk mode (bulkIds on the queue entry): quick outcomes only, one
 * honest canned note applied to each row. Detailed outcomes belong to
 * individual completions — bulk exists for "called five schools, none
 * answered", not for narrating five different conversations at once.
 *
 * Nothing is saved until the final button. Entries queued at stage
 * "next-step" (already completed elsewhere) show only the second half
 * and cannot be dismissed until the record has a future.
 */

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

/** Mirror of the server's DISQUALIFY_REASONS enum (leads/constants). */
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

/**
 * Honest note prefills for outcomes where NO conversation happened.
 * There is genuinely nothing to narrate about an unanswered call, and
 * forcing prose there produced "fff" / "dd" in real data. The prefill
 * is the truthful sentence; the rep can always overwrite it. Outcomes
 * that imply a real exchange get no prefill — those deserve real words.
 */
const NO_CONTACT_PREFILLS: Partial<
  Record<ActivityOutcome, { byType: Partial<Record<string, string>>; fallback: string }>
> = {
  no_response: {
    byType: {
      call: "Called — no answer.",
      whatsapp: "Messaged on WhatsApp — no reply yet.",
      email: "Emailed — no reply yet.",
    },
    fallback: "Reached out — no response.",
  },
  unsuccessful: {
    byType: {
      call: "Called — couldn't get through.",
      whatsapp: "Messaged on WhatsApp — couldn't connect.",
    },
    fallback: "Attempt unsuccessful — couldn't connect.",
  },
};

function prefillFor(
  outcome: ActivityOutcome | "",
  activityType: string,
): string | null {
  if (!outcome) return null;
  const entry = NO_CONTACT_PREFILLS[outcome as ActivityOutcome];
  if (!entry) return null;
  return entry.byType[activityType] ?? entry.fallback;
}

/**
 * Outcome → suggested next step. Cadences come from the SLA table in the
 * rulebook (quote follow-up day 3; committee decisions ~5 days; failed
 * contact retries next morning). Suggestions apply only while the rep
 * hasn't touched the next-step fields — one manual edit and the dialog
 * stops steering.
 */
const NEXT_STEP_SUGGESTIONS: Partial<
  Record<
    ActivityOutcome,
    { type: ActivityType; subject: string; days: number }
  >
> = {
  no_response: { type: "call", subject: "Retry call", days: 1 },
  unsuccessful: { type: "call", subject: "Try again", days: 1 },
  rescheduled: { type: "call", subject: "Reconnect at the new time", days: 1 },
  interested: { type: "task", subject: "Send quotation", days: 2 },
  waiting_for_approval: {
    type: "task",
    subject: "Check on the decision",
    days: 5,
  },
  proposal_sent: {
    type: "call",
    subject: "Follow up on the proposal",
    days: 3,
  },
  follow_up_needed: { type: "call", subject: "Follow up", days: 3 },
};

/** Outcomes bulk completion may use — the ones whose canned note is
 * honest for every row at once. Anything richer is a one-at-a-time
 * story by definition. */
const BULK_OUTCOMES: ActivityOutcome[] = [
  "no_response",
  "unsuccessful",
  "rescheduled",
];

function defaultDueIso(days: number): string {
  const d = addDays(new Date(), days);
  d.setHours(9, 0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/** 5 PM today, or two hours from now when it's already past — the
 * "decide later" task must land TODAY, not tomorrow, or deferral
 * becomes the new procrastination loophole. */
function deferDueIso(): string {
  const now = new Date();
  const eod = new Date();
  eod.setHours(17, 0, 0, 0);
  const due =
    now.getTime() + 60 * 60 * 1000 > eod.getTime()
      ? new Date(now.getTime() + 2 * 60 * 60 * 1000)
      : eod;
  return due.toISOString();
}

export function ActivityCompletionDialog() {
  const queue = useActivityCompletionStore((s) => s.queue);
  const dequeue = useActivityCompletionStore((s) => s.dequeue);
  const updateStatus = useUpdateActivityStatus();
  const bulkUpdateStatus = useBulkUpdateActivityStatus();
  const createActivity = useCreateActivity();
  const updateLead = useUpdateLead();
  const closeDeal = useCloseDeal();

  const head = queue[0] ?? null;
  const activity = head?.activity ?? null;
  const startStage = head?.stage ?? "outcome";
  /** stage "next-step" = already completed; only the second half applies. */
  const alreadyCompleted = startStage === "next-step";
  const bulkIds = head?.bulkIds;
  const isBulk = !!bulkIds && bulkIds.length > 1;

  // ---------- what happened ----------
  const [outcome, setOutcome] = useState<ActivityOutcome | "">("");
  const [note, setNote] = useState("");
  /** Last canned text WE wrote into the note. If the field still holds
   * exactly this, the rep hasn't edited it and we may swap it when the
   * outcome changes. The moment their words differ, hands off. */
  const lastAutoNote = useRef<string | null>(null);

  // ---------- what happens next ----------
  const [mode, setMode] = useState<
    "existing" | "schedule" | "defer" | "none"
  >("schedule");
  /** "Already planned" — which open dated sibling IS the next step. */
  const [existingId, setExistingId] = useState<string>("");
  /** "Also covered" — sibling open items this conversation settled. */
  const [alsoComplete, setAlsoComplete] = useState<Set<string>>(new Set());
  const [modeTouched, setModeTouched] = useState(false);
  const [nsType, setNsType] = useState<ActivityType>("task");
  const [nsSubject, setNsSubject] = useState("");
  const [nsDue, setNsDue] = useState(defaultDueIso(1));
  const [nsDescription, setNsDescription] = useState("");
  /** True once the rep manually edits any next-step field — suggestions
   * stop applying from that moment. */
  const nsTouched = useRef(false);
  const [suggestionApplied, setSuggestionApplied] = useState(false);

  const [leadPath, setLeadPath] = useState<"nurture" | "disqualify">(
    "nurture",
  );
  const [nurtureReason, setNurtureReason] = useState<string>("");
  const [nurtureDate, setNurtureDate] = useState(
    format(addDays(new Date(), 45), "yyyy-MM-dd"),
  );
  const [disqualifyReason, setDisqualifyReason] = useState<string>("");
  const [otherReason, setOtherReason] = useState("");
  const [dealPath, setDealPath] = useState<"lost" | "won">("lost");
  const [lostReason, setLostReason] = useState("");
  const [saving, setSaving] = useState(false);

  // What else is open on this record. Drives both "Also covered" (what
  // this conversation settled) and "Already planned" (is the next step
  // already there?). Bulk mode never reads it — outcomes batch, futures
  // don't.
  const { siblings, dated: datedSiblings } = useOpenSiblings({
    leadId: activity?.lead_id,
    dealId: activity?.deal_id,
    contactId: activity?.contact_id,
    excludeId: activity?.id,
    enabled: !!activity && !isBulk,
  });
  /** Dated siblings that will still be open after this save. */
  const remainingDated = useMemo(
    () => datedSiblings.filter((s) => !alsoComplete.has(s.id)),
    [datedSiblings, alsoComplete],
  );

  useEffect(() => {
    if (!activity) return;
    setOutcome("");
    setNote("");
    lastAutoNote.current = null;
    setMode("schedule");
    setModeTouched(false);
    setExistingId("");
    setAlsoComplete(new Set());
    setNsType("task");
    setNsSubject("");
    setNsDue(defaultDueIso(1));
    setNsDescription("");
    nsTouched.current = false;
    setSuggestionApplied(false);
    setLeadPath("nurture");
    setNurtureReason("");
    setNurtureDate(format(addDays(new Date(), 45), "yyyy-MM-dd"));
    setDisqualifyReason("");
    setOtherReason("");
    setDealPath("lost");
    setLostReason("");
    setSaving(false);
  }, [activity, alreadyCompleted]);

  // Honest prefill: only into an empty field or over our own previous
  // prefill — never over anything the rep typed.
  useEffect(() => {
    if (!activity || alreadyCompleted) return;
    const canned = prefillFor(outcome, activity.type);
    const current = richTextToPlain(note).trim();
    const lastCanned = lastAutoNote.current
      ? richTextToPlain(lastAutoNote.current).trim()
      : null;
    const untouched = current === "" || current === lastCanned;
    if (!untouched) return;
    if (canned) {
      const text = isBulk
        ? `${canned} (Applies to each activity in this batch.)`
        : canned;
      setNote(text);
      lastAutoNote.current = text;
    } else if (current !== "") {
      // Switched from a prefilled outcome to one that deserves real
      // words — clear our stale canned sentence rather than let it
      // masquerade as the rep's account.
      setNote("");
      lastAutoNote.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, activity?.id]);

  // Outcome-driven next-step suggestion — until the rep touches the
  // next-step fields themselves.
  useEffect(() => {
    if (!activity || isBulk || nsTouched.current) return;
    // At the "next-step" stage the activity was completed elsewhere (e.g.
    // logged from the composer) — its stored outcome is the one to steer
    // from, since this dialog never asked for one.
    const effectiveOutcome =
      outcome ||
      (alreadyCompleted ? (activity.completion_outcome ?? "") : "");
    const s = effectiveOutcome
      ? NEXT_STEP_SUGGESTIONS[effectiveOutcome as ActivityOutcome]
      : undefined;
    if (s) {
      setNsType(s.type);
      setNsSubject(s.subject);
      setNsDue(defaultDueIso(s.days));
      setSuggestionApplied(true);
    } else {
      setNsType("task");
      setNsSubject("");
      setNsDue(defaultDueIso(1));
      setSuggestionApplied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, activity?.id, alreadyCompleted]);

  // "Also covered" is strictly OPT-IN here. This dialog completes an
  // item that was already tracked as its own commitment, so another
  // overdue sibling of the same type is usually SEPARATE work — unlike
  // the composer, where the logged call plainly IS the scheduled one.
  // Pre-ticking here closed work the rep never touched.

  // Default answer to "what happens next": if the record already has an
  // open dated step, the honest default is to point at it — not to stack
  // another. The earliest one is pre-selected; the rep can pick another
  // or switch to scheduling something genuinely new.
  useEffect(() => {
    // nsTouched: the rep already started drafting a new step — flipping
    // the mode under their cursor would discard visible intent.
    if (!activity || modeTouched || nsTouched.current) return;
    if (remainingDated.length > 0) {
      setMode("existing");
      setExistingId((cur) =>
        cur && remainingDated.some((s) => s.id === cur)
          ? cur
          : remainingDated[0].id,
      );
    } else {
      setMode("schedule");
      setExistingId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingDated, activity?.id, modeTouched]);

  // A stage-"next-step" entry means an already-completed activity whose
  // record has nothing scheduled. Refreshing the page would silently
  // drop that obligation, so warn.
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

  const decisionKind: "deal" | "lead" | "none" = activity.deal_id
    ? "deal"
    : activity.lead_id
      ? "lead"
      : "none";
  const alreadyNurture = activity.lead?.status === "Nurture";
  const recordName =
    activity.deal?.deal_name ??
    activity.deal?.title ??
    activity.lead?.lead_name ??
    "this record";

  const followUpNeeded =
    !isBulk &&
    shouldRequireFollowUp({
      ...activity,
      completion_outcome: (outcome ||
        undefined) as Activity["completion_outcome"],
    });

  const noFollowUpReason =
    followUpNeeded || isBulk
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

  const outcomeOptions = isBulk ? BULK_OUTCOMES : ACTIVITY_OUTCOMES;

  const whatHappenedValid = Boolean(outcome) && !isRichTextEmpty(note);
  const scheduleValid = nsSubject.trim().length > 0 && Boolean(nsDue);
  const reasonComplete = (reason: string) =>
    Boolean(reason) && (reason !== "Other" || otherReason.trim().length > 0);
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

  const existingValid =
    mode === "existing" &&
    Boolean(existingId) &&
    remainingDated.some((s) => s.id === existingId);
  const nextStepValid =
    mode === "existing"
      ? existingValid
      : mode === "schedule"
        ? scheduleValid
        : mode === "defer"
          ? true
          : noneValid;

  const submitDisabled =
    saving ||
    (isBulk
      ? !whatHappenedValid
      : alreadyCompleted
        ? !nextStepValid
        : !whatHappenedValid || (followUpNeeded && !nextStepValid));

  const onCancel = () => {
    head.onCancelled?.();
    dequeue();
  };

  const links = (): CompletionLinks => ({
    alsoComplete: alsoComplete.size ? Array.from(alsoComplete) : undefined,
    nextStepExistingId:
      mode === "existing" && existingId ? existingId : undefined,
  });

  const complete = (nextStep?: NextStepPayload) =>
    updateStatus.mutateAsync({
      id: activity.id,
      status: "completed",
      outcome: outcome as ActivityOutcome,
      completionNote: richTextToPlain(note).trim() ? note : undefined,
      nextStep,
      links: links(),
      loopHandled: true,
    });

  const finish = async (completed: Activity, message: string) => {
    toast.success(message);
    await head.onCompleted?.(completed);
    dequeue();
  };

  /** The "decide later today" task — the record's future is the decision
   * itself, made honest and dated instead of invented. */
  const deferPayload = (): NextStepPayload => ({
    type: "task",
    subject: `Decide next step — ${recordName}`,
    due_at: deferDueIso(),
    description:
      "Auto-created: the next-step decision was deferred at completion. Replace this with the real plan before end of day.",
  });

  /** Create a follow-up directly (used when the activity is already
   * completed and the atomic next_step path isn't available). */
  const createFollowUp = (step: NextStepPayload) =>
    createActivity.mutateAsync({
      type: step.type,
      subject: step.subject,
      description: step.description,
      due_at: step.due_at,
      lead_id: activity.lead_id ?? undefined,
      deal_id: activity.deal_id ?? undefined,
      contact_id: activity.contact_id ?? undefined,
      assigned_to_id:
        activity.assigned_to_id ?? activity.created_by?.id ?? undefined,
      ...(step.type === "task"
        ? { task: { status: "todo", priority: "medium" } }
        : {}),
      ...(step.type === "meeting"
        ? {
            meeting: {
              title: step.subject,
              platform: "other",
              start_time: step.due_at,
            },
          }
        : {}),
    });

  const onSubmit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // ----- Bulk: quick outcome + honest canned note for every row. -----
      if (isBulk && bulkIds) {
        await bulkUpdateStatus.mutateAsync({
          ids: bulkIds,
          status: "completed",
          outcome: outcome as ActivityOutcome,
          completionNote: note,
        });
        await finish(
          activity,
          `${bulkIds.length} activities marked done`,
        );
        return;
      }

      // ----- No second half needed: single atomic save. -----
      if (!alreadyCompleted && !followUpNeeded) {
        const updated = await complete();
        await finish(updated, "Activity marked done");
        return;
      }

      // ----- Already planned: the record's future exists; point at it. -----
      if (mode === "existing") {
        const chosen = remainingDated.find((s) => s.id === existingId);
        const label = chosen
          ? `next step stays: ${chosen.subject}`
          : "next step already planned";
        if (alreadyCompleted) {
          // Nothing to write — the activity is done and the record already
          // has its future. Dequeue and move on.
          await finish(activity, `Kept — ${label}`);
        } else {
          const updated = await complete();
          await finish(updated, `Done — ${label}`);
        }
        return;
      }

      // ----- Schedule (or defer — same shape, different task). -----
      if (mode === "schedule" || mode === "defer") {
        const nextStep: NextStepPayload =
          mode === "defer"
            ? deferPayload()
            : {
                type: nsType,
                subject: nsSubject.trim(),
                due_at: new Date(nsDue).toISOString(),
                description: nsDescription.trim() || undefined,
              };
        if (alreadyCompleted) {
          await createFollowUp(nextStep);
          await finish(
            activity,
            mode === "defer"
              ? "Decision task created — due today"
              : "Next step scheduled",
          );
        } else {
          const updated = await complete(nextStep);
          await finish(
            updated,
            mode === "defer"
              ? "Done — decision task due today"
              : "Done — next step scheduled",
          );
        }
        return;
      }

      // ----- No next step → decide the record. -----
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
          // Retry path: the first attempt may have closed the deal and
          // failed later — don't dead-end on "already closed".
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
          // ONE nurture process: the server owns the wake-up. Parking a
          // lead with a follow_up_date creates (or re-dates) its single
          // "Re-engage:" task inside the lead update — this dialog used
          // to build its own task on top, which meant two code paths
          // and, from the standalone Nurture dialog, none at all.
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
          // The wake-up task now exists, so the completion's next-step
          // gate is satisfied by it — no client-side next_step needed.
          const updated = alreadyCompleted ? activity : await complete();
          await finish(
            updated,
            "Lead moved to Nurture — re-engagement scheduled",
          );
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
    if (isBulk) return `Mark ${bulkIds?.length} done`;
    if (!alreadyCompleted && !followUpNeeded) return "Mark done";
    if (mode === "existing")
      return alreadyCompleted ? "Keep the planned step" : "Mark done";
    if (mode === "schedule")
      return alreadyCompleted ? "Schedule next step" : "Mark done & schedule";
    if (mode === "defer")
      return alreadyCompleted
        ? "Create decision task"
        : "Mark done — decide today";
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

  return (
    <Dialog
      open
      onOpenChange={() => {
        // Explicit buttons only — Radix never auto-closes this dialog.
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {alreadyCompleted ? "What happens next?" : "Close the loop"}
          </DialogTitle>
          <DialogDescription>
            {isBulk ? (
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                <span className="font-medium">
                  {bulkIds?.length} selected activities
                </span>
              </span>
            ) : (
              <>
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
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* ---------- What happened ---------- */}
          {!alreadyCompleted && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What happened
              </h3>
              {isBulk && (
                <p className="rounded-md border border-blue-200/70 bg-blue-50/60 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
                  Bulk completion takes quick outcomes only — one honest
                  note that is true for every row. For detailed outcomes,
                  open activities one at a time.
                </p>
              )}
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
                    {outcomeOptions.map((value) => (
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
                  minHeight={72}
                />
                <p className="text-xs text-muted-foreground">
                  Required — shown in the activity log.
                  {lastAutoNote.current &&
                    richTextToPlain(note).trim() ===
                      richTextToPlain(lastAutoNote.current).trim() &&
                    " Prefilled for this outcome; edit if there's more to say."}
                </p>
              </div>
              {noFollowUpReason && (
                <p className="rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                  {noFollowUpReason}
                </p>
              )}
            </section>
          )}

          {/* ---------- Also covered ---------- */}
          {!alreadyCompleted && !isBulk && siblings.length > 0 && (
            <section className="space-y-2 border-t pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Also covered in this conversation
              </h3>
              <p className="text-xs text-muted-foreground">
                One school, one line of communication. Tick the open items
                this same conversation settled — they close with the same
                outcome, so you are not asked for a next step on each of them.
              </p>
              <ul className="space-y-1">
                {siblings.slice(0, 8).map((s) => {
                  const when = siblingWhen(s);
                  const late = isOverdueOrDueToday(s);
                  return (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={alsoComplete.has(s.id)}
                          onCheckedChange={(v) => {
                            setAlsoComplete((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(s.id);
                              else next.delete(s.id);
                              return next;
                            });
                          }}
                        />
                        <span className="min-w-0">
                          <Badge
                            variant="outline"
                            className={`mr-1.5 align-middle ${getActivityChip(s.type)}`}
                          >
                            {getActivityLabel(s.type)}
                          </Badge>
                          <span className="align-middle">{s.subject}</span>
                          <span
                            className={`ml-1.5 align-middle text-xs ${
                              late
                                ? "text-red-600 dark:text-red-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {when
                              ? `· ${late ? "due" : "planned"} ${formatActivityMoment(when)}`
                              : "· no date"}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
                {siblings.length > 8 && (
                  <li className="text-xs text-muted-foreground">
                    +{siblings.length - 8} more open on this record.
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* ---------- What happens next ---------- */}
          {(alreadyCompleted || followUpNeeded) && !isBulk && (
            <section className="space-y-3 border-t pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What happens next
              </h3>
              <div
                className={`grid gap-2 ${
                  remainingDated.length > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
                }`}
              >
                {remainingDated.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "existing" ? "default" : "outline"}
                    onClick={() => {
                      setModeTouched(true);
                      setMode("existing");
                    }}
                  >
                    <Link2 className="mr-1.5 h-3.5 w-3.5" />
                    Already planned
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "schedule" ? "default" : "outline"}
                  onClick={() => {
                    setModeTouched(true);
                    setMode("schedule");
                  }}
                >
                  Schedule it
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "defer" ? "default" : "outline"}
                  onClick={() => {
                    setModeTouched(true);
                    setMode("defer");
                  }}
                >
                  Decide later today
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "none" ? "default" : "outline"}
                  onClick={() => {
                    setModeTouched(true);
                    setMode("none");
                  }}
                >
                  No next step
                </Button>
              </div>

              {mode === "existing" ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    This record already has a planned step. Pointing at it
                    keeps one line of communication instead of stacking a
                    second follow-up on top.
                  </p>
                  <ul className="space-y-1">
                    {remainingDated.map((s) => {
                      const when = siblingWhen(s);
                      const late = isOverdueOrDueToday(s);
                      return (
                        <li key={s.id}>
                          <label className="flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                            <input
                              type="radio"
                              name="existing-next-step"
                              className="mt-1"
                              checked={existingId === s.id}
                              onChange={() => setExistingId(s.id)}
                            />
                            <span className="min-w-0">
                              <Badge
                                variant="outline"
                                className={`mr-1.5 align-middle ${getActivityChip(s.type)}`}
                              >
                                {getActivityLabel(s.type)}
                              </Badge>
                              <span className="align-middle font-medium">
                                {s.subject}
                              </span>
                              <span
                                className={`ml-1.5 align-middle text-xs ${
                                  late
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {when ? formatActivityMoment(when) : ""}
                                {late ? " · due now" : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : mode === "schedule" ? (
                <div className="space-y-3">
                  {suggestionApplied && !nsTouched.current && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                      Suggested from the outcome — edit anything.
                    </p>
                  )}
                  {remainingDated.length > 0 && (
                    <p className="rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                      This record already has {remainingDated.length} planned{" "}
                      {remainingDated.length === 1 ? "step" : "steps"} (
                      {remainingDated[0].subject}
                      {remainingDated.length > 1 ? ", …" : ""}). Schedule
                      something new only if it is genuinely extra work —
                      otherwise choose “Already planned”.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {NEXT_STEP_TYPES.map(({ value, label, icon: Icon }) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={nsType === value ? "default" : "outline"}
                        className="h-8"
                        onClick={() => {
                          nsTouched.current = true;
                          setNsType(value);
                        }}
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
                      onChange={(e) => {
                        nsTouched.current = true;
                        setNsSubject(e.target.value);
                      }}
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
                        onChange={(e) => {
                          nsTouched.current = true;
                          setNsDue(e.target.value);
                        }}
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
              ) : mode === "defer" ? (
                <div className="flex items-start gap-2.5 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p>
                      A task —{" "}
                      <span className="font-medium">
                        “Decide next step — {recordName}”
                      </span>{" "}
                      — is created, due by 5:00 PM today.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      For when the honest answer is “I don't know yet.” The
                      record keeps a future without inventing one; make the
                      real plan before end of day.
                    </p>
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
                          <Label htmlFor="nurture-other">
                            What's the reason?
                          </Label>
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
            </section>
          )}

          {isBulk && (
            <p className="text-xs text-muted-foreground">
              Next steps aren't scheduled in bulk — records left without a
              future will show their flags on the lead, deal and school
              pages.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            {!alreadyCompleted && (
              <Button variant="ghost" onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
          <Button onClick={() => void onSubmit()} disabled={submitDisabled}>
            {saving ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
