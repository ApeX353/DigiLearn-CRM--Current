import { Loader2, RotateCcw } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { useCreateDealRollbackRequest } from "~/api/deal-rollback-requests";
import type { Deal } from "~/api/deals";
import type { Stage } from "~/api/pipelines";
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

const requestRollbackSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required"),
});

type RequestRollbackValues = z.infer<typeof requestRollbackSchema>;

interface RequestDealRollbackDialogProps {
  deal: Pick<Deal, "id" | "title" | "deal_name"> | null;
  fromStage: Pick<Stage, "id" | "name"> | null;
  toStage: Pick<Stage, "id" | "name"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestDealRollbackDialog({
  deal,
  fromStage,
  toStage,
  open,
  onOpenChange,
}: RequestDealRollbackDialogProps) {
  const createRollbackRequest = useCreateDealRollbackRequest();
  const form = useForm<RequestRollbackValues>({
    resolver: zodResolver(requestRollbackSchema),
    defaultValues: {
      reason: "",
    },
  });

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
  };

  const onSubmit = (values: RequestRollbackValues) => {
    if (!deal || !toStage) return;

    createRollbackRequest.mutate(
      {
        dealId: deal.id,
        data: {
          to_stage_id: toStage.id,
          reason: values.reason.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success("Rollback request submitted");
          handleClose();
        },
        onError: () => {
          toast.error("Failed to submit rollback request");
        },
      },
    );
  };

  if (!deal || !fromStage || !toStage) {
    return null;
  }

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Request Deal Rollback"
      description={`Moving ${deal.deal_name || deal.title || "this deal"} backward from ${fromStage.name} to ${toStage.name} needs approval from an admin or sales manager.`}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="rounded-md border p-3 text-sm space-y-2">
            <p>
              <span className="text-muted-foreground">Current stage:</span>{" "}
              {fromStage.name}
            </p>
            <p>
              <span className="text-muted-foreground">Requested stage:</span>{" "}
              {toStage.name}
            </p>
          </div>

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
                    placeholder="Explain why this deal needs to move back in the pipeline."
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
              disabled={createRollbackRequest.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createRollbackRequest.isPending}>
              {createRollbackRequest.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Request Rollback
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Modal>
  );
}
