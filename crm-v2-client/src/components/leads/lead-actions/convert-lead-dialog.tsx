import { ArrowRightLeft } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { useAddDealModalStore } from "~/stores/use-add-deal-modal-store";

interface ConvertLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  schoolId?: string;
  leadName: string;
  leadNotes?: string;
  estimatedValue?: number;
  assigneeId?: string;
  qualificationNeeds?: string;
  hasNeeds?: boolean;
}

export function ConvertLeadDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
  leadNotes,
  estimatedValue,
  schoolId,
  assigneeId,
  qualificationNeeds,
  hasNeeds,
}: ConvertLeadDialogProps) {
  const openWithValues = useAddDealModalStore((s) => s.openWithValues);

  const handleConvert = () => {
    const items: {
      description: string;
      quantity: number;
      discount: number;
      unit_price: number;
    }[] = [];

    if (hasNeeds && qualificationNeeds) {
      items.push({
        description: qualificationNeeds,
        quantity: 1,
        discount: 0,
        unit_price: 0,
      });
    }

    openWithValues({
      lead_id: leadId,
      title: leadName,
      description: leadNotes || "",
      school_id: schoolId || "",
      value: Number(estimatedValue) || 0,
      assigned_to: assigneeId,
      isLeadReadOnly: true,
      isAssignedToReadOnly: true,
      isConverting: true,
      items: items.length > 0 ? items : undefined,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convert Lead to Deal</DialogTitle>
          <DialogDescription>
            You are about to convert <strong>{leadName}</strong> to a deal. This
            will create a new deal record with the lead's information
            pre-filled.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            A deal creation form will open with the following pre-filled:
          </p>
          <ul className="mt-2 text-sm space-y-1 list-disc list-inside text-muted-foreground">
            <li>Deal name: {leadName}</li>
            {estimatedValue && (
              <li>Estimated value: ${estimatedValue.toLocaleString()}</li>
            )}
            {qualificationNeeds && (
              <li>Needs/requirements from qualification</li>
            )}
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConvert}>
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Continue to Deal Creation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
