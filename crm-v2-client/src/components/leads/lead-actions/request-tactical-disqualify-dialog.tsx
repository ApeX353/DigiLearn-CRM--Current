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

/**
 * Phase C.1 — rep-facing dialog for submitting a tactical disqualify
 * approval request. The compliance gate in `leads.service.ts#update`
 * blocks reps from disqualifying with a tactical reason (No budget,
 * Not interested, Cannot reach contact, Other) unless an approved
 * `tactical_disqualify` request exists for the lead. This dialog is
 * the rep's way to ask for that approval.
 *
 * The compliance switch `tactical_disqualify_requires_approval` is on
 * by default; admins can disable enforcement org-wide from
 * Settings → Compliance & Controls.
 */

const schema = z.object({
  reason: z.string().trim().min(10, "Reason should be at least 10 characters"),
  notes: z.string().trim().max(2000).optional(),
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
    defaultValues: { reason: "", notes: "" },
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
          notes: values.notes?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(
            "Tactical-disqualify request submitted for manager review",
          );
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
      description={`You picked a soft reason (No budget / Not interested / Cannot reach contact / Other) for ${leadName || "this lead"}. A manager needs to approve it first. Once they do, come back to this lead and click Disqualify again to close it. Hard reasons (Duplicate entry, School closed, Wrong contact, Already has solution) don't need approval — disqualify directly. You'll get an in-app notification when the manager decides.`}
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
                <FormControl>
                  <Textarea
                    placeholder="e.g. No traction over 6 outreach attempts in 90 days; budget pushed to next FY"
                    rows={4}
                    data-testid="td-reason"
                    {...field}
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
                <FormLabel>Notes for reviewer</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Optional context (e.g. attached chase log)"
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
