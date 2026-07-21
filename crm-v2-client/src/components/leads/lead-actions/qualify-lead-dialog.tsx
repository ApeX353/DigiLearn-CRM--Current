import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { useUpdateLead, type Lead } from "~/api/leads";

interface QualifyLeadDialogProps {
  lead: Lead;
}

export function QualifyLeadDialog({ lead }: QualifyLeadDialogProps) {
  const [open, setOpen] = useState(false);
  const updateLead = useUpdateLead();

  const handleConfirm = () => {
    updateLead.mutate(
      {
        id: lead.id,
        data: { status: "Qualified" } as any,
      },
      {
        onSuccess: () => {
          toast.success("Lead marked as qualified");
          setOpen(false);
        },
        onError: () => {
          toast.error("Failed to qualify lead");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-green-500 text-white hover:bg-green-500/80 hover:text-white/80">
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Mark as Qualified
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Qualify Lead</DialogTitle>
          <DialogDescription>
            This will mark the lead as qualified, indicating they meet your BANT
            criteria and are ready to be converted to a deal.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Before qualifying, ensure:
          </p>
          <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>Budget has been confirmed</li>
            <li>Decision maker has been identified</li>
            <li>Need/solution fit has been validated</li>
            <li>Timeline for decision has been established</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={updateLead.isPending}>
            {updateLead.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Qualify Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
