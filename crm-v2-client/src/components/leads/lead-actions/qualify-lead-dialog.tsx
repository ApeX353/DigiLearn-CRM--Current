import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { useUpdateLead, type Lead } from "~/api/leads";
import {
  formatLeadQualificationBlock,
  LEAD_MVD_REQUIREMENTS,
  type BlockedActionMessage,
} from "~/lib/blocked-action-messages";

interface QualifyLeadDialogProps {
  lead: Lead;
}

export function QualifyLeadDialog({ lead }: QualifyLeadDialogProps) {
  const [open, setOpen] = useState(false);
  const [blockedMessage, setBlockedMessage] =
    useState<BlockedActionMessage | null>(null);
  const updateLead = useUpdateLead();

  const handleConfirm = () => {
    setBlockedMessage(null);
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
        onError: (error) => {
          const nextBlockedMessage = formatLeadQualificationBlock(error);
          setBlockedMessage(nextBlockedMessage);
          toast.error(nextBlockedMessage.title, {
            description: nextBlockedMessage.description,
          });
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setBlockedMessage(null);
      }}
    >
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
        <div className="py-4 space-y-4">
          {blockedMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{blockedMessage.title}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{blockedMessage.description}</p>
                {blockedMessage.missingItems.length > 0 && (
                  <ul className="list-disc space-y-1 pl-4">
                    {blockedMessage.missingItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            Before qualifying, make sure the lead has enough real sales data:
          </p>
          <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside space-y-1">
            {LEAD_MVD_REQUIREMENTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            A recent note or call is not enough by itself. The lead also needs
            the required qualification fields and a future next action.
          </p>
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
