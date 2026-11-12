import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import {
  CalendarClock,
  CheckSquare,
  Layers,
  Lightbulb,
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
import type { NextStepPayload } from "~/api/activities/use-activities";
import { useUpdateLead } from "~/api/leads/use-leads";
import type { Contact } from "~/api/contacts";
import { useUpdateContactChannels } from "~/api/contacts";
import { useCreateLeadReversalRequest } from "~/api/lead-reversal-requests";
import { NURTURE_REASONS } from "~/api/leads/lead-action-constants";
import { useCloseDeal } from "~/api/deals/use-deals";
import { shouldRequireFollowUp } from "~/lib/follow-up-policy";
import { getActivityChip, getActivityLabel } from "~/lib/activity-visuals";
import { handleApiError } from "~/api/axios";
import { toast } from "sonner";
import { useAnyRole } from "~/hooks/use-permission";
import { useAuthStore } from "~/stores/use-auth-store";
import { PersonPicker } from "./person-picker";

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
 *   What happens next — three answers, all of which keep the rule that
 *   an active record owes a future:
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
  Record<
    ActivityOutcome,
    { byType: Partial<Record<string, string>>; fallback: string }
  >
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

/**
 * The call result and the activity completion result are stored separately,
 * but both describe the same completed call. Map the unambiguous channel
 * results so a documented call is not narrated twice when it is ticked Done.
 */
const CALL_TO_ACTIVITY_OUTCOME: Record<string, ActivityOutcome> = {
  answered: "successful",
  no_answer: "no_response",
  voicemail: "no_response",
  busy: "no_response",
  wrong_number: "unsuccessful",
  callback_requested: "follow_up_needed",
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
  Record<ActivityOutcome, { type: ActivityType; subject: string; days: number }>
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
  const requestCompletion = useActivityCompletionStore((s) => s.request);
  const updateStatus = useUpdateActivityStatus();
  const bulkUpdateStatus = useBulkUpdateActivityStatus();
  const createActivity = useCreateActivity();
  const updateContactChannels = useUpdateContactChannels();
  const updateLead = useUpdateLead();
  const createDisqualifyRequest = useCreateLeadReversalRequest();
  const closeDeal = useCloseDeal();
  const canDisqualifyDirectly = useAnyRole(["admin", "sales_manager"]);
  const currentUser = useAuthStore((s) => s.user);

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
  const [mode, setMode] = useState<"schedule" | "defer" | "none">("schedule");
  const [nsType, setNsType] = useState<ActivityType>("task");
  const [nsSubject, setNsSubject] = useState("");
  const [nsDue, setNsDue] = useState(defaultDueIso(1));
  const [nsDescription, setNsDescription] = useState("");
  const [nsAssignee, setNsAssignee] = useState("");
  const [nsContactId, setNsContactId] = useState("");
  const [nsContact, setNsContact] = useState<Contact | null>(null);
  const [nsChannelValue, setNsChannelValue] = useState("");
  /** True once the rep manually edits any next-step field — suggestions
   * stop applying from that moment. */
  const nsTouched = useRef(false);
  const [suggestionApplied, setSuggestionApplied] = useState(false);

  const [leadPath, setLeadPath] = useState<"nurture" | "disqualify">("nurture");
  const [nurtureReason, setNurtureReason] = useState<string>("");
  const [nurtureDate, setNurtureDate] = useState(
    format(addDays(new Date(), 45), "yyyy-MM-dd"),
  );
  const [disqualifyReason, setDisqualifyReason] = useState<string>("");
  const [otherReason, setOtherReason] = useState("");
  const [dealPath, setDealPath] = useState<"lost" | "won">("lost");
  const [lostReason, setLostReason] = useState("");
  const [saving, setSaving] = useState(false);

  const recordedCallOutcome =
    activity?.type === "call" && activity.call?.outcome
      ? CALL_TO_ACTIVITY_OUTCOME[activity.call.outcome]
      : undefined;
  const recordedCallSummary =
    activity?.type === "call" && activity.call?.summary
      ? activity.call.summary
      : "";
  const hasRecordedCallOutcome = Boolean(recordedCallOutcome);
  const hasRecordedCallSummary = !isRichTextEmpty(recordedCallSummary);
  const reusesRecordedCall =
    !alreadyCompleted &&
    !isBulk &&
    activity?.type === "call" &&
    (hasRecordedCallOutcome || hasRecordedCallSummary);

  useEffect(() => {
    if (!activity) return;
    const recordOwnerId =
      head?.ownerId ??
      activity.deal?.assigned_to ??
      activity.deal?.owner_id ??
      activity.deal?.assigned_user?.id ??
      activity.deal?.owner?.id ??
      activity.lead?.assigned_to ??
      activity.lead?.assignee?.id;
    setOutcome(recordedCallOutcome ?? "");
    setNote(recordedCallSummary);
    lastAutoNote.current = null;
    setMode("schedule");
    setNsType("task");
    setNsSubject("");
    setNsDue(defaultDueIso(1));
    setNsDescription("");
    const defaultContact =
      activity.contact ??
      activity.lead?.primary_contact ??
      activity.deal?.lead?.primary_contact ??
      null;
    setNsContactId(defaultContact?.id ?? "");
    setNsContact(defaultContact);
    setNsChannelValue("");
    // Automatic ownership: keep follow-up work with the deal/lead owner;
    // when the record has no owner, assign it to the person entering it.
    setNsAssignee(recordOwnerId ?? currentUser?.id ?? "");
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
  }, [activity, alreadyCompleted, currentUser?.id, head?.ownerId]);

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
    const s = outcome ? NEXT_STEP_SUGGESTIONS[outcome] : undefined;
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
  }, [outcome, activity?.id]);

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
    if (activity.lead?.lead_name)
      parts.push(`Lead: ${activity.lead.lead_name}`);
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
  const nsDueIsFuture =
    Boolean(nsDue) && new Date(nsDue).getTime() > Date.now();
  const effectiveLeadId =
    activity.lead_id ?? activity.deal?.lead_id ?? activity.deal?.lead?.id;
  const nextStepNeedsContact =
    nsType === "call" || nsType === "whatsapp" || nsType === "email";
  const nextStepPhone =
    nsType === "whatsapp"
      ? nsContact?.whatsapp_number ?? nsContact?.phone
      : nsContact?.phone ?? nsContact?.whatsapp_number;
  const nextStepEmail = nsContact?.email;
  const selectedPhoneStepWithoutPhone =
    (nsType === "whatsapp" || nsType === "call") && !nextStepPhone;
  const selectedEmailWithoutAddress = nsType === "email" && !nextStepEmail;
  const emailDraftValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    nsChannelValue.trim(),
  );
  const missingChannelValueValid = selectedPhoneStepWithoutPhone
    ? nsChannelValue.trim().length > 0 && nsChannelValue.trim().length <= 20
    : selectedEmailWithoutAddress
      ? emailDraftValid
      : true;
  const scheduleValid =
    nsSubject.trim().length > 0 &&
    nsDueIsFuture &&
    Boolean(nsAssignee) &&
    (!nextStepNeedsContact || Boolean(nsContactId && nsContact)) &&
    missingChannelValueValid;
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
          : reasonComplete(disqualifyReason) &&
            richTextToPlain(note).trim().length >= 10;

  const nextStepValid =
    mode === "schedule"
      ? scheduleValid
      : mode === "defer"
        ? Boolean(nsAssignee)
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
  const createFollowUp = (
    step: NextStepPayload,
    selectedContact: Contact | null = nsContact,
  ) => {
    const phone =
      step.type === "whatsapp"
        ? selectedContact?.whatsapp_number ?? selectedContact?.phone
        : selectedContact?.phone ?? selectedContact?.whatsapp_number;
    const email = selectedContact?.email;
    return createActivity.mutateAsync({
      type: step.type,
      subject: step.subject,
      description: step.description,
      due_at: step.due_at,
      lead_id: activity.lead_id ?? undefined,
      deal_id: activity.deal_id ?? undefined,
      contact_id: step.contact_id ?? activity.contact_id ?? undefined,
      assigned_to_id: nsAssignee || currentUser?.id || undefined,
      ...(step.type === "task"
        ? { task: { status: "todo", priority: "medium" } }
        : {}),
      ...(step.type === "call"
        ? {
            call: {
              phone_number: phone!,
              notes: step.description,
            },
          }
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
      ...(step.type === "whatsapp"
        ? {
            whatsapp: {
              phone_number: phone!,
              message: step.description?.trim() || step.subject,
              direction: "outbound" as const,
              message_type: "text" as const,
            },
          }
        : {}),
      ...(step.type === "email"
        ? {
            email: {
              subject: step.subject,
              body: step.description?.trim() || step.subject,
              to_recipients: JSON.stringify([{ email }]),
            },
          }
        : {}),
    });
  };

  /** Persist a missing channel on the chosen person, then use that same
   * returned contact for scheduling. The contact endpoint also applies the
   * CRM's customer-email restrictions and records the change in its audit log. */
  const ensureNextStepContact = async (): Promise<Contact | null> => {
    if (!nextStepNeedsContact) return null;
    if (!nsContactId || !nsContact) {
      throw new Error("Select the person for this next step.");
    }

    const value = nsChannelValue.trim();
    let data: {
      email?: string;
      phone?: string;
      whatsapp_number?: string;
    } | null = null;
    if (selectedPhoneStepWithoutPhone) {
      data =
        nsType === "whatsapp" ? { whatsapp_number: value } : { phone: value };
    } else if (selectedEmailWithoutAddress) {
      data = { email: value.toLowerCase() };
    }

    if (!data) return nsContact;
    const updated = await updateContactChannels.mutateAsync({
      id: nsContactId,
      data,
    });
    setNsContact(updated);
    setNsChannelValue("");
    return updated;
  };

  const onSubmit = async () => {
    if (saving) return;
    if (mode === "schedule" && !nsDueIsFuture) {
      toast.error("Choose a next-step time later than now.");
      return;
    }
    setSaving(true);
    try {
      // ----- Bulk: quick outcome + honest canned note for every row. -----
      if (isBulk && bulkIds) {
        const result = await bulkUpdateStatus.mutateAsync({
          ids: bulkIds,
          status: "completed",
          outcome: outcome as ActivityOutcome,
          completionNote: note,
        });
        // The mutation queues every candidate except this first activity,
        // which is de-duped while the bulk request remains the queue head.
        // Remove that request, then restore the first durable obligation.
        dequeue();
        const firstCandidate = result.followUpCandidates.find(
          (candidate) =>
            candidate.id === activity.id && shouldRequireFollowUp(candidate),
        );
        if (firstCandidate) {
          requestCompletion({ activity: firstCandidate, stage: "next-step" });
        }
        toast.success(`${bulkIds.length} activities marked done`);
        await head.onCompleted?.(activity);
        return;
      }

      // ----- No second half needed: single atomic save. -----
      if (!alreadyCompleted && !followUpNeeded) {
        const updated = await complete();
        await finish(updated, "Activity marked done");
        return;
      }

      // ----- Schedule (or defer — same shape, different task). -----
      if (mode === "schedule" || mode === "defer") {
        const selectedContact =
          mode === "schedule" ? await ensureNextStepContact() : null;
        const nextStep: NextStepPayload =
          mode === "defer"
            ? deferPayload()
            : {
                type: nsType,
                subject: nsSubject.trim(),
                due_at: new Date(nsDue).toISOString(),
                description: nsDescription.trim() || undefined,
                contact_id: nextStepNeedsContact
                  ? selectedContact?.id
                  : undefined,
              };
        if (alreadyCompleted) {
          await createFollowUp(nextStep, selectedContact);
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
          const reengageIso = new Date(`${nurtureDate}T09:00:00`).toISOString();
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
          const reason =
            disqualifyReason === "Other"
              ? otherReason.trim()
              : disqualifyReason;
          const evidence = richTextToPlain(note).trim();
          if (canDisqualifyDirectly) {
            await updateLead.mutateAsync({
              id: activity.lead_id as string,
              data: {
                status: "Disqualified",
                disqualify_reason: disqualifyReason,
                disqualification_note: evidence,
                ...(disqualifyReason === "Other" && {
                  other_value: otherReason.trim(),
                }),
              },
            });
          } else {
            await createDisqualifyRequest.mutateAsync({
              leadId: activity.lead_id as string,
              data: {
                kind: "tactical_disqualify",
                reason,
                notes: evidence,
              },
            });
            if (alreadyCompleted) {
              await createFollowUp({
                type: "task",
                subject: `Check disqualification request — ${recordName}`,
                due_at: new Date(defaultDueIso(1)).toISOString(),
                description:
                  "Confirm the sales manager's decision on the pending disqualification request.",
              });
            }
          }
          const updated = alreadyCompleted
            ? activity
            : await complete(
                canDisqualifyDirectly
                  ? undefined
                  : {
                      type: "task",
                      subject: `Check disqualification request — ${recordName}`,
                      due_at: new Date(defaultDueIso(1)).toISOString(),
                      description:
                        "Confirm the sales manager's decision on the pending disqualification request.",
                    },
              );
          await finish(
            updated,
            canDisqualifyDirectly
              ? "Lead disqualified"
              : "Disqualification sent for manager review",
          );
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
        : canDisqualifyDirectly
          ? "Disqualify lead"
          : "Request disqualification";
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
                {reusesRecordedCall ? "Recorded call" : "What happened"}
              </h3>
              {isBulk && (
                <p className="rounded-md border border-blue-200/70 bg-blue-50/60 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
                  Bulk completion takes quick outcomes only — one honest note
                  that is true for every row. For detailed outcomes, open
                  activities one at a time.
                </p>
              )}
              {hasRecordedCallOutcome ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Outcome: </span>
                  <span className="font-medium capitalize">
                    {activity.call?.outcome?.replace(/_/g, " ")}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground">
                    (reused from the call record)
                  </span>
                </div>
              ) : (
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
              )}

              {hasRecordedCallSummary ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className="mb-1 text-xs text-muted-foreground">
                    Discussion already recorded
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    {richTextToPlain(recordedCallSummary)}
                  </p>
                </div>
              ) : (
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
              )}
              {noFollowUpReason && (
                <p className="rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                  {noFollowUpReason}
                </p>
              )}
            </section>
          )}

          {/* ---------- What happens next ---------- */}
          {(alreadyCompleted || followUpNeeded) && !isBulk && (
            <section className="space-y-3 border-t pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What happens next
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "schedule" ? "default" : "outline"}
                  onClick={() => setMode("schedule")}
                >
                  Schedule it
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "defer" ? "default" : "outline"}
                  onClick={() => setMode("defer")}
                >
                  Decide later today
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "none" ? "default" : "outline"}
                  onClick={() => setMode("none")}
                >
                  No next step
                </Button>
              </div>

              {mode === "schedule" ? (
                <div className="space-y-3">
                  {suggestionApplied && !nsTouched.current && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                      Suggested from the outcome — edit anything.
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
                  {nextStepNeedsContact && (
                    <PersonPicker
                      mode="single"
                      label="Person for next step"
                      leadId={effectiveLeadId}
                      dealId={activity.deal_id}
                      value={nsContactId}
                      onChange={(contactId, contact) => {
                        setNsContactId(contactId ?? "");
                        setNsContact(contact ?? null);
                        setNsChannelValue("");
                      }}
                      required
                    />
                  )}
                  {nsContact && selectedPhoneStepWithoutPhone && (
                    <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
                      <Label htmlFor="ns-channel-phone">
                        {nsType === "whatsapp"
                          ? "WhatsApp number"
                          : "Phone number"}
                      </Label>
                      <Input
                        id="ns-channel-phone"
                        type="tel"
                        maxLength={20}
                        autoFocus
                        value={nsChannelValue}
                        onChange={(event) =>
                          setNsChannelValue(event.target.value)
                        }
                        placeholder="Enter the number to save on this contact"
                      />
                      <p className="text-xs text-muted-foreground">
                        This number will be saved to {nsContact.first_name}'s
                        contact record and used for the next step.
                      </p>
                    </div>
                  )}
                  {nsContact && selectedEmailWithoutAddress && (
                    <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
                      <Label htmlFor="ns-channel-email">Email address</Label>
                      <Input
                        id="ns-channel-email"
                        type="email"
                        autoFocus
                        value={nsChannelValue}
                        onChange={(event) =>
                          setNsChannelValue(event.target.value)
                        }
                        placeholder="Enter the email to save on this contact"
                      />
                      {nsChannelValue && !emailDraftValid && (
                        <p className="text-xs font-medium text-destructive">
                          Enter a valid email address.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        This email will be saved to {nsContact.first_name}'s
                        contact record and used for the next step.
                      </p>
                    </div>
                  )}
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
                        min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                        onChange={(e) => {
                          nsTouched.current = true;
                          setNsDue(e.target.value);
                        }}
                      />
                      {nsDue && !nsDueIsFuture && (
                        <p className="text-xs font-medium text-destructive">
                          Choose a time later than now.
                        </p>
                      )}
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
                      record keeps a future without inventing one; make the real
                      plan before end of day.
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
                        raise it with your manager or park the lead in Nurture
                        instead.
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
              Outcomes are recorded together. After this save, each active
              record opens its own mandatory next-step decision.
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
