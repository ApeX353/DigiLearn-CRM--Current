import { Loader2, Undo2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import {
  useCreateLeadReversalRequest,
  LEAD_REVERSAL_TARGET_STATUSES,
} from "~/api/lead-reversal-requests";
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

const requestReversalSchema = z.object({
  status: z.enum(LEAD_REVERSAL_TARGET_STATUSES),
  reason: z.string().trim().min(1, "Reason is required"),
});

type RequestReversalValues = z.infer<typeof requestReversalSchema>;

interface RequestReversalDialogProps {
  leadId: string;
  leadName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestReversalDialog({
  leadId,
  leadName,
  open,
  onOpenChange,
}: RequestReversalDialogProps) {
  const createReversalRequest = useCreateLeadReversalRequest();
  const form = useForm<RequestReversalValues>({
    resolver: zodResolver(requestReversalSchema),
    defaultValues: {
      status: undefined,
      reason: "",
    },
  });

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
  };

  const onSubmit = (values: RequestReversalValues) => {
    createReversalRequest.mutate(
      {
        leadId,
        data: {
          status: values.status,
          reason: values.reason.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success("Reversal request submitted");
          handleClose();
        },
        onError: () => {
          toast.error("Failed to submit reversal request");
        },
      },
    );
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Request Lead Reversal"
      description={`Request to move ${leadName || "this lead"} from Converted to another status. This request must be approved before any change is applied.`}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Target Status <span className="text-destructive">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select target status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Nurture">Nurture</SelectItem>
                    <SelectItem value="Qualified">Qualified</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

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
                    placeholder="Provide context for why this converted lead should be reversed."
                    rows={4}
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
              disabled={createReversalRequest.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createReversalRequest.isPending}>
              {createReversalRequest.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="mr-2 h-4 w-4" />
              )}
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Modal>
  );
}
