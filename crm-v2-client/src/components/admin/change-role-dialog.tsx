import { useState, useEffect } from "react";
import { toast } from "sonner";
import Modal from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { useRoles } from "~/api/rbac";
import { useUpdateUser, type StaffUser } from "~/api/users";

interface ChangeRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: StaffUser | null;
}

export function ChangeRoleDialog({
  open,
  onOpenChange,
  user,
}: ChangeRoleDialogProps) {
  const { data: rolesData, isLoading: rolesLoading } = useRoles();
  const updateUser = useUpdateUser();
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  const roles = rolesData?.data || [];

  useEffect(() => {
    if (user) {
      setSelectedRoleIds(user.roles.map((r) => r.id));
    }
  }, [user]);

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId],
    );
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      await updateUser.mutateAsync({
        id: user.id,
        data: { role_ids: selectedRoleIds },
      });
      toast.success(`Roles updated for ${user.first_name} ${user.last_name}`);
      onOpenChange(false);
    } catch {
      toast.error("Failed to update roles");
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Change Role"
      description={
        user
          ? `Update roles for ${user.first_name} ${user.last_name}`
          : "Select roles"
      }
      size="sm"
    >
      <div className="space-y-4">
        {user && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Current:</span>
            {user.roles.length > 0 ? (
              user.roles.map((r) => (
                <Badge key={r.id} variant="outline">
                  {r.name}
                </Badge>
              ))
            ) : (
              <span>No roles assigned</span>
            )}
          </div>
        )}

        <div className="space-y-3">
          {rolesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            roles.map((role) => (
              <div key={role.id} className="flex items-center space-x-3">
                <Checkbox
                  id={`role-${role.id}`}
                  checked={selectedRoleIds.includes(role.id)}
                  onCheckedChange={() => toggleRole(role.id)}
                />
                <Label
                  htmlFor={`role-${role.id}`}
                  className="flex-1 cursor-pointer"
                >
                  <span className="font-medium">{role.name}</span>
                  {role.description && (
                    <span className="text-sm text-muted-foreground ml-2">
                      — {role.description}
                    </span>
                  )}
                </Label>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateUser.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateUser.isPending}>
            {updateUser.isPending ? "Saving..." : "Save Roles"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
