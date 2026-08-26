import { Loader2, UsersRound } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { useCreateLeadReversalRequest } from "~/api/lead-reversal-requests";
import { useStaff } from "~/api/users/use-users";
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
 * Phase C.1 — rep-facing dialog for submitting a reassignment
 * approval request. The compliance gate in `leads.service.ts#update`
 * blocks reps from changing `assigned_to` directly unless an approved
 * `reassignment` request exists for the lead. This dialog lets the
 * rep nominate a target user and explain why.
 *
 * Approval auto-applies the reassignment in `reviewReversalRequest`
 * (server-side); the rep does not need a second action.
 */

const schema = z.object({
  proposed_assignee_id: z.string().uuid("Pick a target user"),
  reason: z.string().trim().min(10, "Reason should be at least 10 characters"),
  notes: z.string().trim().max(2000).optional(),
});

type Values = z.infer<typeof schema>;

interface Props {
  leadId: string;
  leadName?: string;
  currentAssigneeId?: string | null;
  currentUserId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestReassignmentDialog({
  leadId,
  leadName,
  currentAssigneeId,
  currentUserId,
  open,
  onOpenChange,
}: Props) {
  const create = useCreateLeadReversalRequest();
  const { data: staff } = useStaff({
    page: 1,
    limit: 100,
    status: "active",
  });

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      proposed_assignee_id: "",
      reason: "",
      notes: "",
    },
  });

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
  };

  const onSubmit = (values: Values) => {
    if (
      values.proposed_assignee_id === currentAssigneeId ||
      values.proposed_assignee_id === currentUserId
    ) {
      toast.error("Pick a target user different from the current owner");
      return;
    }
    create.mutate(
      {
        leadId,
        data: {
          kind: "reassignment",
          proposed_assignee_id: values.proposed_assignee_id,
          reason: values.reason.trim(),
          notes: values.notes?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("Reassignment request submitted for manager review");
          handleClose();
        },
        onError: (err: any) => {
          const message =
            err?.response?.data?.message ||
            "Failed to submit reassignment request";
          toast.error(message);
        },
      },
    );
  };

  // Filter out the current assignee + current user from the picker so
  // reps can't accidentally request a no-op reassignment.
  const items =
    staff?.data?.filter(
      (u) =>
        u.id !== currentAssigneeId &&
        u.id !== currentUserId &&
        u.is_active !== false,
    ) ?? [];

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Ask manager to reassign this lead"
      description={`Pick a teammate to move ${leadName || "this lead"} to and explain why. When the manager approves, the lead moves automatically — you don't need a second action. You'll get an in-app notification with the decision. Sales managers and admins reassign leads directly from the Assign action.`}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="proposed_assignee_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Reassign to <span className="text-destructive">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="ra-target">
                      <SelectValue placeholder="Pick a rep" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {items.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {[u.first_name, u.last_name].filter(Boolean).join(" ")}{" "}
                        — {u.email}
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
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Reason <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="e.g. Better territory match — prospect is in target rep's region"
                    rows={4}
                    data-testid="ra-reason"
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
                    placeholder="Optional context"
                    rows={3}
                    data-testid="ra-notes"
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
            <Button type="submit" disabled={create.isPending} data-testid="ra-submit">
              {create.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UsersRound className="mr-2 h-4 w-4" />
              )}
              Submit for Approval
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Modal>
  );
}
