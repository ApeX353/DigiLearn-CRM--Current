import { forwardRef, useImperativeHandle, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "~/components/ui/input";
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
import { emailTabSchema, type EmailTabValues } from "./activity-schemas";
import type {
  MultiContactTabFormProps,
  TabFormHandle,
  TabFormPayload,
} from "./types";
import { TemplatePicker } from "~/components/email/template-picker";
import { toast } from "sonner";

export const EmailTabForm = forwardRef<TabFormHandle, MultiContactTabFormProps>(
  function EmailTabForm(
    { selectedContacts, onActionDataChange, leadId, dealId },
    ref,
  ) {
    const form = useForm<EmailTabValues>({
      resolver: zodResolver(emailTabSchema),
      defaultValues: {
        to_recipients: "",
        cc_recipients: "",
        subject: "",
        body: "",
      },
      mode: "onTouched",
    });

    // Auto-fill to_recipients from selected contacts
    useEffect(() => {
      if (selectedContacts && selectedContacts.length > 0) {
        const recipients = selectedContacts
          .filter((c) => c.email?.trim())
          .map((c) => {
          const name = `${c.first_name} ${c.last_name}`.trim();
          return JSON.stringify({ email: c.email?.trim() || "", name });
        });
        form.setValue(
          "to_recipients",
          recipients.length > 0 ? `[${recipients.join(",")}]` : "",
        );
      } else {
        form.setValue("to_recipients", "");
      }
    }, [selectedContacts, form]);

    // Report action data for Send Email button
    const watchedTo = form.watch("to_recipients");
    const watchedSubject = form.watch("subject");
    const watchedBody = form.watch("body");
    const watchedCc = form.watch("cc_recipients");
    useEffect(() => {
      onActionDataChange?.({
        to_recipients: watchedTo || "",
        subject: watchedSubject || "",
        body: watchedBody || "",
        cc_recipients: watchedCc || "",
      });
    }, [watchedTo, watchedSubject, watchedBody, watchedCc, onActionDataChange]);

    useImperativeHandle(ref, () => ({
      trigger: () => form.trigger(),
      getValues: (): TabFormPayload => {
        const v = form.getValues();
        return {
          subject: v.subject,
          email: {
            to_recipients: v.to_recipients,
            cc_recipients: v.cc_recipients || undefined,
            subject: v.subject,
            body: v.body,
          },
        };
      },
      reset: () => form.reset(),
    }));

    // Display-friendly recipient summary
    const recipientSummary =
      selectedContacts && selectedContacts.length > 0
        ? selectedContacts
            .map((c) => `${c.first_name} ${c.last_name}`)
            .join(", ")
        : "";

    // First contact drives the mail-merge context — the render call
    // only takes one contact id because a rendered template is
    // per-message, not per-recipient. If you want different bodies
    // per recipient, send separate emails.
    const primaryContactId = selectedContacts?.[0]?.id;

    return (
      <Form {...form}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Start from a saved template or write from scratch.
            </p>
            <TemplatePicker
              context={{
                lead_id: leadId,
                deal_id: dealId,
                contact_id: primaryContactId,
              }}
              compact
              onApply={(rendered, tpl) => {
                form.setValue("subject", rendered.subject, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
                form.setValue("body", rendered.body_text || rendered.body_html, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
                toast.success(`Applied template "${tpl.name}"`);
              }}
            />
          </div>
          {recipientSummary ? (
            <div>
              <Label>To</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {recipientSummary}
              </p>
            </div>
          ) : (
            <div>
              <Label className="text-muted-foreground">To</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Select recipients above
              </p>
            </div>
          )}

          <FormField
            control={form.control}
            name="cc_recipients"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CC (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="cc@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="subject"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Subject <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Email subject..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="body"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Body <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Email content..."
                    rows={5}
                    {...field}
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
