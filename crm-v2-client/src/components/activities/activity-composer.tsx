import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarIcon,
  CheckSquare,
  History,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ACTIVITY_OUTCOMES,
  ACTIVITY_OUTCOME_LABELS,
  fetchActivityById,
  useCreateActivity,
  type Activity,
  type ActivityOutcome,
  type ActivityType,
  type CreateActivityDto,
} from "~/api/activities";
import { useStaff } from "~/api/users";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import {
  RichTextEditor,
  type MentionOption,
} from "~/components/ui/rich-text-editor";
import { PersonPicker } from "~/components/activities/person-picker";
import { isRichTextEmpty, richTextToPlain } from "~/lib/rich-text";
import { handleApiError } from "~/api/axios";
import { shouldRequireFollowUp } from "~/lib/follow-up-policy";
import {
  isOverdueOrDueToday,
  siblingWhen,
  useOpenSiblings,
} from "~/lib/use-open-siblings";
import { useActivityCompletionStore } from "~/stores/use-activity-completion-store";
import { formatActivityMoment } from "~/components/activities/activity-kit";
import { getActivityLabel } from "~/lib/activity-visuals";

/**
 * The activity types shown in the composer's own type strip.
 *
 * `note` is deliberately NOT here. Notes have their own tab on the record
 * page's top row — they aren't an "activity" in the pipeline sense (no
 * follow-up date, no outcome), so mixing them into the activity strip
 * made the two concepts look interchangeable. The note composer is the
 * same component, just reached from its own tab.
 */
export const COMPOSER_TYPES = [
  "call",
  "meeting",
  "task",
  "email",
  "whatsapp",
] as const;

export type ComposerType = (typeof COMPOSER_TYPES)[number] | "note";

/**
 * What the rep is doing: recording something that HAPPENED, or planning
 * something that WILL. The two used to be one form with a "mark as done"
 * checkbox at the bottom — so a rep typing up the call they just made
 * saved it as *planned* work unless they noticed the box, and the system
 * then demanded a date for a call that was already over. Reality is the
 * other way round for calls and messages: you log them after the fact.
 */
export type ComposerIntent = "happened" | "planned";

const TYPE_META: Record<
  ComposerType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  note: { label: "Note", icon: StickyNote },
  call: { label: "Call", icon: Phone },
  meeting: { label: "Meeting", icon: Users },
  task: { label: "Task", icon: CheckSquare },
  email: { label: "Email", icon: Mail },
  whatsapp: { label: "WhatsApp", icon: MessageSquare },
};

/** Calls, messages and emails are logged after the fact; meetings and
 * tasks are usually planned first. Either can be switched. */
function defaultIntent(type: ComposerType): ComposerIntent {
  return type === "call" || type === "whatsapp" || type === "email"
    ? "happened"
    : "planned";
}

interface ActivityComposerProps {
  leadId?: string;
  dealId?: string;
  /** School pages have no lead/deal; the picker falls back to this. */
  schoolId?: string;
  contactId?: string;
  /** Which composer to open on. */
  type: ComposerType;
  onTypeChange: (t: ComposerType) => void;
  onClose: () => void;
  onCreated?: () => void;
  /** Prefilled from the record's primary contact where available. */
  defaultPhone?: string;
  defaultEmail?: string;
  /**
   * ASGN2: the record owner's user id. New activities default their
   * assignee to whoever the lead/deal belongs to — an admin logging on a
   * rep's lead should not have to hunt them out of the full staff list
   * (and forgetting left the work assigned to nobody).
   */
  defaultAssigneeId?: string | null;
}

/**
 * Inline activity composer — the Pipedrive "detail view" pattern.
 *
 * The record page's Note / Call / Email / … strip used to FILTER the
 * activity log, which meant there was no way to write anything without
 * opening a separate modal. Those tabs now open this composer in place
 * instead: pick a type, fill it in, save. The log below is never filtered
 * by it.
 *
 * Two intents, made explicit at the top of the form:
 *
 *   Log what happened — the entry is HISTORY: born completed, with an
 *     outcome and the account of what was said. No date is demanded of a
 *     call that is already over. It can close the open items this same
 *     conversation settled ("This also closes: Formal meeting, due 4 Dec")
 *     so a held meeting never sits overdue because its minutes went into
 *     a separate note. If the record still owes a next step afterwards,
 *     the close-the-loop dialog asks once — and if one is already
 *     planned, it asks nothing.
 *
 *   Plan ahead — the entry is a COMMITMENT: scheduled, dated, and it
 *     becomes the record's next step. The rep ticks it off later, which is
 *     where its outcome gets captured.
 */
