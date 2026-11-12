import { useEffect, useState } from "react";
import { toast } from "sonner";
import { handleApiError } from "~/api/axios";
import {
  useUpdatePermission,
  type Permission,
  type PermissionAction,
} from "~/api/rbac";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import Modal from "~/components/ui/modal";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";

interface EditPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permission: Permission | null;
}

const ACTION_OPTIONS: PermissionAction[] = [
  "manage",
  "read",
  "create",
  "update",
  "delete",
  "export",
  "import",
];

export function EditPermissionDialog({
  open,
  onOpenChange,
  permission,
}: EditPermissionDialogProps) {
  const updatePermission = useUpdatePermission();
  const [action, setAction] = useState<PermissionAction>("read");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [conditions, setConditions] = useState("");
  const [inverted, setInverted] = useState(false);

  useEffect(() => {
    if (!open || !permission) return;
    setAction(
      ACTION_OPTIONS.includes(permission.action as PermissionAction)
        ? (permission.action as PermissionAction)
        : "read",
    );
    setSubject(permission.subject ?? "");
    setDescription(permission.description ?? "");
    setConditions(permission.conditions ?? "");
    setInverted(permission.inverted === true);
  }, [open, permission]);

  const handleSave = async () => {
    if (!permission) return;

    const trimmedSubject = subject.trim();
    const trimmedConditions = conditions.trim();

    if (!trimmedSubject) {
      toast.error("Permission subject is required");
      return;
    }

    if (trimmedConditions.length > 0) {
      try {
        JSON.parse(trimmedConditions);
      } catch {
        toast.error("Conditions must be valid JSON");
        return;
      }
    }

    try {
      await updatePermission.mutateAsync({
        permissionId: permission.id,
        data: {
          action,
          subject: trimmedSubject,
          description: description.trim() || null,
          conditions: trimmedConditions || null,
          inverted,
        },
      });
      toast.success("Permission updated");
      onOpenChange(false);
    } catch (error) {
      toast.error(handleApiError(error));
    }
  };

  if (!permission) return null;

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Edit Permission"
      description="Update permission behavior, including inverted cannot rules."
      size="md"
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-permission-action">Action</Label>
            <select
              id="edit-permission-action"
              value={action}
              onChange={(event) => setAction(event.target.value as PermissionAction)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {ACTION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-permission-subject">Subject</Label>
            <Input
              id="edit-permission-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Lead"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-permission-description">Description (Optional)</Label>
          <Textarea
            id="edit-permission-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder="Describe this permission"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-permission-conditions">
            Default Conditions (Optional JSON)
          </Label>
          <Textarea
            id="edit-permission-conditions"
            value={conditions}
            onChange={(event) => setConditions(event.target.value)}
            rows={4}
            placeholder='{"assigned_to":"${id}"}'
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="edit-permission-inverted">Inverted (cannot)</Label>
            <p className="text-xs text-muted-foreground">
              Turn this on to deny the action instead of allowing it.
            </p>
          </div>
          <Switch
            id="edit-permission-inverted"
            checked={inverted}
            onCheckedChange={setInverted}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updatePermission.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updatePermission.isPending}>
            {updatePermission.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
