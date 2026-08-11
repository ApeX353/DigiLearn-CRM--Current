import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarIcon,
  CheckSquare,
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
  useCreateActivity,
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
 * Anything saved here lands in the PLANNED phase (status `scheduled`) so
 * it shows up as the record's next step — the rep ticks it off later,
 * which is where outcome + follow-up get captured. "Mark as done" is the
 * escape hatch for logging something that already happened.
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

  // Uses `type` rather than `isNote`, which is declared further down.
  const bodyPlaceholder = type === "note"
    ? "Write a note…"
    : type === "call"
      ? "What was discussed / what to cover…"
      : type === "whatsapp"
        ? "The message to send…"
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
  const [markDone, setMarkDone] = useState(false);
  const [doneOutcome, setDoneOutcome] = useState<ActivityOutcome | "">("");

  // Switching composer type keeps what the rep already typed — only the
  // type-specific bits reset.
  useEffect(() => {
    setPhone(defaultPhone ?? "");
    setRecipients(defaultEmail ?? "");
  }, [type, defaultPhone, defaultEmail]);

  const isNote = type === "note";

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
    setMarkDone(false);
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
    } else if (markDone) {
      // Logging past work carries completion discipline: an outcome and a
      // readable account of what happened (the body doubles as the note).
      if (!doneOutcome) {
        toast.error("Pick an outcome — how did it go?");
        return;
      }
      if (bodyIsEmpty) {
        toast.error(
          "Describe what happened before logging this as done.",
        );
        return;
      }
    }
    if (!isNote) {
      if (!subject.trim()) {
        toast.error("Give it a short subject.");
        return;
      }
      if (!dueIso) {
        toast.error("Pick a date — every activity needs a next action.");
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

    const payload: CreateActivityDto = {
      type: (isNote ? "note" : type) as ActivityType,
      subject: isNote ? `Note: ${bodyPlain.slice(0, 40)}` : subject.trim(),
      lead_id: leadId,
      deal_id: dealId,
      // The activity is pinned to the chosen contact so the log always
      // links back to a real person record.
      contact_id: personId ?? contactId,
      ...(dueIso && { due_at: dueIso }),
      ...(assignee !== "unassigned" && { assigned_to_id: assignee }),
      // Saved work starts PLANNED so it becomes the record's next step;
      // outcome + follow-up are captured when it is ticked off.
      ...(markDone &&
        !isNote && {
          status: "completed" as const,
          completion_outcome: doneOutcome as ActivityOutcome,
          // The body is the account of what happened — one field, not two.
          completion_note: body,
        }),
      ...(isNote && { note: { content: body.trim() } }),
      ...(type === "task" && {
        description: bodyIsEmpty ? undefined : body,
        task: { status: "todo", priority: "medium" },
      }),
      ...(type === "call" && {
        call: {
          phone_number: phone.trim(),
          summary: bodyIsEmpty ? undefined : body,
          follow_up_date: dueIso,
        },
      }),
      ...(type === "whatsapp" && {
        whatsapp: {
          phone_number: phone.trim(),
          // Plain by design — see `supportsRichText`.
          message: body.trim() || subject.trim(),
          direction: "outbound",
          message_type: "text",
          follow_up_date: dueIso,
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
          start_time: dueIso as string,
          // The composer has always collected a body for meetings and then
          // dropped it on the floor. Before the meeting the body is the
          // agenda; ticking "mark as done" makes it the minutes.
          ...(!bodyIsEmpty &&
            (markDone ? { minutes_notes: body } : { agenda: body })),
        },
      }),
    };

    create.mutate(payload, {
      onSuccess: () => {
        toast.success(
          isNote
            ? "Note added"
            : markDone
              ? `${TYPE_META[type].label} logged`
              : `${TYPE_META[type].label} planned`,
        );
        reset();
        onCreated?.();
        onClose();
      },
      onError: (e) =>
        toast.error("Could not save", { description: handleApiError(e) }),
    });
  };

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
              label={type === "email" ? "To" : "Who are you calling?"}
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

        {!isNote && (
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

        {/* Logging past work is a completion like any other, so it carries
            the same discipline: an outcome, actively picked. The body text
            doubles as the account of what happened — no second note field. */}
        {markDone && !isNote && (
          <div className="flex items-center gap-2">
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
            <span className="text-xs text-muted-foreground">
              Required when logging as done
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          {!isNote ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={markDone}
                onCheckedChange={(v) => setMarkDone(Boolean(v))}
              />
              Mark as done (already happened)
            </label>
          ) : (
            <span className="text-xs text-muted-foreground">
              Notes don’t need a follow-up date.
            </span>
          )}

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
