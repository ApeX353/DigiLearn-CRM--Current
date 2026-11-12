import { useEffect, useState } from "react";
import { toast } from "sonner";
import { handleApiError } from "~/api/axios";
import { useUpdateRolePermissionCondition } from "~/api/rbac";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import Modal from "~/components/ui/modal";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";

interface EditRolePermissionConditionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleId: string;
  permissionId: string;
  permissionLabel: string;
  currentConditions: string | null;
}

export function EditRolePermissionConditionsDialog({
  open,
  onOpenChange,
  roleId,
  permissionId,
  permissionLabel,
  currentConditions,
}: EditRolePermissionConditionsDialogProps) {
  const updateConditions = useUpdateRolePermissionCondition();
  const [useRoleSpecificConditions, setUseRoleSpecificConditions] =
    useState(false);
  const [conditions, setConditions] = useState("");

  useEffect(() => {
    if (!open) return;
    const hasRoleConditions =
      typeof currentConditions === "string" && currentConditions.length > 0;
    setUseRoleSpecificConditions(hasRoleConditions);
    setConditions(hasRoleConditions ? currentConditions : "");
  }, [currentConditions, open]);

  const handleSave = async () => {
    const trimmedConditions = conditions.trim();

    if (useRoleSpecificConditions && trimmedConditions.length > 0) {
      try {
        JSON.parse(trimmedConditions);
      } catch {
        toast.error("Conditions must be valid JSON");
        return;
      }
    }

    try {
      await updateConditions.mutateAsync({
        roleId,
        permissionId,
        conditions: useRoleSpecificConditions ? trimmedConditions || "{}" : null,
      });
      toast.success("Role-specific conditions updated");
      onOpenChange(false);
    } catch (error) {
      toast.error(handleApiError(error));
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Edit Role Conditions"
      description={`Configure conditions for ${permissionLabel}.`}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="text-sm font-medium">
              Use role-specific conditions
            </Label>
            <p className="text-xs text-muted-foreground">
              Disable to inherit this permission&apos;s default conditions.
            </p>
          </div>
          <Switch
            checked={useRoleSpecificConditions}
            onCheckedChange={setUseRoleSpecificConditions}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="role-condition-json">Conditions JSON</Label>
          <Textarea
            id="role-condition-json"
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            rows={6}
            placeholder='{"assigned_to":"${id}"}'
            disabled={!useRoleSpecificConditions}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateConditions.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateConditions.isPending}>
            {updateConditions.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
