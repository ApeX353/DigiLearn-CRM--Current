import { format } from "date-fns";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import {
  LEAD_REVERSAL_REVIEW_DECISIONS,
  type LeadReversalRequest,
} from "~/api/lead-reversal-requests";
import {
  useApproveLeadReversalRequest,
  useRejectLeadReversalRequest,
} from "~/api/lead-reversal-requests";
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

const reviewReversalSchema = z.object({
  decision: z.enum(LEAD_REVERSAL_REVIEW_DECISIONS),
  review_note: z.string().optional(),
}).refine(
  (values) => values.decision !== "rejected" || !!values.review_note?.trim(),
  {
    path: ["review_note"],
    message: "Review note is required when rejecting",
  },
);

type ReviewReversalValues = z.infer<typeof reviewReversalSchema>;

interface ReviewReversalRequestDialogProps {
  request: LeadReversalRequest | null;
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

export function ReviewReversalRequestDialog({
  request,
  open,
  onOpenChange,
}: ReviewReversalRequestDialogProps) {
  const approveRequest = useApproveLeadReversalRequest();
  const rejectRequest = useRejectLeadReversalRequest();

  const form = useForm<ReviewReversalValues>({
    resolver: zodResolver(reviewReversalSchema),
    defaultValues: {
      decision: "approved",
      review_note: "",
    },
  });

  const isPending = request?.status === "pending";
  const isMutating = approveRequest.isPending || rejectRequest.isPending;

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
  };

  const onSubmit = (values: ReviewReversalValues) => {
    if (!request) return;

    const payload = {
      decision: values.decision,
      review_note: values.review_note?.trim() || undefined,
    };

    const mutation = values.decision === "approved" ? approveRequest : rejectRequest;
    mutation.mutate(
      {
        requestId: request.id,
        data: payload,
      },
      {
        onSuccess: () => {
          toast.success(
            values.decision === "approved"
              ? "Reversal request approved"
              : "Reversal request rejected",
          );
          handleClose();
        },
        onError: () => {
          toast.error(
            values.decision === "approved"
              ? "Failed to approve reversal request"
              : "Failed to reject reversal request",
          );
        },
      },
    );
  };

  if (!request) {
    return null;
  }

  const selectedDecision = form.watch("decision");

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Review Reversal Request"
      description="Approve to apply the requested status change, or reject to keep this lead in Converted."
    >
      {!isPending && (
        <Alert>
          <AlertTitle>Already reviewed</AlertTitle>
          <AlertDescription>
            This request is already {request.status}. No further action is
            available.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border p-3 text-sm space-y-2">
        <p>
          <span className="text-muted-foreground">Requested by:</span>{" "}
          {formatActorName(request.requested_by)}
        </p>
        <p>
          <span className="text-muted-foreground">Requested at:</span>{" "}
          {formatDateTime(request.created_at)}
        </p>
        {request.lead_summary?.status && (
          <p>
            <span className="text-muted-foreground">From:</span>{" "}
            {request.lead_summary.status}
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Target:</span>{" "}
          {request.requested_status}
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
                      <RadioGroupItem value="approved" id="decision-approved" />
                      <Label htmlFor="decision-approved">Approved</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="rejected" id="decision-rejected" />
                      <Label htmlFor="decision-rejected">Rejected</Label>
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
                  Review Note{" "}
                  {selectedDecision === "rejected" ? (
                    <span className="text-destructive">*</span>
                  ) : (
                    <span className="text-muted-foreground">(Optional)</span>
                  )}
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={
                      selectedDecision === "rejected"
                        ? "Required when rejecting this request."
                        : "Optional note for this review."
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
              disabled={isMutating}
            >
              Close
            </Button>
            <Button
              type="submit"
              disabled={!isPending || isMutating}
            >
              {isMutating ? (
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
