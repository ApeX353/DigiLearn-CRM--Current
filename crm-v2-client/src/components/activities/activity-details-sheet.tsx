import { Link } from "react-router";
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  User,
  Users,
} from "lucide-react";
import { useActivity } from "~/api/activities";
import { Badge } from "~/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Separator } from "~/components/ui/separator";
import { TYPE_CONFIG } from "~/data";
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

function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  if (!value) return null;

  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 text-sm">
      <p className="text-muted-foreground">{label}</p>
      <div className="break-words">{value}</div>
    </div>
  );
}

export function ActivityDetailsSheet({
  activityId,
  open,
  onOpenChange,
}: ActivityDetailsSheetProps) {
  const { data: activity, isLoading } = useActivity(activityId || "");

  const typeConfig = activity ? TYPE_CONFIG[activity.type] : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        {!activityId ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select an activity to view details
          </div>
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !activity ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Activity not found
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-3">
              <div className="flex items-center gap-2">
                {typeConfig && (
                  <Badge variant="secondary">{typeConfig.label}</Badge>
                )}
                <Badge variant="outline">{formatEnumLabel(activity.status)}</Badge>
              </div>
              <SheetTitle className="text-xl">{activity.subject}</SheetTitle>
              <SheetDescription>
                Created {formatDateTime(activity.created_at)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-6">
              {activity.description ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {activity.description}
                </p>
              ) : null}

              {/* eea1c4ae: outcome/note captured at completion (e.g. for a
                  task closed via the outcome dialog) were saved but never
                  shown. Surface them here so they aren't lost from view. */}
              {(activity as { completion_outcome?: string }).completion_outcome ||
              (activity as { completion_note?: string }).completion_note ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Outcome</h4>
                    {(activity as { completion_outcome?: string })
                      .completion_outcome ? (
                      <InfoRow
                        label="Outcome"
                        value={formatEnumLabel(
                          (activity as { completion_outcome?: string })
                            .completion_outcome,
                        )}
                      />
                    ) : null}
                    {(activity as { completion_note?: string })
                      .completion_note ? (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {
                          (activity as { completion_note?: string })
                            .completion_note
                        }
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}

              <Separator />

              <div className="space-y-2">
                <h4 className="font-medium text-sm">Schedule</h4>
                <InfoRow
                  label="Scheduled"
                  value={formatDateTime(activity.scheduled_at)}
                />
                <InfoRow label="Due" value={formatDateTime(activity.due_at)} />
                <InfoRow
                  label="Completed"
                  value={formatDateTime(activity.completed_at)}
                />
                <InfoRow
                  label="Duration"
                  value={
                    activity.duration != null ? `${activity.duration} mins` : "--"
                  }
                />
              </div>

              {activity.task ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Task Details</h4>
                    <InfoRow
                      label="Status"
                      value={formatEnumLabel(activity.task.status)}
                    />
                    <InfoRow
                      label="Priority"
                      value={formatEnumLabel(activity.task.priority)}
                    />
                    <InfoRow
                      label="Est. Hours"
                      value={
                        activity.task.estimated_hours != null
                          ? activity.task.estimated_hours
                          : "--"
                      }
                    />
                    <InfoRow label="Tags" value={activity.task.tags} />
                    <InfoRow
                      label="Checklist"
                      value={activity.task.checklist_items}
                    />
                  </div>
                </>
              ) : null}

              {activity.meeting ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Meeting Details</h4>
                    <InfoRow label="Title" value={activity.meeting.title} />
                    <InfoRow
                      label="Platform"
                      value={formatEnumLabel(activity.meeting.platform)}
                    />
                    <InfoRow
                      label="Start"
                      value={formatDateTime(activity.meeting.start_time)}
                    />
                    <InfoRow
                      label="End"
                      value={formatDateTime(activity.meeting.end_time)}
                    />
                    <InfoRow label="Location" value={activity.meeting.location} />
                    <InfoRow
                      label="Meeting Link"
                      value={
                        activity.meeting.meeting_link ? (
                          <a
                            href={activity.meeting.meeting_link}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            Open meeting link
                          </a>
                        ) : (
                          "--"
                        )
                      }
                    />
                    <InfoRow label="Dial In" value={activity.meeting.dial_in_number} />
                    <InfoRow label="Attendees" value={activity.meeting.attendees} />
                    <InfoRow label="Agenda" value={activity.meeting.agenda} />
                    <InfoRow
                      label="Minutes"
                      value={activity.meeting.minutes_notes}
                    />
                  </div>
                </>
              ) : null}

              {activity.call ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Call Details</h4>
                    <InfoRow label="Phone" value={activity.call.phone_number} />
                    <InfoRow
                      label="Outcome"
                      value={formatEnumLabel(activity.call.outcome)}
                    />
                    <InfoRow
                      label="Duration"
                      value={
                        activity.call.duration != null
                          ? `${activity.call.duration} mins`
                          : "--"
                      }
                    />
                    <InfoRow label="Summary" value={activity.call.summary} />
                    <InfoRow label="Notes" value={activity.call.notes} />
                    <InfoRow
                      label="Follow Up"
                      value={
                        activity.call.follow_up_required
                          ? formatDateTime(activity.call.follow_up_date)
                          : "No"
                      }
                    />
                  </div>
                </>
              ) : null}

              {activity.email ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Email Details</h4>
                    <InfoRow label="To" value={activity.email.to_recipients} />
                    <InfoRow label="CC" value={activity.email.cc_recipients} />
                    <InfoRow label="BCC" value={activity.email.bcc_recipients} />
                    <InfoRow label="Subject" value={activity.email.subject} />
                    <InfoRow label="Body" value={activity.email.body} />
                  </div>
                </>
              ) : null}

              {activity.note ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Note</h4>
                    <p className="text-sm whitespace-pre-wrap">
                      {activity.note.content}
                    </p>
                  </div>
                </>
              ) : null}

              {activity.whatsapp ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">WhatsApp Details</h4>
                    <InfoRow
                      label="Direction"
                      value={formatEnumLabel(activity.whatsapp.direction)}
                    />
                    <InfoRow
                      label="Type"
                      value={formatEnumLabel(activity.whatsapp.message_type)}
                    />
                    <InfoRow
                      label="Status"
                      value={formatEnumLabel(activity.whatsapp.status)}
                    />
                    <InfoRow
                      label="Phone"
                      value={activity.whatsapp.phone_number}
                    />
                    <InfoRow label="Message" value={activity.whatsapp.message} />
                  </div>
                </>
              ) : null}

              <Separator />

              <div className="space-y-2">
                <h4 className="font-medium text-sm">Relationships</h4>
                <InfoRow
                  label="Created By"
                  value={
                    activity.created_by
                      ? `${activity.created_by.first_name} ${activity.created_by.last_name}`
                      : "--"
                  }
                />
                <InfoRow
                  label="Assigned To"
                  value={
                    activity.assigned_to
                      ? `${activity.assigned_to.first_name} ${activity.assigned_to.last_name}`
                      : "--"
                  }
                />
                <InfoRow
                  label="Lead"
                  value={
                    activity.lead_id ? (
                      <Link
                        to={`/leads/${activity.lead_id}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Users className="h-4 w-4" />
                        Open Lead
                      </Link>
                    ) : (
                      "--"
                    )
                  }
                />
                <InfoRow
                  label="Deal"
                  value={
                    activity.deal_id ? (
                      <Link
                        to={`/deals/${activity.deal_id}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Briefcase className="h-4 w-4" />
                        Open Deal
                      </Link>
                    ) : (
                      "--"
                    )
                  }
                />
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                <div className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Created: {formatDateTime(activity.created_at)}
                </div>
                <div className="inline-flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5" />
                  Updated: {formatDateTime(activity.updated_at)}
                </div>
                <div className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Status: {formatEnumLabel(activity.status)}
                </div>
                <div className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  ID: {activity.id}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
