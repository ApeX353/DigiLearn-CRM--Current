import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Loader2, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { handleApiError } from "~/api/axios";
import { useAssignLead } from "~/api/leads";
import { useAllStaff } from "~/api/staff";
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

interface AssignLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadIds: string[];
  leadSummaryText?: string;
  onSuccess?: () => void;
}

export function AssignLeadsDialog({
  open,
  onOpenChange,
  leadIds,
  leadSummaryText,
  onSuccess,
}: AssignLeadsDialogProps) {
  const [selectedRepId, setSelectedRepId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const assignLead = useAssignLead();

  const uniqueLeadIds = useMemo(
    () => Array.from(new Set(leadIds.filter(Boolean))),
    [leadIds],
  );

  const { data: staffData, isLoading: isLoadingReps } = useAllStaff({
    status: "active",
    page: 1,
    limit: 100,
    search: "",
  });

  const reps = staffData?.data || []
  // const reps = useMemo(
  //   () =>
  //     (staffData?.data || []).filter((staffMember) =>
  //       staffMember.roles?.some((role) => role.name === "sales_rep"),
  //     ),
  //   [staffData?.data],
  // );

  useEffect(() => {
    if (open) return;
    setSelectedRepId("");
    setIsSubmitting(false);
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) return;
    if (!nextOpen) {
      setSelectedRepId("");
      setIsSubmitting(false);
    }
    onOpenChange(nextOpen);
  };

  const handleAssign = async () => {
    if (isSubmitting) return;

    if (!selectedRepId) {
      toast.error("Please select a sales rep");
      return;
    }

    if (uniqueLeadIds.length === 0) {
      toast.error("No leads selected for assignment");
      return;
    }

    setIsSubmitting(true);

    try {
      const results = await Promise.allSettled(
        uniqueLeadIds.map((leadId) =>
          assignLead.mutateAsync({ id: leadId, assigned_to: selectedRepId }),
        ),
      );

      const successCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const failedCount = results.length - successCount;

      const forbiddenCount = results.filter((result) => {
        if (result.status !== "rejected") return false;
        return (
          axios.isAxiosError(result.reason) &&
          result.reason.response?.status === 403
        );
      }).length;

      if (successCount === results.length) {
        toast.success(
          `Assigned ${successCount} lead${successCount === 1 ? "" : "s"} successfully`,
        );
        onSuccess?.();
        handleOpenChange(false);
        return;
      }

      if (successCount === 0) {
        if (forbiddenCount === results.length) {
          toast.error("You are not allowed to assign leads");
        } else {
          toast.error(
            `Failed to assign ${failedCount} lead${failedCount === 1 ? "" : "s"}`,
          );
        }
        return;
      }

      toast.warning(
        `Assigned ${successCount} lead${successCount === 1 ? "" : "s"} and failed ${failedCount}`,
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        toast.error("You are not allowed to assign leads");
      } else {
        toast.error(handleApiError(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPending = isSubmitting || assignLead.isPending;
  const selectedRep = reps.find((rep) => rep.id === selectedRepId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {uniqueLeadIds.length > 1 ? "Assign Leads" : "Reassign Lead"}
          </DialogTitle>
          <DialogDescription>
            Assign {uniqueLeadIds.length} selected lead
            {uniqueLeadIds.length === 1 ? "" : "s"} to an active sales rep.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {leadSummaryText && (
            <p className="text-sm text-muted-foreground">{leadSummaryText}</p>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Sales rep</p>
            <Select
              value={selectedRepId}
              onValueChange={setSelectedRepId}
              disabled={isPending || isLoadingReps}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    isLoadingReps ? "Loading reps..." : "Select sales rep"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {reps.length === 0 ? (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">
                    No active sales reps found.
                  </p>
                ) : (
                  reps.map((rep) => (
                    <SelectItem key={rep.id} value={rep.id}>
                      {rep.first_name} {rep.last_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedRep && (
            <p className="text-xs text-muted-foreground">
              Selected: {selectedRep.first_name} {selectedRep.last_name}
            </p>
          )}
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
            onClick={handleAssign}
            disabled={!selectedRepId || uniqueLeadIds.length === 0 || isPending}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserRoundPlus className="mr-2 h-4 w-4" />
            )}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
