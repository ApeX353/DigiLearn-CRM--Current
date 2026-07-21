import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActivity, useUpdateActivity } from "~/api/activities";
import {
  ACTIVITY_STATUSES,
  MEETING_PLATFORMS,
  type ActivityStatus,
  type MeetingPlatform,
} from "~/api/activities/types";
import { Button } from "~/components/ui/button";
import { DateTimePicker } from "~/components/ui/date-picker";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Textarea } from "~/components/ui/textarea";
import { useAuthStore } from "~/stores/use-auth-store";

interface ActivityMeetingSheetProps {
  activityId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isReadonly?: boolean;
}

const meetingEditSchema = z
  .object({
    status: z.enum(ACTIVITY_STATUSES),
    subject: z.string().min(1, "Subject is required"),
    title: z.string().min(1, "Meeting title is required"),
    platform: z.enum(MEETING_PLATFORMS),
    start_time: z.date(),
    end_time: z.date(),
    location: z.string().optional(),
    meeting_link: z
      .string()
      .trim()
      .optional()
      .refine(
        (value) => !value || /^https?:\/\//i.test(value),
        "Meeting link must be a valid URL",
      ),
    agenda: z.string().optional(),
    description: z.string().optional(),
    minutes_notes: z.string().optional(),
  })
  .refine((value) => value.end_time > value.start_time, {
    path: ["end_time"],
    message: "End time must be after start time",
  });

type MeetingEditValues = z.infer<typeof meetingEditSchema>;

function parseDate(value?: string): Date {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function withDefaultEndTime(start: Date, end?: string): Date {
  if (end) {
    const parsed = parseDate(end);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const fallback = new Date(start);
  fallback.setMinutes(fallback.getMinutes() + 30);
  return fallback;
}

export function ActivityMeetingSheet({
  activityId,
  open,
  onOpenChange,
  isReadonly = false,
}: ActivityMeetingSheetProps) {
  const { data: activity, isLoading } = useActivity(activityId || "");
  const updateActivity = useUpdateActivity();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const isFormDisabled = updateActivity.isPending || isReadonly;

  const form = useForm<MeetingEditValues>({
    resolver: zodResolver(meetingEditSchema),
    defaultValues: {
      status: "scheduled",
      subject: "",
      title: "",
      platform: "zoom",
      start_time: new Date(),
      end_time: new Date(),
      location: "",
      meeting_link: "",
      agenda: "",
      description: "",
      minutes_notes: "",
    },
  });

  const meetingStatus = form.watch("status");
  const outcomeValue = form.watch("minutes_notes");
  const canEditMeetingOutcome = Boolean(
    !isReadonly &&
      activity &&
      currentUserId &&
      (activity.created_by?.id === currentUserId ||
        activity.assigned_to_id === currentUserId ||
        activity.assigned_to?.id === currentUserId),
  );
  const showOutcomeField =
    meetingStatus === "completed" || Boolean(outcomeValue?.trim());

  useEffect(() => {
    if (!activity || activity.type !== "meeting") {
      return;
    }

    const startTime = parseDate(
      activity.meeting?.start_time || activity.scheduled_at,
    );

    form.reset({
      status: activity.status as ActivityStatus,
      subject: activity.subject || activity.meeting?.title || "",
      title: activity.meeting?.title || activity.subject || "",
      platform: (activity.meeting?.platform as MeetingPlatform) || "zoom",
      start_time: startTime,
      end_time: withDefaultEndTime(startTime, activity.meeting?.end_time),
      location: activity.meeting?.location || "",
      meeting_link: activity.meeting?.meeting_link || "",
      agenda: activity.meeting?.agenda || "",
      description: activity.description || "",
      minutes_notes: activity.meeting?.minutes_notes || "",
    });
  }, [activity, form]);

  const handleSubmit = (values: MeetingEditValues) => {
    if (!activityId || isReadonly) {
      return;
    }

    const trimmedOutcome = values.minutes_notes?.trim();
    if (values.status === "completed" && canEditMeetingOutcome && !trimmedOutcome) {
      form.setError("minutes_notes", {
        type: "manual",
        message: "Meeting outcome is required when status is completed",
      });
      return;
    }

    updateActivity.mutate(
      {
        id: activityId,
        data: {
          status: values.status,
          subject: values.subject.trim(),
          description: values.description?.trim() || undefined,
          scheduled_at: values.start_time.toISOString(),
          due_at: values.end_time.toISOString(),
          meeting: {
            title: values.title.trim(),
            platform: values.platform,
            start_time: values.start_time.toISOString(),
            end_time: values.end_time.toISOString(),
            location: values.location?.trim() || undefined,
            meeting_link: values.meeting_link?.trim() || undefined,
            agenda: values.agenda?.trim() || undefined,
            minutes_notes: trimmedOutcome || undefined,
          },
        },
      },
      {
        onSuccess: () => toast.success("Meeting updated"),
        onError: () => toast.error("Failed to update meeting"),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        {!activityId ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a meeting to edit
          </div>
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !activity || activity.type !== "meeting" || !activity.meeting ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Meeting details unavailable for this activity.
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Edit Meeting</SheetTitle>
              <SheetDescription>
                Update core scheduling details for this meeting activity.
              </SheetDescription>
            </SheetHeader>

            <Form {...form}>
              <form
                className="space-y-4 px-4 pb-6"
                onSubmit={form.handleSubmit(handleSubmit)}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={isFormDisabled}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ACTIVITY_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="platform"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Platform</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={isFormDisabled}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {MEETING_PLATFORMS.map((platform) => (
                              <SelectItem key={platform} value={platform}>
                                {platform.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Activity subject"
                          {...field}
                          disabled={isFormDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Meeting Title</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Meeting title"
                          {...field}
                          disabled={isFormDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="start_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <DateTimePicker
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Select start time"
                            disabled={isFormDisabled}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="end_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <FormControl>
                          <DateTimePicker
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Select end time"
                            disabled={isFormDisabled}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Location"
                          {...field}
                          value={field.value || ""}
                          disabled={isFormDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="meeting_link"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Meeting Link</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://..."
                          {...field}
                          value={field.value || ""}
                          disabled={isFormDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="agenda"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agenda</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={4}
                          placeholder="Meeting agenda"
                          {...field}
                          value={field.value || ""}
                          disabled={isFormDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="Activity description"
                          {...field}
                          value={field.value || ""}
                          disabled={isFormDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                    )}
                  />

                {showOutcomeField && (
                  <FormField
                    control={form.control}
                    name="minutes_notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meeting Outcome</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={4}
                            placeholder={
                              canEditMeetingOutcome
                                ? "Summarize key decisions, results, and next steps"
                                : "Only the rep or assignee can edit this outcome"
                            }
                            {...field}
                            value={field.value || ""}
                            disabled={isFormDisabled || !canEditMeetingOutcome}
                          />
                        </FormControl>
                        {!canEditMeetingOutcome && (
                          <p className="text-xs text-muted-foreground">
                            Only the meeting rep or assignee can add the outcome.
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={updateActivity.isPending}
                  >
                    Close
                  </Button>
                  <Button type="submit" disabled={isFormDisabled}>
                    {updateActivity.isPending
                      ? "Saving..."
                      : isReadonly
                        ? "Read only"
                        : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
