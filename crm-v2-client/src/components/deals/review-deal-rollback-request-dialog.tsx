import { format } from "date-fns";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import {
  DEAL_ROLLBACK_REVIEW_DECISIONS,
  type DealRollbackRequest,
  useReviewDealRollbackRequest,
} from "~/api/deal-rollback-requests";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
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
import { Label } from "~/components/ui/label";
import Modal from "~/components/ui/modal";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Textarea } from "~/components/ui/textarea";

const reviewRollbackSchema = z.object({
  decision: z.enum(DEAL_ROLLBACK_REVIEW_DECISIONS),
  review_note: z.string().optional(),
});

type ReviewRollbackValues = z.infer<typeof reviewRollbackSchema>;

interface ReviewDealRollbackRequestDialogProps {
  request: DealRollbackRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatActorName = (actor?: {
  first_name?: string;
  last_name?: string;
  email?: string;
} | null) => {
  if (!actor) return "--";
  const fullName = `${actor.first_name || ""} ${actor.last_name || ""}`.trim();
  return fullName || actor.email || "--";
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return format(date, "MMM d, yyyy h:mm a");
};

export function ReviewDealRollbackRequestDialog({
  request,
  open,
  onOpenChange,
}: ReviewDealRollbackRequestDialogProps) {
  const reviewRequest = useReviewDealRollbackRequest();
  const form = useForm<ReviewRollbackValues>({
    resolver: zodResolver(reviewRollbackSchema),
    defaultValues: {
      decision: "approved",
      review_note: "",
    },
  });

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
  };

  const onSubmit = (values: ReviewRollbackValues) => {
    if (!request) return;

    reviewRequest.mutate(
      {
        requestId: request.id,
        data: {
          decision: values.decision,
          review_note: values.review_note?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(
            values.decision === "approved"
              ? "Rollback request approved"
              : "Rollback request rejected",
          );
          handleClose();
        },
        onError: () => {
          toast.error("Failed to review rollback request");
        },
      },
    );
  };

  if (!request) {
    return null;
  }

  const isPending = request.status === "pending";
  const selectedDecision = form.watch("decision");

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Review Deal Rollback"
      description="Approve to move the deal backward, or reject to keep it in its current stage."
    >
      {!isPending && (
        <Alert>
          <AlertTitle>Already reviewed</AlertTitle>
          <AlertDescription>
            This rollback request is already {request.status}. No further action is
            available.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border p-3 text-sm space-y-2">
        <p>
          <span className="text-muted-foreground">Deal:</span>{" "}
          {request.deal?.deal_name || request.deal?.title || request.deal_id}
        </p>
        <p>
          <span className="text-muted-foreground">Requested by:</span>{" "}
          {formatActorName(request.requested_by)}
        </p>
        <p>
          <span className="text-muted-foreground">Requested at:</span>{" "}
          {formatDateTime(request.requested_at)}
        </p>
        <p>
          <span className="text-muted-foreground">From:</span>{" "}
          {request.from_stage?.name || request.from_stage_id}
        </p>
        <p>
          <span className="text-muted-foreground">To:</span>{" "}
          {request.to_stage?.name || request.to_stage_id}
        </p>
        <p>
          <span className="text-muted-foreground">Reason:</span> {request.reason}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="decision"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Decision <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="approved" id="rollback-approved" />
                      <Label htmlFor="rollback-approved">Approve</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="rejected" id="rollback-rejected" />
                      <Label htmlFor="rollback-rejected">Reject</Label>
                    </div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="review_note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Review Note <span className="text-muted-foreground">(Optional)</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={
                      selectedDecision === "approved"
                        ? "Optional note for this approval."
                        : "Optional note explaining why you rejected the rollback."
                    }
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
              disabled={reviewRequest.isPending}
            >
              Close
            </Button>
            <Button type="submit" disabled={!isPending || reviewRequest.isPending}>
              {reviewRequest.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : selectedDecision === "approved" ? (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              {selectedDecision === "approved"
                ? "Submit Approval"
                : "Submit Rejection"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Modal>
  );
}
