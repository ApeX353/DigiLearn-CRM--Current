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

interface MergeSelectedLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLeads: Lead[];
  onSuccess?: () => void;
}

export function MergeSelectedLeadsDialog({
  open,
  onOpenChange,
  selectedLeads,
  onSuccess,
}: MergeSelectedLeadsDialogProps) {
  const [targetLeadId, setTargetLeadId] = useState("");
  const [mergeNote, setMergeNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const updateLead = useUpdateLead();

  const uniqueSelectedLeads = useMemo(() => {
    const leadMap = new Map<string, Lead>();
    selectedLeads.forEach((lead) => {
      if (!lead?.id) return;
      if (!leadMap.has(lead.id)) {
        leadMap.set(lead.id, lead);
      }
    });
    return Array.from(leadMap.values());
  }, [selectedLeads]);

  const mergeValidation = useMemo(() => {
    if (uniqueSelectedLeads.length < 2) {
      return {
        canMerge: false,
        reason: "Select at least 2 leads to merge.",
      };
    }

    const schoolIds = uniqueSelectedLeads.map((lead) => lead.school?.id);
    const hasMissingSchool = schoolIds.some((schoolId) => !schoolId);
    if (hasMissingSchool) {
      return {
        canMerge: false,
        reason: "All selected leads must have a school.",
      };
    }

    if (new Set(schoolIds).size !== 1) {
      return {
        canMerge: false,
        reason: "Only leads from the same school can be merged.",
      };
    }

    return {
      canMerge: true,
      reason: "",
    };
  }, [uniqueSelectedLeads]);

  const targetLead = useMemo(
    () => uniqueSelectedLeads.find((lead) => lead.id === targetLeadId),
    [targetLeadId, uniqueSelectedLeads],
  );

  const sourceLeads = useMemo(
    () => uniqueSelectedLeads.filter((lead) => lead.id !== targetLeadId),
    [targetLeadId, uniqueSelectedLeads],
  );

  useEffect(() => {
    if (!open) return;
    setTargetLeadId(uniqueSelectedLeads[0]?.id ?? "");
  }, [open, uniqueSelectedLeads]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) return;
    if (!nextOpen) {
      setTargetLeadId("");
      setMergeNote("");
      setIsSubmitting(false);
    }
    onOpenChange(nextOpen);
  };

  const handleMerge = async () => {
    if (isSubmitting) return;

    if (!mergeValidation.canMerge) {
      toast.error(mergeValidation.reason);
      return;
    }

    if (!targetLead) {
      toast.error("Please select a target lead.");
      return;
    }

    if (sourceLeads.length === 0) {
      toast.error("Please select at least one source lead.");
      return;
    }

    const mergeTimestamp = new Date().toISOString();
    const note = mergeNote.trim();

    setIsSubmitting(true);

    try {
      const results = await Promise.allSettled(
        sourceLeads.map((sourceLead) => {
          const mergeAuditLine = `Merged into ${targetLead.lead_name} (${targetLead.id}) on ${mergeTimestamp}.`;
          const optionalUserNote = note ? `Merge note: ${note}` : undefined;
          const updatedNotes = [
            sourceLead.notes?.trim(),
            mergeAuditLine,
            optionalUserNote,
          ]
            .filter(Boolean)
            .join("\n\n");

          return updateLead.mutateAsync({
            id: sourceLead.id,
            data: {
              status: "Disqualified",
              disqualify_reason: "Duplicate entry",
              notes: updatedNotes,
            },
          });
        }),
      );

      const successCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const failedCount = results.length - successCount;

      if (successCount === results.length) {
        toast.success(
          `Merged ${successCount} lead${successCount === 1 ? "" : "s"} into ${targetLead.lead_name}`,
        );
        onSuccess?.();
        handleOpenChange(false);
        return;
      }

      if (successCount === 0) {
        toast.error("Merge failed. No leads were merged.");
        return;
      }

      toast.warning(
        `Merged ${successCount} lead${successCount === 1 ? "" : "s"}, ${failedCount} failed.`,
      );
    } catch {
      toast.error("Failed to merge selected leads");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPending = isSubmitting || updateLead.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge Selected Leads</DialogTitle>
          <DialogDescription>
            Soft merge selected leads into one target. Source leads will be
            marked as disqualified with an audit note.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {uniqueSelectedLeads.length} selected lead
            {uniqueSelectedLeads.length === 1 ? "" : "s"}.
          </p>

          {!mergeValidation.canMerge && (
            <p className="text-sm text-destructive">{mergeValidation.reason}</p>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Target lead</p>
            <Select
              value={targetLeadId}
              onValueChange={setTargetLeadId}
              disabled={!mergeValidation.canMerge || isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select target lead" />
              </SelectTrigger>
              <SelectContent>
                {uniqueSelectedLeads.map((lead) => (
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
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={
              !mergeValidation.canMerge ||
              !targetLead ||
              sourceLeads.length === 0 ||
              isPending
            }
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="mr-2 h-4 w-4" />
            )}
            Merge Leads
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
