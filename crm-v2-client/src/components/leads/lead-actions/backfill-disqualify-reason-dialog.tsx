import { useState } from "react";
import { Loader2 } from "lucide-react";
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
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  useUpdateLead,
  type Lead,
  DISQUALIFY_REASONS,
  ADMIN_DISQUALIFY_REASONS,
  TACTICAL_DISQUALIFY_REASONS,
} from "~/api/leads";

const backfillSchema = z.object({
  reason: z.enum(DISQUALIFY_REASONS),
  other_value: z.string().optional(),
});

type BackfillFormValues = z.infer<typeof backfillSchema>;

/**
 * Records WHY a lead was disqualified after the fact.
 *
 * Distinct from DisqualifyLeadDialog on purpose: that dialog CHANGES the
 * lead's status and so routes tactical reasons through manager approval.
 * This one runs on a lead that is already Disqualified — the status is
 * untouched, the server's tactical gate stands aside for exactly this
 * case, and all a rep is doing is answering the manager's question the
 * record should have answered already.
 */
export function BackfillDisqualifyReasonDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateLead = useUpdateLead();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<BackfillFormValues>({
    resolver: zodResolver(backfillSchema),
    defaultValues: { reason: undefined, other_value: "" },
  });
  const selectedReason = form.watch("reason");

  const handleSubmit = (values: BackfillFormValues) => {
    if (!lead) return;
    setSubmitting(true);
    updateLead.mutate(
      {
        id: lead.id,
        data: {
          disqualify_reason: values.reason,
          other_value: values.other_value,
        } as never,
      },
      {
        onSuccess: () => {
          toast.success("Reason recorded");
          onOpenChange(false);
          form.reset();
          setSubmitting(false);
        },
        onError: () => {
          toast.error("Could not record the reason");
          setSubmitting(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Why was this lead disqualified?</DialogTitle>
          <DialogDescription>
            {lead?.school?.name || lead?.lead_name} was disqualified without a
            recorded reason. Recording it does not change the lead&apos;s
            status — it lets managers see whether it was cut too early, should
            be nurtured, or belongs with another rep.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              name="reason"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pick the reason" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Commercial</SelectLabel>
                        {TACTICAL_DISQUALIFY_REASONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Administrative</SelectLabel>
                        {ADMIN_DISQUALIFY_REASONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Anything else</SelectLabel>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {selectedReason === "Other" && (
              <FormField
                name="other_value"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What happened?</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="One line a manager can act on"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Record reason
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
