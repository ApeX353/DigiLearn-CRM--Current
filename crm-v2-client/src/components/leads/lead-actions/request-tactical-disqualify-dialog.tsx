import { Loader2, ShieldAlert } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { useCreateLeadReversalRequest } from "~/api/lead-reversal-requests";
import { Button } from "~/components/ui/button";
import { DialogFooter } from "~/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import Modal from "~/components/ui/modal";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { DISQUALIFY_REASONS } from "~/api/leads";

/** Rep-facing request. Approval applies the disqualification atomically. */

const schema = z.object({
  reason: z.enum(DISQUALIFY_REASONS),
  notes: z.string().trim().min(10, "Explain why in at least 10 characters").max(2000),
});

type Values = z.infer<typeof schema>;

interface Props {
  leadId: string;
  leadName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestTacticalDisqualifyDialog({
  leadId,
  leadName,
  open,
  onOpenChange,
}: Props) {
  const create = useCreateLeadReversalRequest();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reason: undefined, notes: "" },
  });

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
  };

  const onSubmit = (values: Values) => {
    create.mutate(
      {
        leadId,
        data: {
          kind: "tactical_disqualify",
          reason: values.reason.trim(),
          notes: values.notes.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success("Disqualification request submitted for manager review");
          handleClose();
        },
        onError: (err: any) => {
          const message =
            err?.response?.data?.message ||
            "Failed to submit tactical-disqualify request";
          toast.error(message);
        },
      },
    );
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Ask manager to disqualify this lead"
      description={`Choose the reason and explain what happened for ${leadName || "this lead"}. A manager must approve every rep-submitted disqualification. Approval automatically changes the lead to Disqualified; you do not need to submit it again.`}
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
                    <SelectTrigger data-testid="td-reason">
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

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Explanation <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="What happened, what was tried, and why this lead should be disqualified"
                    rows={3}
                    data-testid="td-notes"
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
              onClick={handleClose}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending} data-testid="td-submit">
              {create.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldAlert className="mr-2 h-4 w-4" />
              )}
              Submit for Approval
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Modal>
  );
}
