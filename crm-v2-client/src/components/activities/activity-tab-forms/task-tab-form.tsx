import { forwardRef, useImperativeHandle } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "~/components/ui/input";
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
  FormDescription,
  FormMessage,
} from "~/components/ui/form";
import { TASK_STATUSES, TASK_PRIORITIES } from "~/api/activities/types";
import { taskTabSchema, type TaskTabValues } from "./activity-schemas";
import type {
  ActivityTabFormProps,
  TabFormHandle,
  TabFormPayload,
} from "./types";

export const TaskTabForm = forwardRef<TabFormHandle, ActivityTabFormProps>(
  function TaskTabForm(_props, ref) {
    const form = useForm<TaskTabValues>({
      resolver: zodResolver(taskTabSchema),
      defaultValues: {
        description: "",
        status: "todo",
        priority: "medium",
        due_at: undefined,
      },
      mode: "onTouched",
    });

    useImperativeHandle(ref, () => ({
      trigger: () => form.trigger(),
      getValues: (): TabFormPayload => {
        const v = form.getValues();
        return {
          subject:
            v.description.substring(0, 50) +
            (v.description.length > 50 ? "..." : ""),
          description: v.description,
          due_at: v.due_at?.toISOString(),
          task: { status: v.status, priority: v.priority },
        };
      },
      reset: () => form.reset(),
    }));

    return (
      <Form {...form}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Task Description <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Example: Call bursar about quotation approval"
                    {...field}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Make this a concrete next action. Notes belong in the Note tab
                  and do not count as follow-up commitments.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TASK_STATUSES.filter(
                        (s) => s === "todo" || s === "in_progress",
                      ).map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace("_", " ")}
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
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TASK_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
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
                <FormDescription className="text-xs">
                  Future due dates keep SLA, hygiene, and manager follow-up
                  views accurate.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </Form>
    );
  },
);
