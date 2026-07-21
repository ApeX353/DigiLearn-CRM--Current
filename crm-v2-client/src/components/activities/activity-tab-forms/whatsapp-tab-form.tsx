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
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "~/components/ui/form";
import { WHATSAPP_DIRECTIONS } from "~/api/activities/types";
import { whatsappTabSchema, type WhatsAppTabValues } from "./activity-schemas";
import type { SingleContactTabFormProps, TabFormHandle, TabFormPayload } from "./types";

export const WhatsAppTabForm = forwardRef<TabFormHandle, SingleContactTabFormProps>(
  function WhatsAppTabForm({ selectedContact, onActionDataChange }, ref) {
    const form = useForm<WhatsAppTabValues>({
      resolver: zodResolver(whatsappTabSchema),
      defaultValues: {
        phone_number: "",
        message: "",
        direction: "outbound",
        message_type: "text",
      },
      mode: "onTouched",
    });

    // Auto-fill phone from selected contact
    useEffect(() => {
      if (!form.getValues("phone_number")) {
        const contactPhone =
          selectedContact?.whatsapp_number || selectedContact?.phone;
        if (contactPhone) {
          form.setValue("phone_number", contactPhone);
        }
      }
    }, [selectedContact, form]);

    // Report action data for Open WhatsApp button
    const watchedPhone = form.watch("phone_number");
    const watchedMessage = form.watch("message");
    useEffect(() => {
      onActionDataChange?.({
        phone_number: watchedPhone || "",
        message: watchedMessage || "",
      });
    }, [watchedPhone, watchedMessage, onActionDataChange]);

    useImperativeHandle(ref, () => ({
      trigger: () => form.trigger(),
      getValues: (): TabFormPayload => {
        const v = form.getValues();
        return {
          subject: `WhatsApp: ${v.message.substring(0, 40)}`,
          whatsapp: {
            phone_number: v.phone_number,
            message: v.message,
            direction: v.direction,
            message_type: v.message_type,
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
                <FormControl>
                  <Input placeholder="+1234567890" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="direction"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Direction</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {WHATSAPP_DIRECTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
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
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Message <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Type your message..."
                    rows={4}
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