export function ActivityComposer({
  leadId,
  dealId,
  schoolId,
  contactId,
  type,
  onTypeChange,
  onClose,
  onCreated,
  defaultPhone,
  defaultEmail,
  defaultAssigneeId,
}: ActivityComposerProps) {
  const create = useCreateActivity();
  const requestCompletion = useActivityCompletionStore((s) => s.request);
  const { data: staffData } = useStaff({
    page: 1,
    limit: 100,
    status: "active",
  });
  const staff = staffData?.data ?? [];

  /**
   * WhatsApp bodies stay plain. The stored `message` is the text a rep pastes
   * into WhatsApp, and WhatsApp renders neither HTML nor our markup — offering
   * a Bold button there would promise formatting that silently disappears.
   */
  const supportsRichText = type !== "whatsapp";

  const mentionOptions: MentionOption[] = useMemo(
    () =>
      staff.map((m) => ({
        id: m.id,
        name:
          `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email,
        hint: m.email,
      })),
    [staff],
  );

  const isNote = type === "note";
  const [intent, setIntent] = useState<ComposerIntent>(defaultIntent(type));
  const happened = !isNote && intent === "happened";

  // Switching type re-reads the natural default; the rep can still flip it.
  useEffect(() => {
    setIntent(defaultIntent(type));
  }, [type]);

  // Uses `type` rather than `isNote`, which is declared further down.
  const bodyPlaceholder = isNote
    ? "Write a note…"
    : type === "call"
      ? happened
        ? "What was said, agreed, promised…"
        : "What to cover on the call…"
      : type === "whatsapp"
        ? happened
          ? "The message that was sent / what came back…"
          : "The message to send…"
        : type === "meeting" && happened
          ? "Minutes — what was discussed and decided…"
          : "Notes (optional)";

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("09:00");
  // ASGN2: default to the record's owner; the picker stays editable for
  // deliberate handoffs.
  const [assignee, setAssignee] = useState<string>(
    defaultAssigneeId ?? "unassigned",
  );
  useEffect(() => {
    setAssignee(defaultAssigneeId ?? "unassigned");
  }, [defaultAssigneeId]);
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [recipients, setRecipients] = useState(defaultEmail ?? "");
  /** The contact the call/WhatsApp/email is with — chosen, never typed. */
  const [personId, setPersonId] = useState<string | undefined>(contactId);
  const [doneOutcome, setDoneOutcome] = useState<ActivityOutcome | "">("");
  /** "This also closes…" — ids of open siblings the logged work settled. */
  const [closes, setCloses] = useState<Set<string>>(new Set());
  const [closesTouched, setClosesTouched] = useState(false);

  // What else is open on this record — only fetched while logging history,
  // which is the only time it can be closed from here.
  const { siblings, dated: datedSiblings } = useOpenSiblings({
    leadId,
    dealId,
    contactId,
    enabled: happened,
  });

  // Sensible default for "this also closes": the same kind of thing, due
  // today or already overdue — i.e. the scheduled call/meeting this entry
  // is almost certainly the record of. Anything else is opt-in. Re-derived
  // when the type changes until the rep touches the list.
  //
  // Only when the candidate is UNIQUE. With one overdue scheduled call on
  // the record, the call being logged is almost certainly it. With five,
  // guessing would close work the rep never touched — so nothing is
  // pre-ticked and the rep chooses.
  useEffect(() => {
    if (closesTouched) return;
    const candidates = siblings.filter(
      (s) => s.type === type && isOverdueOrDueToday(s),
    );
    setCloses(new Set(candidates.length === 1 ? [candidates[0].id] : []));
  }, [siblings, type, closesTouched]);

  // Switching composer type keeps what the rep already typed — only the
  // type-specific bits reset.
  useEffect(() => {
    setPhone(defaultPhone ?? "");
    setRecipients(defaultEmail ?? "");
  }, [type, defaultPhone, defaultEmail]);

  const dueIso = useMemo(() => {
    if (!due) return undefined;
    const [h, m] = time.split(":").map((n) => parseInt(n, 10));
    const d = new Date(due);
    d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
    return d.toISOString();
  }, [due, time]);

  const reset = () => {
    setSubject("");
    setBody("");
    setDue(undefined);
    setTime("09:00");
    setDoneOutcome("");
    setCloses(new Set());
    setClosesTouched(false);
  };

  const submit = () => {
    // SCH-ACT1: activities must belong to a lead or deal — the rule the old
    // create modal enforced and the composer dropped. A parentless activity
    // is orphaned (the Activity row has no school column), so it never shows
    // on the school page it was logged from, and timelines/SLA/reports all
    // miss it. School pages are a read-only rollup; log on the lead itself.
    if (!leadId && !dealId) {
      toast.error("Select a lead or deal first", {
        description:
          "Activities must belong to a CRM record so timelines, SLA, and reports stay in sync. Open one of this school's leads and log it there.",
      });
      return;
    }
    // The editor leaves `<br>` and empty paragraphs behind after a select-all
    // delete, so emptiness is decided on the rendered text, not the markup.
    const bodyIsEmpty = supportsRichText
      ? isRichTextEmpty(body)
      : !body.trim();
    // Subjects and message payloads want the words without the markup.
    const bodyPlain = richTextToPlain(body).trim();

    if (isNote) {
      if (bodyIsEmpty) {
        toast.error("Write the note before saving.");
        return;
      }
    } else if (happened) {
      // Logging past work carries completion discipline: an outcome and a
      // readable account of what happened (the body doubles as the note).
      if (!doneOutcome) {
        toast.error("Pick an outcome — how did it go?");
        return;
      }
      if (bodyIsEmpty) {
        toast.error("Describe what happened before logging it.");
        return;
      }
    }
    if (!isNote) {
      if (!subject.trim()) {
        toast.error("Give it a short subject.");
        return;
      }
      // A plan needs a date. A record of something that already happened
      // does not — that was the rule that forced reps to invent a
      // follow-up date for every logged call.
      if (!happened && !dueIso) {
        toast.error("Pick a date — every planned activity needs one.");
        return;
      }
      if (type === "call" || type === "whatsapp" || type === "email") {
        if (!personId) {
          toast.error("Choose who this is with.");
          return;
        }
        if ((type === "call" || type === "whatsapp") && !phone.trim()) {
          toast.error(
            "That contact has no phone number on file. Add one to their record first.",
          );
          return;
        }
        if (type === "email" && !recipients.trim()) {
          toast.error(
            "That contact has no email address on file. Add one to their record first.",
          );
          return;
        }
      }
    }

    // A logged meeting still needs a start time for its calendar row; if
    // the rep didn't say when, it was today.
    const happenedAt = dueIso ?? new Date().toISOString();
    const closesList = Array.from(closes);

    const payload: CreateActivityDto = {
      type: (isNote ? "note" : type) as ActivityType,
      subject: isNote ? `Note: ${bodyPlain.slice(0, 40)}` : subject.trim(),
      lead_id: leadId,
      deal_id: dealId,
      // The activity is pinned to the chosen contact so the log always
      // links back to a real person record.
      contact_id: personId ?? contactId,
      // Planned work carries its date; history carries none (it is not a
      // next step — the record's next step is decided separately).
      ...(!happened && dueIso && { due_at: dueIso }),
      ...(assignee !== "unassigned" && { assigned_to_id: assignee }),
      ...(happened && {
        status: "completed" as const,
        completion_outcome: doneOutcome as ActivityOutcome,
        // The body is the account of what happened — one field, not two.
        completion_note: body,
        ...(closesList.length > 0 && { closes: closesList }),
      }),
      ...(isNote && { note: { content: body.trim() } }),
      ...(type === "task" && {
        description: bodyIsEmpty ? undefined : body,
        task: { status: happened ? "done" : "todo", priority: "medium" },
      }),
      ...(type === "call" && {
        call: {
          phone_number: phone.trim(),
          summary: bodyIsEmpty ? undefined : body,
          // Only a PLAN carries a follow-up date here. On a logged call the
          // server used to turn this date into an automatic "Follow-up:"
          // task nobody asked for.
          ...(!happened && { follow_up_date: dueIso }),
        },
      }),
      ...(type === "whatsapp" && {
        whatsapp: {
          phone_number: phone.trim(),
          // Plain by design — see `supportsRichText`.
          message: body.trim() || subject.trim(),
          direction: "outbound",
          message_type: "text",
          ...(!happened && { follow_up_date: dueIso }),
        },
      }),
      ...(type === "email" && {
        email: {
          to_recipients: recipients.trim(),
          subject: subject.trim(),
          body: bodyIsEmpty ? subject.trim() : body,
        },
      }),
      ...(type === "meeting" && {
        meeting: {
          title: subject.trim(),
          platform: "in_person",
          start_time: happened ? happenedAt : (dueIso as string),
          // Before the meeting the body is the agenda; afterwards it is
          // the minutes.
          ...(!bodyIsEmpty &&
            (happened ? { minutes_notes: body } : { agenda: body })),
        },
      }),
    };

    create.mutate(payload, {
      onSuccess: async (created) => {
        const label = TYPE_META[type].label;
        reset();
        onCreated?.();
        onClose();

        if (isNote) {
          toast.success("Note added");
          return;
        }
        if (!happened) {
          toast.success(`${label} planned`);
          return;
        }

        // History is saved. Does the RECORD still owe a next step? Only if
        // (a) the policy says this kind of completion needs one and (b)
        // nothing dated is planned on the record once the covered items
        // are closed. If a next step already exists, say so and stop —
        // no second chain of follow-ups for one line of communication.
        const remaining = datedSiblings.filter((s) => !closes.has(s.id));
        const closedNote =
          closesList.length > 0
            ? ` · closed ${closesList.length} covered ${
                closesList.length === 1 ? "item" : "items"
              }`
            : "";
        if (remaining.length > 0) {
          const next = remaining[0];
          const when = siblingWhen(next);
          toast.success(`${label} logged${closedNote}`, {
            description: `Next step already planned: ${next.subject}${
              when ? ` · ${formatActivityMoment(when)}` : ""
            }`,
          });
          return;
        }
        // Relations (lead/deal terminal state) only come from the GET;
        // if it fails, err on the side of asking — a skippable dialog on
        // a closed record beats silently dropping the next-step decision.
        let full: Activity;
        try {
          full = await fetchActivityById(created.id);
        } catch {
          full = created;
        }
        if (shouldRequireFollowUp(full)) {
          toast.success(`${label} logged${closedNote}`, {
            description: "Nothing is planned next on this record — decide the next step.",
          });
          requestCompletion({ activity: full, stage: "next-step" });
        } else {
          toast.success(`${label} logged${closedNote}`);
        }
      },
      onError: (e) =>
        toast.error("Could not save", { description: handleApiError(e) }),
    });
  };

  const closableSiblings = siblings.slice(0, 8);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Type strip — activities only. A note reached from its own tab
          shows a plain heading instead, since there is nothing to switch
          between. */}
      <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1.5">
        {isNote ? (
          <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-primary">
            <StickyNote className="h-3.5 w-3.5" />
            Note
          </span>
        ) : (
          COMPOSER_TYPES.map((t) => {
            const M = TYPE_META[t];
            const active = t === type;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onTypeChange(t)}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <M.icon className="h-3.5 w-3.5" />
                {M.label}
              </button>
            );
          })
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 shrink-0"
          onClick={onClose}
          aria-label="Close composer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 p-3">
        {/* Intent — the first decision, not a checkbox at the bottom. */}
        {!isNote && (
          <div
            role="radiogroup"
            aria-label="Is this a record or a plan?"
            className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs"
          >
            <button
              type="button"
              role="radio"
              aria-checked={intent === "happened"}
              onClick={() => setIntent("happened")}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
                intent === "happened"
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              Log what happened
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={intent === "planned"}
              onClick={() => setIntent("planned")}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
                intent === "planned"
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Plan ahead
            </button>
          </div>
        )}

        {!isNote && (
          <Input
            autoFocus
            placeholder={`${TYPE_META[type].label} subject`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        )}

        {/* Phone numbers and email addresses are never typed free-hand —
            the rep picks a person already on this lead / deal / school and
            we read their stored number or address. That keeps every
            activity attached to a real contact record and stops
            unreachable typo'd numbers entering the log. */}
        {(type === "call" || type === "whatsapp" || type === "email") && (
          <div>
            <PersonPicker
              mode="single"
              label={
                type === "email"
                  ? "To"
                  : happened
                    ? "Who did you speak to?"
                    : "Who are you calling?"
              }
              leadId={leadId}
              dealId={dealId}
              schoolId={schoolId}
              value={personId}
              onChange={(id, contact) => {
                setPersonId(id);
                setPhone(contact?.phone ?? contact?.whatsapp_number ?? "");
                setRecipients(contact?.email ?? "");
              }}
              required
            />
            {personId && (
              <p className="mt-1 text-xs text-muted-foreground">
                {type === "email"
                  ? recipients || "This contact has no email on file"
                  : phone || "This contact has no phone number on file"}
              </p>
            )}
          </div>
        )}

        {supportsRichText ? (
          <RichTextEditor
            autoFocus={isNote}
            minHeight={isNote ? 120 : 76}
            placeholder={bodyPlaceholder}
            value={body}
            onChange={setBody}
            mentions={mentionOptions}
            surfaceClassName={
              isNote ? "bg-amber-50/60 dark:bg-amber-950/20" : ""
            }
          />
        ) : (
          <Textarea
            rows={3}
            placeholder={bodyPlaceholder}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        )}

        {/* Logging past work is a completion like any other, so it carries
            the same discipline: an outcome, actively picked. The body text
            doubles as the account of what happened — no second note field. */}
        {happened && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={doneOutcome}
              onValueChange={(v) => setDoneOutcome(v as ActivityOutcome)}
            >
              <SelectTrigger className="h-8 w-56">
                <SelectValue placeholder="Outcome — how did it go?" />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_OUTCOMES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ACTIVITY_OUTCOME_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {type === "meeting" && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 font-normal"
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {due ? format(due, "MMM d, yyyy") : "When was it? (today)"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={due}
                      onSelect={setDue}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-8 w-[110px]"
                />
              </>
            )}
          </div>
        )}

        {/* "This also closes…" — the scheduled items this same conversation
            settled. The held meeting gets completed by its own minutes
            instead of going overdue while a note records what happened;
            the "follow up on training" task gets closed by the call that
            covered training. One conversation, one set of closures. */}
        {happened && closableSiblings.length > 0 && (
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <p className="text-xs font-medium">
              This also closes…{" "}
              <span className="font-normal text-muted-foreground">
                open items on this record that this {TYPE_META[type].label.toLowerCase()} covered
              </span>
            </p>
            <ul className="mt-1.5 space-y-1">
              {closableSiblings.map((s) => {
                const when = siblingWhen(s);
                const late = isOverdueOrDueToday(s);
                return (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={closes.has(s.id)}
                        onCheckedChange={(v) => {
                          setClosesTouched(true);
                          setCloses((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(s.id);
                            else next.delete(s.id);
                            return next;
                          });
                        }}
                      />
                      <span className="min-w-0">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          {getActivityLabel(s.type)}
                        </span>{" "}
                        <span className="truncate">{s.subject}</span>
                        <span
                          className={`ml-1.5 text-xs ${
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
              {siblings.length > closableSiblings.length && (
                <li className="text-xs text-muted-foreground">
                  +{siblings.length - closableSiblings.length} more open on this
                  record — close those from the log.
                </li>
              )}
            </ul>
          </div>
        )}

        {!isNote && !happened && (
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 font-normal"
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {due ? format(due, "MMM d, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={due}
                  onSelect={setDue}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-8 w-[110px]"
            />

            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="h-8 w-[190px]">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {staff.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {`${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() ||
                      m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-muted-foreground">
            {isNote
              ? "Notes are records — they never need a follow-up date."
              : happened
                ? "Saved as done. If nothing is planned next on this record, you'll be asked once."
                : "Saved as the record's next step — tick it off later to capture the outcome."}
          </span>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={create.isPending}>
              {create.isPending
                ? "Saving…"
                : happened
                  ? `Log ${TYPE_META[type].label.toLowerCase()}`
                  : isNote
                    ? "Save"
                    : `Plan ${TYPE_META[type].label.toLowerCase()}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
