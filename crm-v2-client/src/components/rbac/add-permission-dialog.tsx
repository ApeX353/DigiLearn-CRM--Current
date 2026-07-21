import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { handleApiError } from "~/api/axios";
import {
  useCreatePermission,
  type PermissionAction,
  type Role,
} from "~/api/rbac";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import Modal from "~/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";

interface AddPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
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

export function AddPermissionDialog({
  open,
  onOpenChange,
  roles,
}: AddPermissionDialogProps) {
  const createPermission = useCreatePermission();
  const [action, setAction] = useState<PermissionAction>("read");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [conditions, setConditions] = useState("");
  const [defaultRoleIds, setDefaultRoleIds] = useState<string[]>([]);
  const [inverted, setInverted] = useState(false);

  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => a.name.localeCompare(b.name)),
    [roles],
  );

  useEffect(() => {
    if (!open) {
      setAction("read");
      setSubject("");
      setDescription("");
      setConditions("");
      setDefaultRoleIds([]);
      setInverted(false);
    }
  }, [open]);

  const toggleRole = (roleId: string, checked: boolean) => {
    setDefaultRoleIds((prev) => {
      if (checked) {
        if (prev.includes(roleId)) return prev;
        return [...prev, roleId];
      }
      return prev.filter((id) => id !== roleId);
    });
  };

  const handleSubmit = async () => {
    const trimmedSubject = subject.trim();
    const trimmedConditions = conditions.trim();

    if (!trimmedSubject) {
      toast.error("Permission subject is required");
      return;
    }

    if (trimmedConditions) {
      try {
        JSON.parse(trimmedConditions);
      } catch {
        toast.error("Conditions must be valid JSON");
        return;
      }
    }

    try {
      await createPermission.mutateAsync({
        action,
        subject: trimmedSubject,
        description: description.trim() || undefined,
        conditions: trimmedConditions || undefined,
        default_role_ids: defaultRoleIds.length > 0 ? defaultRoleIds : undefined,
        inverted,
      });
      toast.success(`Permission ${action}:${trimmedSubject} created`);
      onOpenChange(false);
    } catch (error) {
      toast.error(handleApiError(error));
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Add Permission"
      description="Create a permission and optionally assign it to default roles."
      size="md"
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="permission-action">Action</Label>
            <Select
              value={action}
              onValueChange={(value) => setAction(value as PermissionAction)}
            >
              <SelectTrigger id="permission-action">
                <SelectValue placeholder="Select action" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="permission-subject">Subject</Label>
            <Input
              id="permission-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Deal"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="permission-description">Description (Optional)</Label>
          <Textarea
            id="permission-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Explain what this permission allows."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="permission-conditions">
            Default Conditions (Optional JSON)
          </Label>
          <Textarea
            id="permission-conditions"
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            rows={4}
            placeholder='{"created_by":"${id}"}'
          />
        </div>

        <div className="space-y-2">
          <Label>Default Role Assignments</Label>
          <div className="grid gap-2 rounded-md border p-3 md:grid-cols-2">
            {sortedRoles.length > 0 ? (
              sortedRoles.map((role) => (
                <Label
                  key={role.id}
                  className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                >
                  <Checkbox
                    checked={defaultRoleIds.includes(role.id)}
                    onCheckedChange={(checked) =>
                      toggleRole(role.id, checked === true)
                    }
                  />
                  <span>{role.name}</span>
                </Label>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No roles found. Create a role first to assign defaults.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="new-permission-inverted">Inverted (cannot)</Label>
            <p className="text-xs text-muted-foreground">
              Create this permission as a deny rule instead of an allow rule.
            </p>
          </div>
          <Switch
            id="new-permission-inverted"
            checked={inverted}
            onCheckedChange={setInverted}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createPermission.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createPermission.isPending}>
            {createPermission.isPending ? "Creating..." : "Create Permission"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
