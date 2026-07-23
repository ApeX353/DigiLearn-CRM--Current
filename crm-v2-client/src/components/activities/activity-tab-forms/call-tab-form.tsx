import { forwardRef, useImperativeHandle, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Button } from "~/components/ui/button";
import { ExternalLink } from "lucide-react";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "~/components/ui/form";
import { CALL_OUTCOMES } from "~/api/activities/types";
import { callTabSchema, type CallTabValues } from "./activity-schemas";
import type { SingleContactTabFormProps, TabFormHandle, TabFormPayload } from "./types";
import { DateTimePicker } from "~/components/ui/date-picker";

export const CallTabForm = forwardRef<TabFormHandle, SingleContactTabFormProps>(
  function CallTabForm({ selectedContact, onActionDataChange }, ref) {
    const form = useForm<CallTabValues>({
      resolver: zodResolver(callTabSchema),
      defaultValues: {
        phone_number: "",
        outcome: undefined,
        summary: "",
        next_steps: "",
        follow_up_date: undefined,
      },
      mode: "onTouched",
    });

    // Auto-fill phone from selected contact
    useEffect(() => {
      if (selectedContact?.phone && !form.getValues("phone_number")) {
        form.setValue("phone_number", selectedContact.phone);
      }
    }, [selectedContact, form]);

    // Report action data for Start Call button
    const watchedPhone = form.watch("phone_number");
    useEffect(() => {
      onActionDataChange?.({ phone_number: watchedPhone || "" });
    }, [watchedPhone, onActionDataChange]);

    useImperativeHandle(ref, () => ({
      trigger: () => form.trigger(),
      getValues: (): TabFormPayload => {
        const v = form.getValues();
        return {
          subject: `Call: ${v.summary.substring(0, 40)}`,
          // ACT2 — the form has always RENDERED a follow-up date
          // picker, but this payload dropped the value on the floor,
          // so every call was created with due_at NULL no matter what
          // the rep typed. That single omission accounts for the bulk
          // of the undated calls on production.
          due_at: v.follow_up_date?.toISOString(),
          call: {
            phone_number: v.phone_number,
            outcome: v.outcome,
            summary: v.summary,
            next_steps: v.next_steps || undefined,
            follow_up_date: v.follow_up_date?.toISOString(),
          },
        };
      },
      reset: () => form.reset(),
    }));

    return (
      <Form {...form}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="phone_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Phone Number <span className="text-destructive">*</span>
                </FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input
                      placeholder="+1234567890"
                      className="flex-1"
                      {...field}
                    />
                  </FormControl>
                  {field.value && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() =>
                        window.open(`tel:${field.value}`, "_self")
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="outcome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Outcome <span className="text-destructive">*</span>
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="What happened?" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CALL_OUTCOMES.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o.replace("_", " ")}
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
            name="summary"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Summary <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Brief summary of the call..."
                    rows={2}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="next_steps"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Next Steps</FormLabel>
                <FormControl>
                  <Input
                    placeholder="What's the next action?"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="follow_up_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Follow Up Date</FormLabel>
                <FormControl>
                  <DateTimePicker
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select follow up date and time"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

      
        </div>
      </Form>
    );
  },
);
