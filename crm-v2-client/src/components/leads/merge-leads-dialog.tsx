import { useEffect, useMemo, useState } from "react";
import { GitMerge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Lead } from "~/api/leads";
import { useUpdateLead } from "~/api/leads";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";

interface MergeLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceLead: Lead | null;
  targetLeads: Lead[];
  defaultTargetLeadId?: string | null;
  onSuccess?: () => void;
}

export function MergeLeadsDialog({
  open,
  onOpenChange,
  sourceLead,
  targetLeads,
  defaultTargetLeadId,
  onSuccess,
}: MergeLeadsDialogProps) {
  const [targetLeadId, setTargetLeadId] = useState<string>("");
  const [mergeNote, setMergeNote] = useState("");
  const updateLead = useUpdateLead();

  const selectedTargetLead = useMemo(
    () => targetLeads.find((lead) => lead.id === targetLeadId),
    [targetLeadId, targetLeads],
  );

  useEffect(() => {
    if (!open) return;

    if (
      defaultTargetLeadId &&
      targetLeads.some((lead) => lead.id === defaultTargetLeadId)
    ) {
      setTargetLeadId(defaultTargetLeadId);
      return;
    }

    setTargetLeadId(targetLeads[0]?.id ?? "");
  }, [defaultTargetLeadId, open, targetLeads]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setTargetLeadId("");
      setMergeNote("");
    }
    onOpenChange(nextOpen);
  };

  const handleMerge = async () => {
    if (!sourceLead) {
      toast.error("Source lead not found. Please reopen the merge dialog.");
      return;
    }

    if (!selectedTargetLead) {
      toast.error("Please select a target lead.");
      return;
    }

    if (selectedTargetLead.id === sourceLead.id) {
      toast.error("Source and target leads must be different.");
      return;
    }

    const mergeTimestamp = new Date().toISOString();
    const mergeAuditLine = `Merged into ${selectedTargetLead.lead_name} (${selectedTargetLead.id}) on ${mergeTimestamp}.`;
    const optionalNote = mergeNote.trim()
      ? `Merge note: ${mergeNote.trim()}`
      : undefined;

    const updatedNotes = [sourceLead.notes?.trim(), mergeAuditLine, optionalNote]
      .filter(Boolean)
      .join("\n\n");

    try {
      await updateLead.mutateAsync({
        id: sourceLead.id,
        data: {
          status: "Disqualified",
          disqualify_reason: "Duplicate entry",
          notes: updatedNotes,
        },
      });

      toast.success("Lead merged successfully");
      onSuccess?.();
      handleOpenChange(false);
    } catch {
      toast.error("Failed to merge lead");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge Leads</DialogTitle>
          <DialogDescription>
            This is a soft merge. The source lead will be marked as disqualified
            and an audit note will be added.
          </DialogDescription>
        </DialogHeader>

        {sourceLead ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">Source lead</p>
              <p className="font-medium">{sourceLead.lead_name}</p>
              <p className="text-xs text-muted-foreground">{sourceLead.id}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Merge into</p>
              <Select value={targetLeadId} onValueChange={setTargetLeadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target lead" />
                </SelectTrigger>
                <SelectContent>
                  {targetLeads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.lead_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Optional merge note</p>
              <Textarea
                rows={3}
                placeholder="Add context for this merge..."
                value={mergeNote}
                onChange={(event) => setMergeNote(event.target.value)}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Source lead not available.
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={updateLead.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!sourceLead || !selectedTargetLead || updateLead.isPending}
          >
            {updateLead.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="mr-2 h-4 w-4" />
            )}
            Merge Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
