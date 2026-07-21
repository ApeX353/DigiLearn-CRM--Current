import { useState } from "react";
import { XCircle, Loader2, ArrowRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
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
import { useUpdateLead, type Lead, DISQUALIFY_REASONS } from "~/api/leads";
import { Input } from "~/components/ui/input";

const disqualifySchema = z.object({
  reason: z.enum(DISQUALIFY_REASONS),
  notes: z.string().optional(),
  other_value: z.string().optional(),
});

type DisqualifyFormValues = z.infer<typeof disqualifySchema>;

interface DisqualifyLeadDialogProps {
  lead: Lead;
}

export function DisqualifyLeadDialog({ lead }: DisqualifyLeadDialogProps) {
  const [open, setOpen] = useState(false);
  const updateLead = useUpdateLead();

  const form = useForm<DisqualifyFormValues>({
    resolver: zodResolver(disqualifySchema),
    defaultValues: {
      reason: undefined,
      notes: "",
      other_value: undefined,
    },
  });

  const onSubmit = (values: DisqualifyFormValues) => {
    updateLead.mutate(
      {
        id: lead.id,
        data: {
          status: "Disqualified",
          disqualify_reason: values.reason,
          notes: values.notes || lead.notes,
          other_value: values.other_value,
        } as any,
      },
      {
        onSuccess: () => {
          toast.success("Lead disqualified");
          setOpen(false);
          form.reset();
        },
        onError: () => {
          toast.error("Failed to disqualify lead");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
        >
          <XCircle className="mr-2 h-4 w-4" />
          Disqualify
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disqualify Lead</DialogTitle>
          <DialogDescription>
            This action will mark the lead as disqualified. This is typically
            used when a lead will not convert to a deal.
          </DialogDescription>
        </DialogHeader>
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
                      <SelectTrigger>
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DISQUALIFY_REASONS.map((reason) => (
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={updateLead.isPending}
              >
                {updateLead.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Disqualify Lead
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
