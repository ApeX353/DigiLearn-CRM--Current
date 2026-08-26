import { useEffect, useState } from "react";
import { toast } from "sonner";
import { handleApiError } from "~/api/axios";
import { useCreateRole } from "~/api/rbac";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import Modal from "~/components/ui/modal";
import { Textarea } from "~/components/ui/textarea";

interface AddRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddRoleDialog({ open, onOpenChange }: AddRoleDialogProps) {
  const createRole = useCreateRole();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Role name is required");
      return;
    }

    try {
      await createRole.mutateAsync({
        name: trimmedName,
        description: description.trim() || undefined,
      });
      toast.success(`Role "${trimmedName}" created`);
      onOpenChange(false);
    } catch (error) {
      toast.error(handleApiError(error));
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Add Role"
      description="Create a new role for RBAC permission assignments."
      size="sm"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-role-name">Role Name</Label>
          <Input
            id="new-role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="sales_coordinator"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-role-description">Description (Optional)</Label>
          <Textarea
            id="new-role-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this role can do."
            rows={4}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createRole.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createRole.isPending}>
            {createRole.isPending ? "Creating..." : "Create Role"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
