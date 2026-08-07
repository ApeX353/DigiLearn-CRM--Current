import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { format } from "date-fns";
import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  useActivity,
  useUpdateActivity,
  type Activity,
  type UpdateActivityDto,
} from "~/api/activities";
import { TASK_PRIORITIES, TASK_STATUSES } from "~/api/activities/types";
import { useStaff } from "~/api/users";
import { Button } from "~/components/ui/button";
import {
  RichTextEditor,
  RichTextView,
} from "~/components/ui/rich-text-editor";
import { Calendar } from "~/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog";
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
import { getActivityVisual } from "~/lib/activity-visuals";
import { formatDateTime } from "~/lib/date-helpers";
import {
  getNextActionDate,
  isMissingNextAction,
  isNextActionExempt,
} from "~/lib/activity-next-action";

interface ActivityDocumentModalProps {
  activityId: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isReadonly?: boolean;
  /**
   * `inline` renders the same page expanded inside the activity log
   * instead of floating it over the record. Reps asked for this: an
   * overlay hides the very list they are working through, so opening an
   * activity meant losing their place.
   */
  variant?: "modal" | "inline";
  /** Optional prev/next stepping through the surrounding list. */
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

function formatEnumLabel(value?: string | null) {
  if (!value) return "--";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseValidDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Click-to-edit text. Reads as plain document text until you click it,
 * then becomes an input. Saves on blur and Enter, reverts on Escape —
 * there is deliberately no Save button anywhere on this page.
 */
function InlineText({
  value,
  onSave,
  placeholder,
  disabled,
  className = "",
  inputClassName = "",
  multiline = false,
  rows = 6,
  rich = false,
}: {
  value?: string | null;
  onSave: (next: string) => void;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  multiline?: boolean;
  rows?: number;
  /**
   * Body fields carry composer markup. Editing one through a plain textarea
   * would show the reader raw tags and save them back as literal text, so the
   * rich fields get the same editor that wrote them.
   */
  rich?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === (value ?? "").trim()) return;
    onSave(next);
  };

  if (disabled) {
    return (
      <div className={className}>
        {value?.trim() ? (
          rich ? (
            <RichTextView value={value} />
          ) : (
            <span className="whitespace-pre-wrap">{value}</span>
          )
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </div>
    );
  }

  if (editing && rich) {
    // Blur-to-save cannot work here: every toolbar button and popover blurs
    // the surface, so the field would commit half-formatted the first time
    // someone reached for Bold. Rich fields commit explicitly instead.
    return (
      <div className={className}>
        <RichTextEditor
          autoFocus
          value={draft}
          onChange={setDraft}
          placeholder={placeholder}
          minHeight={rows * 22}
          className="border-primary/40 ring-2 ring-primary/15"
        />
        <div className="mt-1.5 flex justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => {
              setDraft(value ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" className="h-7" onClick={commit}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (editing) {
    const shared = {
      ref: ref as never,
      value: draft,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (
        e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => {
        if (e.key === "Escape") {
          // Escape means "abandon this field", not "close the activity".
          // Without stopPropagation it reaches the Dialog and shuts the
          // whole page, losing the reader's place in the list.
          e.preventDefault();
          e.stopPropagation();
          setDraft(value ?? "");
          setEditing(false);
        }
        if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          commit();
        }
      },
      className: `w-full resize-y rounded-md border border-primary/40 bg-background px-2 py-1 outline-none ring-2 ring-primary/15 ${inputClassName}`,
      placeholder,
    };
    return multiline ? (
      <textarea {...shared} rows={rows} />
    ) : (
      <input {...shared} />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={`-mx-2 cursor-text rounded-md px-2 py-1 transition-colors hover:bg-muted/60 ${className}`}
      title="Click to edit"
    >
      {value?.trim() ? (
        rich ? (
          <RichTextView value={value} />
        ) : (
          <span className="whitespace-pre-wrap">{value}</span>
        )
      ) : (
        <span className="text-muted-foreground">{placeholder}</span>
      )}
    </div>
  );
}

/** Label + control row, laid out like a document's front-matter. */
function DocField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[132px_1fr] items-center gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ActivityDocumentModal({
  activityId,
  open = true,
  onOpenChange,
  isReadonly = false,
  variant = "modal",
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: ActivityDocumentModalProps) {
  const { data: activity, isLoading } = useActivity(activityId ?? "");
  const updateActivity = useUpdateActivity();
  const { data: staffData } = useStaff({
    page: 1,
    limit: 100,
    status: "active",
  });
  const staff = staffData?.data ?? [];

  const readonly = isReadonly || updateActivity.isPending;

  const save = useCallback(
    (data: UpdateActivityDto, label: string) => {
      if (!activityId) return;
      updateActivity.mutate(
        { id: activityId, data },
        {
          onSuccess: () => toast.success(label),
          onError: (err) =>
            toast.error(
              (err as { response?: { data?: { message?: string } } })?.response
                ?.data?.message || `Could not save ${label.toLowerCase()}`,
            ),
        },
      );
    },
    [activityId, updateActivity],
  );

  // J / K step through the list, matching the activity log's own ordering.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "j" && hasNext) onNext?.();
      if (e.key === "k" && hasPrev) onPrev?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hasNext, hasPrev, onNext, onPrev]);

  const isModal = variant === "modal";
  const visual = getActivityVisual(activity?.type ?? "note");
  const Icon = visual.icon;
  const missingNextAction = isMissingNextAction(activity);
  const nextActionDate = getNextActionDate(activity);

  /** The field that holds this type's next-action date. */
  const saveNextActionDate = (date: Date) => {
    const iso = date.toISOString();
    if (!activity) return;
    if (activity.type === "call") {
      save({ due_at: iso, call: { follow_up_date: iso } }, "Follow-up date");
    } else if (activity.type === "whatsapp") {
      save(
        { due_at: iso, whatsapp: { follow_up_date: iso } },
        "Follow-up date",
      );
    } else {
      save({ due_at: iso }, "Follow-up date");
    }
  };

  const bodyFieldFor = (a: Activity) => {
    switch (a.type) {
      case "note":
        return {
          label: "Note",
          value: a.note?.content,
          onSave: (v: string) => save({ note: { content: v } }, "Note"),
        };
      case "call":
        return {
          label: "Call summary",
          value: a.call?.summary,
          onSave: (v: string) => save({ call: { summary: v } }, "Summary"),
        };
      case "whatsapp":
        return {
          label: "Message",
          value: a.whatsapp?.message,
          onSave: (v: string) => save({ whatsapp: { message: v } }, "Message"),
        };
      case "email":
        return {
          label: "Email body",
          value: a.email?.body,
          onSave: (v: string) => save({ email: { body: v } }, "Email body"),
        };
      case "meeting":
        return {
          label: "Minutes",
          value: a.meeting?.minutes_notes,
          onSave: (v: string) =>
            save({ meeting: { minutes_notes: v } }, "Minutes"),
        };
      default:
        return {
          label: "Details",
          value: a.description,
          onSave: (v: string) => save({ description: v }, "Details"),
        };
    }
  };

  const inner = (
    <>
        {!activityId || isLoading || !activity ? (
          <div className="flex h-40 items-center justify-center">
            {isModal && (
              <>
                <DialogTitle className="sr-only">Activity</DialogTitle>
                <DialogDescription className="sr-only">
                  Loading activity
                </DialogDescription>
              </>
            )}
            {isLoading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-muted-foreground">Activity not found</span>
            )}
          </div>
        ) : (
          <>
            {/* ---------- Chrome: type, status, stepping, close ---------- */}
            <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2.5">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${visual.tile}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${visual.chip}`}
              >
                {visual.label}
              </span>
              <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {formatEnumLabel(activity.status)}
              </span>
              {updateActivity.isPending && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving
                </span>
              )}

              <div className="ml-auto flex items-center gap-1">
                {(onPrev || onNext) && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={!hasPrev}
                      onClick={() => onPrev?.()}
                      aria-label="Previous activity"
                      title="Previous (K)"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={!hasNext}
                      onClick={() => onNext?.()}
                      aria-label="Next activity"
                      title="Next (J)"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => onOpenChange?.(false)}
                >
                  {isModal ? "Close" : "Collapse"}
                </Button>
              </div>
            </div>

            {/* ---------- The page ---------- */}
            <div
              className={
                isModal
                  ? "overflow-y-auto bg-background px-10 py-8 sm:px-14"
                  : "overflow-y-auto bg-background px-6 py-6 sm:px-10"
              }
            >
              <div className="mx-auto w-full max-w-[640px]">
                {missingNextAction && (
                  <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      No follow-up date set — this record leaves nothing
                      scheduled. Add one below.
                    </span>
                  </div>
                )}

                {(() => {
                  const heading = (
                    <h1 className="text-2xl font-semibold leading-snug tracking-tight">
                      <InlineText
                        value={activity.subject}
                        placeholder="Untitled activity"
                        disabled={readonly}
                        onSave={(v) => v && save({ subject: v }, "Title")}
                        inputClassName="text-2xl font-semibold"
                      />
                    </h1>
                  );
                  // DialogTitle/Description need a Dialog ancestor, so
                  // they only apply to the overlay variant.
                  return isModal ? (
                    <>
                      <DialogTitle asChild>{heading}</DialogTitle>
                      <DialogDescription className="sr-only">
                        {visual.label} activity — click any field to edit
                      </DialogDescription>
                    </>
                  ) : (
                    heading
                  );
                })()}

                <p className="mt-1 px-0 text-xs text-muted-foreground">
                  Logged {formatDateTime(activity.created_at)}
                  {activity.created_by
                    ? ` by ${activity.created_by.first_name ?? ""} ${
                        activity.created_by.last_name ?? ""
                      }`.trimEnd()
                    : ""}
                </p>

                {/* ---------- Body ---------- */}
                {(() => {
                  const body = bodyFieldFor(activity);
                  return (
                    <div className="mt-7">
                      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {body.label}
                      </h2>
                      <InlineText
                        value={body.value}
                        placeholder={`Add ${body.label.toLowerCase()}…`}
                        disabled={readonly}
                        onSave={body.onSave}
                        multiline
                        rich
                        rows={8}
                        className="min-h-[7rem] text-[15px] leading-7"
                        inputClassName="text-[15px] leading-7"
                      />
                    </div>
                  );
                })()}

                <hr className="my-8 border-dashed" />

                {/* ---------- Front matter ---------- */}
                <div className="space-y-0.5">
                  <DocField label="Follow-up date">
                    <Popover>
                      <PopoverTrigger asChild disabled={readonly}>
                        <Button
                          variant="outline"
                          size="sm"
                          className={`h-8 justify-start font-normal ${
                            missingNextAction
                              ? "border-amber-400 text-amber-800 dark:text-amber-300"
                              : ""
                          }`}
                        >
                          <CalendarClock className="mr-2 h-3.5 w-3.5" />
                          {nextActionDate
                            ? format(
                                parseValidDate(nextActionDate) as Date,
                                "MMM d, yyyy",
                              )
                            : isNextActionExempt(activity)
                              ? "Not required for notes"
                              : "Set a follow-up date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={parseValidDate(nextActionDate ?? undefined)}
                          onSelect={(d) => d && saveNextActionDate(d)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </DocField>

                  <DocField label="Assignee">
                    <Select
                      disabled={readonly}
                      value={
                        activity.assigned_to_id ??
                        activity.assigned_to?.id ??
                        "unassigned"
                      }
                      onValueChange={(v) =>
                        save(
                          {
                            assigned_to_id:
                              v === "unassigned" ? null : v,
                          } as UpdateActivityDto,
                          "Assignee",
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-[240px]">
                        <SelectValue placeholder="Unassigned" />
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
                  </DocField>

                  {activity.type === "task" && (
                    <>
                      <DocField label="Task status">
                        <Select
                          disabled={readonly}
                          value={activity.task?.status ?? "todo"}
                          onValueChange={(v) =>
                            save(
                              { task: { status: v } } as UpdateActivityDto,
                              "Status",
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-[240px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {formatEnumLabel(s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </DocField>
                      <DocField label="Priority">
                        <Select
                          disabled={readonly}
                          value={activity.task?.priority ?? "medium"}
                          onValueChange={(v) =>
                            save(
                              { task: { priority: v } } as UpdateActivityDto,
                              "Priority",
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-[240px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_PRIORITIES.map((p) => (
                              <SelectItem key={p} value={p}>
                                {formatEnumLabel(p)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </DocField>
                    </>
                  )}

                  {activity.type === "call" && (
                    <DocField label="Next steps">
                      <InlineText
                        value={activity.call?.next_steps}
                        placeholder="Add the next step…"
                        disabled={readonly}
                        onSave={(v) =>
                          save({ call: { next_steps: v } }, "Next steps")
                        }
                        className="text-sm"
                      />
                    </DocField>
                  )}

                  {(activity.lead_id || activity.deal_id) && (
                    <DocField label="Linked to">
                      <div className="flex flex-wrap gap-2">
                        {activity.lead_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            asChild
                          >
                            <Link to={`/leads/${activity.lead_id}`}>
                              <Users className="mr-2 h-3.5 w-3.5" />
                              View lead
                            </Link>
                          </Button>
                        )}
                        {activity.deal_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            asChild
                          >
                            <Link to={`/deals/${activity.deal_id}`}>
                              <Briefcase className="mr-2 h-3.5 w-3.5" />
                              View deal
                            </Link>
                          </Button>
                        )}
                      </div>
                    </DocField>
                  )}
                </div>

                <p className="mt-8 text-xs text-muted-foreground">
                  {readonly
                    ? "This is a record of what happened — it can't be edited."
                    : "Changes save automatically."}
                </p>
              </div>
            </div>
          </>
        )}
    </>
  );

  // Expanded inside the log — no overlay, so the list stays visible and
  // the rep keeps their place.
  if (!isModal) {
    return (
      <div className="overflow-hidden rounded-lg border bg-background">
        {inner}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92vh] w-full gap-0 overflow-hidden p-0 sm:max-w-[860px]"
      >
        {inner}
      </DialogContent>
    </Dialog>
  );
}
