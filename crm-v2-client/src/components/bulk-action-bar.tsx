import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { UserPlus, ArrowRightLeft, Trash2, X } from "lucide-react";

interface BulkActionBarProps {
  selectedCount: number;
  selectedIds: string[];
  onClear: () => void;
  entityType: "leads" | "deals";
}

export function BulkActionBar({
  selectedCount,
  selectedIds,
  onClear,
  entityType,
}: BulkActionBarProps) {
  const queryClient = useQueryClient();

  const bulkMutation = useMutation({
    mutationFn: async (params: {
      action: string;
      assigneeId?: string;
      status?: string;
    }) => {
      const response = await apiClientAuth.patch(`/${entityType}/bulk-update`, {
        leadIds: selectedIds,
        ...params,
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Bulk operation completed");
      queryClient.invalidateQueries({ queryKey: [entityType] });
      onClear();
    },
    onError: () => {
      toast.error("Bulk operation failed");
    },
  });

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
      <span className="text-sm font-medium">
        {selectedCount} selected
      </span>

      <div className="h-4 w-px bg-border" />

      <Button
        variant="outline"
        size="sm"
        onClick={() => bulkMutation.mutate({ action: "assign" })}
        disabled={bulkMutation.isPending}
      >
        <UserPlus className="h-4 w-4 mr-1" />
        Assign
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => bulkMutation.mutate({ action: "status", status: "Contacted" })}
        disabled={bulkMutation.isPending}
      >
        <ArrowRightLeft className="h-4 w-4 mr-1" />
        Change Status
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => bulkMutation.mutate({ action: "delete" })}
        disabled={bulkMutation.isPending}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4 mr-1" />
        Delete
      </Button>

      <div className="h-4 w-px bg-border" />

      <Button variant="ghost" size="sm" onClick={onClear}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
