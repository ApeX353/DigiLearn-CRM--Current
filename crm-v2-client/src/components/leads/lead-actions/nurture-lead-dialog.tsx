import { ArrowRight, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { DialogFooter } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { DateTimePicker } from "~/components/ui/date-picker";
import { useUpdateLead, type Lead, NURTURE_REASONS } from "~/api/leads";
import Modal from "~/components/ui/modal";
import { Input } from "~/components/ui/input";

const nurtureSchema = z.object({
  reason: z.enum(NURTURE_REASONS),
  follow_up_date: z.date(),
  notes: z.string().optional(),
  other_value: z.string().optional(),
}); // to add refine on other cause other_value is required when other is selected for reason

type NurtureFormValues = z.infer<typeof nurtureSchema>;

interface NurtureLeadDialogProps {
  lead: Lead;
  open: boolean;
  onClose: () => void;
}

export function NurtureLeadDialog({
  lead,
  open,
  onClose,
}: NurtureLeadDialogProps) {
  const updateLead = useUpdateLead();

  const form = useForm<NurtureFormValues>({
    resolver: zodResolver(nurtureSchema),
    defaultValues: {
      reason: undefined,
      follow_up_date: undefined,
      notes: "",
    },
  });

  const onSubmit = (values: NurtureFormValues) => {
    updateLead.mutate(
      {
        id: lead.id,
        data: {
          status: "Nurture",
          nurture_reason: values.reason,
          follow_up_date: values.follow_up_date.toISOString(),
          notes: values.notes || lead.notes,
          other_value: values.other_value,
        } as any,
      },
      {
        onSuccess: () => {
          toast.success("Lead moved to nurture");
          onClose();
          form.reset();
        },
        onError: () => {
          toast.error("Failed to update lead");
        },
      },
    );
  };

  return (
    <Modal
      title="Move Lead to Nurture"
      description="This lead needs more time before they're ready to convert. Set a follow-up date to revisit."
      isOpen={open}
      onClose={onClose}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Reason <span className="text-destructive">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a reason" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {NURTURE_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.watch("reason") === "Other" && (
            <FormField
              control={form.control}
              name="other_value"
              render={({ field }) => (
                <FormItem className="ml-4">
                  <FormControl>
                    <FormItem className="flex items-center">
                      <ArrowRight className="text-muted-foreground h-4 w-4 mr-2 animate animate-pulse" />
                      <Input
                        placeholder="Please specify other"
                        {...field}
                        autoFocus
                      />
                    </FormItem>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="follow_up_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Follow-up Date <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <DateTimePicker
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select follow-up date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Add any relevant notes..."
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateLead.isPending}>
              {updateLead.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Move to Nurture
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Modal>
  );
}
