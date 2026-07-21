import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import Modal from "~/components/ui/modal";
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
  closeDealSchema,
  type CloseDealValues,
  useCloseDeal,
} from "~/api/deals";

interface MarkDealLostModalProps {
  dealId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function MarkDealLostModal({
  dealId,
  isOpen,
  onClose,
}: MarkDealLostModalProps) {
  const closeDeal = useCloseDeal();

  const form = useForm<CloseDealValues>({
    resolver: zodResolver(closeDealSchema),
    defaultValues: {
      close_status: "lost",
      lost_reason: "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        close_status: "lost",
        lost_reason: "",
      });
    }
  }, [form, isOpen]);

  const onSubmit = async (values: CloseDealValues) => {
    try {
      await closeDeal.mutateAsync({
        id: dealId,
        data: {
          close_status: "lost",
          lost_reason: values.lost_reason?.trim(),
        },
      });
      toast.success("Deal marked as lost");
      onClose();
    } catch {
      toast.error("Failed to mark deal as lost");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mark Deal as Lost"
      description="Please provide a reason for marking this deal as lost."
      size="sm"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="lost_reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lost Reason *</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="e.g., Budget constraints, competitor selected, timing..."
                    rows={4}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={closeDeal.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={closeDeal.isPending}>
              {closeDeal.isPending ? "Saving..." : "Mark Lost"}
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
}
