import { useEffect, useState } from "react";
import { toast } from "sonner";
import { handleApiError } from "~/api/axios";
import { useUpdateRole, type Role } from "~/api/rbac";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import Modal from "~/components/ui/modal";
import { Textarea } from "~/components/ui/textarea";

interface EditRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
}

export function EditRoleDialog({ open, onOpenChange, role }: EditRoleDialogProps) {
  const updateRole = useUpdateRole();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open || !role) return;
    setName(role.name ?? "");
    setDescription(role.description ?? "");
  }, [open, role]);

  const handleSave = async () => {
    if (!role) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Role name is required");
      return;
    }

    try {
      await updateRole.mutateAsync({
        roleId: role.id,
        data: {
          name: trimmedName,
          description: description.trim(),
        },
      });
      toast.success("Role updated");
      onOpenChange(false);
    } catch (error) {
      toast.error(handleApiError(error));
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Edit Role"
      description="Update role details."
      size="sm"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-role-name">Role Name</Label>
          <Input
            id="edit-role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="sales_manager"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-role-description">Description</Label>
          <Textarea
            id="edit-role-description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe this role"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateRole.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateRole.isPending}>
            {updateRole.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
