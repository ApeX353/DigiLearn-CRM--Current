import { Link } from "react-router";
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Link2,
  Loader2,
  Phone,
  Users,
} from "lucide-react";
import { useActivity } from "~/api/activities";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "~/components/ui/sheet";
import { getActivityVisual } from "~/lib/activity-visuals";
import { formatDateTime } from "~/lib/date-helpers";

interface ActivityDetailsSheetProps {
  activityId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatEnumLabel(value?: string | null) {
  if (!value) return "--";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(first?: string, last?: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

/** Compact definition row — hidden entirely when the value is empty. */
function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === "" || value === "--") return null;
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words font-medium text-foreground">{value}</span>
    </div>
  );
}

/** A titled card block for a group of fields. */
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
      </div>
      <div className="px-4 py-2">{children}</div>
    </div>
  );
}

function PersonChip({
  first,
  last,
}: {
  first?: string;
  last?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
        {initials(first, last)}
      </span>
      {`${first ?? ""} ${last ?? ""}`.trim() || "--"}
    </span>
  );
}

function tryParseArray(value?: string | null): any[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function ActivityDetailsSheet({
  activityId,
  open,
  onOpenChange,
}: ActivityDetailsSheetProps) {
  const { data: activity, isLoading } = useActivity(activityId || "");
  const visual = getActivityVisual(activity?.type);
  const Icon = visual.icon;

  // The primary body people open the activity to read — surfaced up top.
  const bodyText =
    activity?.note?.content ||
    activity?.whatsapp?.message ||
    activity?.call?.summary ||
    activity?.meeting?.minutes_notes ||
    activity?.meeting?.agenda ||
    activity?.email?.body ||
    activity?.description ||
    null;
  const bodyLabel = activity?.note
    ? "Note"
    : activity?.whatsapp
      ? "Message"
      : activity?.call
        ? "Call summary"
        : activity?.meeting
          ? activity.meeting.minutes_notes
            ? "Minutes"
            : "Agenda"
          : activity?.email
            ? "Email body"
            : "Details";

  const checklist = tryParseArray(activity?.task?.checklist_items);
  const attendees = tryParseArray(activity?.meeting?.attendees);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
      >
        {!activityId ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <SheetTitle className="sr-only">Activity details</SheetTitle>
            <SheetDescription className="sr-only">No activity selected</SheetDescription>
            Select an activity to view details
          </div>
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center">
            <SheetTitle className="sr-only">Activity details</SheetTitle>
            <SheetDescription className="sr-only">Loading</SheetDescription>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !activity ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <SheetTitle className="sr-only">Activity details</SheetTitle>
            <SheetDescription className="sr-only">Not found</SheetDescription>
            Activity not found
          </div>
        ) : (
          <>
            {/* ---------- Header ---------- */}
            <div className="sticky top-0 z-10 border-b bg-background/95 px-5 pb-4 pt-5 backdrop-blur">
              <div className="flex items-start gap-3.5 pr-8">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${visual.tile}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-lg font-semibold leading-snug">
                    {activity.subject}
                  </SheetTitle>
                  <SheetDescription className="sr-only">
                    {visual.label} activity details
                  </SheetDescription>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${visual.chip}`}
                    >
                      {visual.label}
                    </span>
                    <span className="inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {formatEnumLabel(activity.status)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {formatDateTime(activity.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ---------- Body ---------- */}
            <div className="space-y-4 px-5 py-5">
              {/* Primary content card */}
              {bodyText ? (
                <div className="rounded-xl border bg-muted/40 p-4">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {bodyLabel}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {bodyText}
                  </p>
                </div>
              ) : null}

              {/* eea1c4ae: outcome/note captured at completion (e.g. for a
                  task closed via the outcome dialog) were saved but never
                  shown. Kept through the sheet redesign, in its idiom. */}
              {((activity as { completion_outcome?: string })
                .completion_outcome ||
                (activity as { completion_note?: string }).completion_note) && (
                <Section title="Outcome" icon={CheckCircle2}>
                  <Field
                    label="Outcome"
                    value={formatEnumLabel(
                      (activity as { completion_outcome?: string })
                        .completion_outcome,
                    )}
                  />
                  {(activity as { completion_note?: string })
                    .completion_note ? (
                    <p className="py-1.5 text-sm text-muted-foreground whitespace-pre-wrap">
                      {
                        (activity as { completion_note?: string })
                          .completion_note
                      }
                    </p>
                  ) : null}
                </Section>
              )}

              {/* Schedule */}
              {(activity.scheduled_at ||
                activity.due_at ||
                activity.completed_at ||
                activity.duration != null) && (
                <Section title="Schedule" icon={CalendarClock}>
                  <Field
                    label="Scheduled"
                    value={formatDateTime(activity.scheduled_at)}
                  />
                  <Field label="Due" value={formatDateTime(activity.due_at)} />
                  <Field
                    label="Completed"
                    value={formatDateTime(activity.completed_at)}
                  />
                  <Field
                    label="Duration"
                    value={
                      activity.duration != null
                        ? `${activity.duration} mins`
                        : null
                    }
                  />
                </Section>
              )}

              {/* Task */}
              {activity.task ? (
                <Section title="Task" icon={ClipboardList}>
                  <Field
                    label="Status"
                    value={formatEnumLabel(activity.task.status)}
                  />
                  <Field
                    label="Priority"
                    value={formatEnumLabel(activity.task.priority)}
                  />
                  <Field
                    label="Est. hours"
                    value={activity.task.estimated_hours ?? null}
                  />
                  <Field label="Tags" value={activity.task.tags} />
                  {checklist && checklist.length > 0 ? (
                    <div className="py-1.5">
                      <p className="mb-1 text-sm text-muted-foreground">
                        Checklist
                      </p>
                      <ul className="space-y-1">
                        {checklist.map((item: any, i: number) => (
                          <li
                            key={i}
                            className="flex items-center gap-2 text-sm"
                          >
                            <CheckCircle2
                              className={`h-4 w-4 shrink-0 ${
                                item?.completed
                                  ? "text-emerald-500"
                                  : "text-muted-foreground/40"
                              }`}
                            />
                            <span
                              className={
                                item?.completed
                                  ? "text-muted-foreground line-through"
                                  : ""
                              }
                            >
                              {item?.text ?? String(item)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Section>
              ) : null}

              {/* Meeting */}
              {activity.meeting ? (
                <Section title="Meeting" icon={Users}>
                  <Field label="Title" value={activity.meeting.title} />
                  <Field
                    label="Platform"
                    value={formatEnumLabel(activity.meeting.platform)}
                  />
                  <Field
                    label="Start"
                    value={formatDateTime(activity.meeting.start_time)}
                  />
                  <Field
                    label="End"
                    value={formatDateTime(activity.meeting.end_time)}
                  />
                  <Field label="Location" value={activity.meeting.location} />
                  <Field
                    label="Attendees"
                    value={
                      attendees
                        ? `${attendees.length} attendee${attendees.length === 1 ? "" : "s"}`
                        : activity.meeting.attendees
                    }
                  />
                  <Field
                    label="Meeting link"
                    value={
                      activity.meeting.meeting_link ? (
                        <a
                          href={activity.meeting.meeting_link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Join
                        </a>
                      ) : null
                    }
                  />
                  <Field label="Dial in" value={activity.meeting.dial_in_number} />
                </Section>
              ) : null}

              {/* Call */}
              {activity.call ? (
                <Section title="Call" icon={Phone}>
                  <Field
                    label="Phone"
                    value={activity.call.phone_number}
                  />
                  <Field
                    label="Outcome"
                    value={formatEnumLabel(activity.call.outcome)}
                  />
                  <Field
                    label="Duration"
                    value={
                      activity.call.duration != null
                        ? `${activity.call.duration} mins`
                        : null
                    }
                  />
                  <Field label="Notes" value={activity.call.notes} />
                  <Field label="Next steps" value={activity.call.next_steps} />
                  <Field
                    label="Follow up"
                    value={
                      activity.call.follow_up_required
                        ? formatDateTime(activity.call.follow_up_date) || "Yes"
                        : null
                    }
                  />
                </Section>
              ) : null}

              {/* Email */}
              {activity.email ? (
                <Section title="Email" icon={CalendarClock}>
                  <Field label="To" value={activity.email.to_recipients} />
                  <Field label="Cc" value={activity.email.cc_recipients} />
                  <Field label="Bcc" value={activity.email.bcc_recipients} />
                  <Field label="Subject" value={activity.email.subject} />
                </Section>
              ) : null}

              {/* WhatsApp */}
              {activity.whatsapp ? (
                <Section title="WhatsApp" icon={CheckCircle2}>
                  <Field
                    label="Direction"
                    value={formatEnumLabel(activity.whatsapp.direction)}
                  />
                  <Field
                    label="Type"
                    value={formatEnumLabel(activity.whatsapp.message_type)}
                  />
                  <Field
                    label="Status"
                    value={formatEnumLabel(activity.whatsapp.status)}
                  />
                  <Field label="Phone" value={activity.whatsapp.phone_number} />
                </Section>
              ) : null}

              {/* People & links */}
              <Section title="People & links" icon={Users}>
                <Field
                  label="Created by"
                  value={
                    activity.created_by ? (
                      <PersonChip
                        first={activity.created_by.first_name}
                        last={activity.created_by.last_name}
                      />
                    ) : null
                  }
                />
                <Field
                  label="Assigned to"
                  value={
                    activity.assigned_to ? (
                      <PersonChip
                        first={activity.assigned_to.first_name}
                        last={activity.assigned_to.last_name}
                      />
                    ) : null
                  }
                />
                {(activity.lead_id || activity.deal_id) && (
                  <div className="flex flex-wrap gap-2 py-1.5">
                    {activity.lead_id ? (
                      <Link
                        to={`/leads/${activity.lead_id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
                      >
                        <Users className="h-3.5 w-3.5" />
                        Open lead
                      </Link>
                    ) : null}
                    {activity.deal_id ? (
                      <Link
                        to={`/deals/${activity.deal_id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
                      >
                        <Briefcase className="h-3.5 w-3.5" />
                        Open deal
                      </Link>
                    ) : null}
                  </div>
                )}
              </Section>

              {/* Footer timestamps */}
              <div className="flex flex-wrap gap-x-5 gap-y-1 px-1 pt-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Created {formatDateTime(activity.created_at)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5" />
                  Updated {formatDateTime(activity.updated_at)}
                </span>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
