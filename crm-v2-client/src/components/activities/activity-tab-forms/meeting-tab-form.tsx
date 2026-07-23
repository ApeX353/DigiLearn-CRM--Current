import { forwardRef, useImperativeHandle, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { DateTimePicker } from "~/components/ui/date-picker";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "~/components/ui/form";
import { MEETING_PLATFORMS } from "~/api/activities/types";
import { meetingTabSchema, type MeetingTabValues } from "./activity-schemas";
import type {
  MultiContactTabFormProps,
  TabFormHandle,
  TabFormPayload,
} from "./types";

export const MeetingTabForm = forwardRef<
  TabFormHandle,
  MultiContactTabFormProps
>(function MeetingTabForm({ selectedContacts }, ref) {
  const form = useForm<MeetingTabValues>({
    resolver: zodResolver(meetingTabSchema),
    defaultValues: {
      title: "",
      platform: "zoom",
      start_time: undefined,
      end_time: undefined,
      location: "",
      meeting_link: "",
      attendees: "",
      agenda: "",
    },
    mode: "onTouched",
  });

  // Auto-fill attendees from selected contacts
  useEffect(() => {
    if (selectedContacts && selectedContacts.length > 0) {
      const attendeeList = selectedContacts.map((c) =>
        JSON.stringify({
          type: "contact",
          id: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
        }),
      );
      form.setValue("attendees", `[${attendeeList.join(",")}]`);
    } else {
      form.setValue("attendees", "");
    }
  }, [selectedContacts, form]);

  useImperativeHandle(ref, () => ({
    trigger: () => form.trigger(),
    getValues: (): TabFormPayload => {
      const v = form.getValues();
      return {
        subject: v.title,
        // ACT2 — a meeting's "when" is its start_time; mirror it into
        // due_at so the activity is dated at the parent level too.
        // Without this the meeting shows in the calendar but reads as
        // undated everywhere else (52 such meetings on production).
        due_at: v.start_time?.toISOString(),
        meeting: {
          title: v.title,
          platform: v.platform,
          start_time: v.start_time?.toISOString() || "",
          end_time: v.end_time?.toISOString(),
          location: v.location || undefined,
          meeting_link: v.meeting_link || undefined,
          attendees: v.attendees || undefined,
          agenda: v.agenda || undefined,
        },
      };
    },
    reset: () => form.reset(),
  }));

  // Display-friendly attendee summary
  const attendeeSummary =
    selectedContacts && selectedContacts.length > 0
      ? selectedContacts.map((c) => `${c.first_name} ${c.last_name}`).join(", ")
      : "";

  return (
    <Form {...form}>
      <pre>{JSON.stringify(form.formState.errors, null, 2)}</pre>
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Title <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="Meeting title..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {attendeeSummary && (
          <div>
            <Label>Attendees</Label>
            <p className="text-sm text-muted-foreground mt-1">
              {attendeeSummary}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="start_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Start Time <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <DateTimePicker
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select start time"
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
                <FormLabel>
                  End Time <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <DateTimePicker
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select end time"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="platform"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Platform</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {MEETING_PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.replace("_", " ")}
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
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Room 101" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="meeting_link"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Meeting Link</FormLabel>
              <FormControl>
                <Input type="url" placeholder="https://..." {...field} />
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
                <Textarea placeholder="Meeting agenda..." rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* <FormField
            control={form.control}
            name="due_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Due Date <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <DateTimePicker
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select due date and time"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          /> */}
      </div>
    </Form>
  );
});
