import { forwardRef, useImperativeHandle } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "~/components/ui/form";
import { noteTabSchema, type NoteTabValues } from "./activity-schemas";
import type { ActivityTabFormProps, TabFormHandle, TabFormPayload } from "./types";

export const NoteTabForm = forwardRef<TabFormHandle, ActivityTabFormProps>(
  function NoteTabForm(_props, ref) {
    const form = useForm<NoteTabValues>({
      resolver: zodResolver(noteTabSchema),
      defaultValues: { content: "", visibility: "internal" },
      mode: "onTouched",
    });

    useImperativeHandle(ref, () => ({
      trigger: () => form.trigger(),
      getValues: (): TabFormPayload => {
        const v = form.getValues();
        return {
          subject:
            v.content.substring(0, 50) +
            (v.content.length > 50 ? "..." : ""),
          note: { content: v.content, visibility: v.visibility },
        };
      },
      reset: () => form.reset(),
    }));

    return (
      <Form {...form}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Note <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Write your note here..."
                    rows={6}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="visibility"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Visibility</FormLabel>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="flex gap-4 mt-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="internal"
                        id="visibility-internal"
                      />
                      <Label
                        htmlFor="visibility-internal"
                        className="cursor-pointer font-normal"
                      >
                        Internal Only
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="client_safe"
                        id="visibility-client"
                      />
                      <Label
                        htmlFor="visibility-client"
                        className="cursor-pointer font-normal"
                      >
                        Client Safe
                      </Label>
                    </div>
                  </RadioGroup>
                </FormControl>
                <p className="text-xs text-muted-foreground mt-1">
                  {field.value === "internal"
                    ? "This note is for internal use only"
                    : "This note can be shared with the client"}
                </p>
              </FormItem>
            )}
          />

          <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Notes don't require a Next Step or Due Date.</span>
          </div>
        </div>
      </Form>
    );
  },
);
