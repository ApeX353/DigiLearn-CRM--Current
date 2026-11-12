import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  DialogFooter,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { useUpdateLead, type Lead } from "~/api/leads";
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert";
import Modal from "~/components/ui/modal";

interface MarkContactedDialogProps {
  lead: Lead;
  open: boolean;
  onClose: () => void;
}

export function MarkContactedDialog({
  lead,
  open,
  onClose,
}: MarkContactedDialogProps) {
  const updateLead = useUpdateLead();

  const isContacted = !!lead.last_contacted_at;

  const handleConfirm = () => {
    updateLead.mutate(
      {
        id: lead.id,
        data: { status: "Contacted" } as any,
      },
      {
        onSuccess: () => {
          toast.success("Lead marked as contacted");
          onClose();
        },
        onError: () => {
          toast.error("Failed to update lead status");
        },
      },
    );
  };

  return (
    <Modal title="Mark Lead as Contacted" isOpen={open} onClose={onClose}>
      {!isContacted ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Activity Required</AlertTitle>
          <AlertDescription>
            You must log at least one contact activity (call, email, WhatsApp,
            or meeting) before marking this lead as Contacted. Use the{" "}
            <strong>Activity</strong> tab to log your first contact.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800 dark:text-green-200">
            Ready to Proceed
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            You can now mark this lead as Contacted. Remember this action cannot
            be undone.
          </AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={!isContacted || updateLead.isPending}
        >
          {updateLead.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Confirm Contact
        </Button>
      </DialogFooter>
    </Modal>
  );
}
