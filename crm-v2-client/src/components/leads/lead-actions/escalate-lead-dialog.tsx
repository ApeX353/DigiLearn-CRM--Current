import { Loader2, AlertTriangle } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import {
  ESCALATION_REASONS,
  ESCALATION_REASON_LABELS,
  useCreateLeadEscalation,
} from "~/api/lead-escalations";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";

/**
 * Escalate-lead dialog (Phase 5).
 *
 * The rep explains WHY the lead is stuck — categorised by reason so
 * managers can triage the queue without reading every note. Notes +
 * blockers are optional but strongly encouraged. A pending escalation
 * stays on the manager queue until they record a resolution.
 */

const escalateSchema = z.object({
  reason: z.enum(ESCALATION_REASONS),
  notes: z.string().trim().optional(),
  blockers: z.string().trim().optional(),
});

type EscalateValues = z.infer<typeof escalateSchema>;

interface EscalateLeadDialogProps {
  leadId: string;
  leadName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EscalateLeadDialog({
  leadId,
  leadName,
  open,
  onOpenChange,
}: EscalateLeadDialogProps) {
  const createEscalation = useCreateLeadEscalation();
  const form = useForm<EscalateValues>({
    resolver: zodResolver(escalateSchema),
    defaultValues: {
      reason: undefined as unknown as EscalateValues["reason"],
      notes: "",
      blockers: "",
    },
  });

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
  };

  const onSubmit = (values: EscalateValues) => {
    createEscalation.mutate(
      {
        leadId,
        data: {
          reason: values.reason,
          notes: values.notes?.trim() || undefined,
          blockers: values.blockers?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("Escalation raised to management");
          handleClose();
        },
        onError: () => {
          toast.error("Failed to raise escalation");
        },
      },
    );
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Escalate to management"
      description={`Flag ${leadName || "this lead"} for management attention. Use this when the lead is stuck and you need help — a coach, a meeting join, a reassignment, or a tactic change.`}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Why are you escalating?{" "}
                  <span className="text-destructive">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick the closest reason" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ESCALATION_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ESCALATION_REASON_LABELS[r]}
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
            name="blockers"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Specific blockers (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="e.g. procurement wants a 3-vendor bid; DM is on leave until next month"
                    rows={3}
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
                <FormLabel>Context / what you've tried (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Short history so management doesn't have to dig through the timeline."
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
              onClick={handleClose}
              disabled={createEscalation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createEscalation.isPending}>
              {createEscalation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <AlertTriangle className="mr-2 h-4 w-4" />
              )}
              Raise escalation
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Modal>
  );
}
