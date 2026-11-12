import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { handleApiError } from "~/api/axios";
import {
  useAllPermissions,
  useAssignPermissionsToRole,
  useDeleteRole,
  useRoles,
  useUnassignPermissionsFromRole,
  type Permission,
  type Role,
  type RolePermission,
} from "~/api/rbac";
import Container from "~/components/container";
import { AddPermissionDialog } from "~/components/rbac/add-permission-dialog";
import { AddRoleDialog } from "~/components/rbac/add-role-dialog";
import { EditPermissionDialog } from "~/components/rbac/edit-permission-dialog";
import { EditRoleDialog } from "~/components/rbac/edit-role-dialog";
import { EditRolePermissionConditionsDialog } from "~/components/rbac/edit-role-permission-conditions-dialog";
import PageHeader from "~/components/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useAnyRole, usePermission } from "~/hooks/use-permission";
import { cn } from "~/lib/utils";

interface EditingConditionsState {
  permissionId: string;
  label: string;
  currentConditions: string | null;
}

export default function ManageRolesAndPermissionPage() {
  const canManageRoles = usePermission("Role", "manage");
  const canManagePermissions = usePermission("Permission", "manage");
  const isAdmin = useAnyRole(["admin", "super_admin"]);
  const canAccess = canManageRoles || canManagePermissions || isAdmin;

  if (!canAccess) {
    return (
      <div>
        <PageHeader
          title="Roles & Permissions"
          subtitle="Manage user roles and permission assignments"
        />
        <Container className="p-4">
          <Alert variant="destructive">
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to manage roles and permissions.
            </AlertDescription>
          </Alert>
        </Container>
      </div>
    );
  }

  return <ManageRolesAndPermissionPageLayout isAdmin={isAdmin} />;
}

function ManageRolesAndPermissionPageLayout({ isAdmin }: { isAdmin: boolean }) {
  const { data: rolesData, isLoading: loadingRoles } = useRoles();
  const { data: permissionsData, isLoading: loadingPermissions } =
    useAllPermissions();
  const assignPermission = useAssignPermissionsToRole();
  const unassignPermission = useUnassignPermissionsFromRole();
  const deleteRole = useDeleteRole();

  const roles = rolesData?.data ?? [];
  const permissions = permissionsData?.data ?? [];

  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [addPermissionOpen, setAddPermissionOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editingPermission, setEditingPermission] = useState<Permission | null>(null);
  const [rolePendingDelete, setRolePendingDelete] = useState<Role | null>(null);
  const [editingConditions, setEditingConditions] =
    useState<EditingConditionsState | null>(null);

  useEffect(() => {
    if (!roles.length) {
      setSelectedRoleId("");
      return;
    }

    if (!selectedRoleId || !roles.some((role) => role.id === selectedRoleId)) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId),
    [roles, selectedRoleId],
  );

  const assignmentByPermissionId = useMemo(() => {
    if (!selectedRole) return new Map<string, RolePermission>();
    return new Map(
      (selectedRole.rolePermissions || []).map((assignment) => [
        assignment.permission_id,
        assignment,
      ]),
    );
  }, [selectedRole]);

  const filteredPermissions = useMemo(() => {
    const query = permissionSearch.trim().toLowerCase();
    if (!query) return permissions;

    return permissions.filter((permission) => {
      const subjectMatch = permission.subject.toLowerCase().includes(query);
      const actionMatch = String(permission.action).toLowerCase().includes(query);
      return subjectMatch || actionMatch;
    });
  }, [permissions, permissionSearch]);

  const isMutating = assignPermission.isPending || unassignPermission.isPending;

  const handleToggleAssignment = async (
    permission: Permission,
    checked: boolean,
  ) => {
    if (!selectedRole) return;

    try {
      if (checked) {
        await assignPermission.mutateAsync({
          roleId: selectedRole.id,
          permissions: [{ permission_id: permission.id }],
        });
        toast.success(`Assigned ${permission.action}:${permission.subject}`);
      } else {
        await unassignPermission.mutateAsync({
          roleId: selectedRole.id,
          permissionIds: [permission.id],
        });
        toast.success(`Unassigned ${permission.action}:${permission.subject}`);
      }
    } catch (error) {
      toast.error(handleApiError(error));
    }
  };

  const handleDeleteRole = async () => {
    if (!rolePendingDelete) return;

    try {
      await deleteRole.mutateAsync({ roleId: rolePendingDelete.id });
      toast.success(`Role "${rolePendingDelete.name}" deleted`);
      if (selectedRoleId === rolePendingDelete.id) {
        setSelectedRoleId("");
      }
      setRolePendingDelete(null);
    } catch (error) {
      toast.error(handleApiError(error));
    }
  };

  if (loadingRoles || loadingPermissions) {
    return (
      <div>
        <PageHeader
          title="Roles & Permissions"
          subtitle="Manage user roles and permission assignments"
        />
        <Container className="p-4 space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-80 w-full" />
        </Container>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Manage user roles and permission assignments"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAddRoleOpen(true)}>
              Add Role
            </Button>
            <Button onClick={() => setAddPermissionOpen(true)}>
              Add Permission
            </Button>
          </div>
        }
      />

      <Container className="p-4">
        <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Roles ({roles.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {roles.length > 0 ? (
                <div className="overflow-x-auto pb-2">
                  <div className="flex min-w-max gap-2">
                    {roles.map((role) => (
                      <div
                        key={role.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedRoleId(role.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedRoleId(role.id);
                          }
                        }}
                        className={cn(
                          "group min-w-[230px] max-w-[260px] shrink-0 cursor-pointer rounded-md border px-3 py-2 text-left transition-colors",
                          role.id === selectedRoleId
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{role.name}</p>
                          <div className="flex items-center gap-1">
                            {role.is_system_role ? (
                              <Badge variant="secondary">System</Badge>
                            ) : null}
                            {isAdmin ? (
                              <div className="flex -translate-x-1 items-center gap-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setEditingRole(role);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  disabled={role.is_system_role === true}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setRolePendingDelete(role);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {role.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {role.description}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No roles found. Create one to begin assigning permissions.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Permissions
                {selectedRole ? (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    for {selectedRole.name}
                  </span>
                ) : null}
              </CardTitle>
              <CardAction>
                <Input
                  placeholder="Search by action or subject"
                  value={permissionSearch}
                  onChange={(event) => setPermissionSearch(event.target.value)}
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              {!selectedRole ? (
                <p className="text-sm text-muted-foreground">
                  Select a role to manage permission assignments.
                </p>
              ) : permissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No permissions found. Create permissions first.
                </p>
              ) : filteredPermissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No permissions match your search.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Permission</TableHead>
                      <TableHead>Default Conditions</TableHead>
                      <TableHead>Role Conditions</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead className="w-[180px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPermissions.map((permission) => {
                      const assignment = assignmentByPermissionId.get(permission.id);
                      const assigned = Boolean(assignment);
                      const roleConditions = assignment?.conditions ?? null;

                      return (
                        <TableRow key={permission.id}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span>
                                  {permission.action}:{permission.subject}
                                </span>
                                {permission.inverted ? (
                                  <Badge variant="destructive">Cannot</Badge>
                                ) : null}
                              </div>
                              {permission.description ? (
                                <span className="text-xs text-muted-foreground">
                                  {permission.description}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            {permission.conditions ? (
                              <code className="rounded bg-muted px-2 py-1 text-xs">
                                {permission.conditions}
                              </code>
                            ) : (
                              <Badge variant="outline">None</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {!assigned ? (
                              <Badge variant="outline">Not assigned</Badge>
                            ) : roleConditions === null ? (
                              <Badge variant="secondary">Inherit default</Badge>
                            ) : roleConditions.length === 0 ? (
                              <Badge variant="outline">No conditions</Badge>
                            ) : (
                              <code className="rounded bg-muted px-2 py-1 text-xs">
                                {roleConditions.length > 80
                                  ? `${roleConditions.slice(0, 80)}...`
                                  : roleConditions}
                              </code>
                            )}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={assigned}
                              disabled={isMutating}
                              onCheckedChange={(checked) =>
                                handleToggleAssignment(permission, checked)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setEditingPermission(permission)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!assigned}
                                onClick={() =>
                                  setEditingConditions({
                                    permissionId: permission.id,
                                    label: `${permission.action}:${permission.subject}`,
                                    currentConditions:
                                      assignment?.conditions ?? null,
                                  })
                                }
                              >
                                Conditions
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </Container>

      <AddRoleDialog open={addRoleOpen} onOpenChange={setAddRoleOpen} />
      <AddPermissionDialog
        open={addPermissionOpen}
        onOpenChange={setAddPermissionOpen}
        roles={roles}
      />
      <EditRoleDialog
        open={Boolean(editingRole)}
        onOpenChange={(open) => {
          if (!open) setEditingRole(null);
        }}
        role={editingRole}
      />
      <EditPermissionDialog
        open={Boolean(editingPermission)}
        onOpenChange={(open) => {
          if (!open) setEditingPermission(null);
        }}
        permission={editingPermission}
      />

      {selectedRole && editingConditions ? (
        <EditRolePermissionConditionsDialog
          open={Boolean(editingConditions)}
          onOpenChange={(open) => {
            if (!open) {
              setEditingConditions(null);
            }
          }}
          roleId={selectedRole.id}
          permissionId={editingConditions.permissionId}
          permissionLabel={editingConditions.label}
          currentConditions={editingConditions.currentConditions}
        />
      ) : null}

      <AlertDialog
        open={Boolean(rolePendingDelete)}
        onOpenChange={(open) => {
          if (!open) setRolePendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              {rolePendingDelete
                ? `Are you sure you want to delete "${rolePendingDelete.name}"? This action will deactivate the role.`
                : "Are you sure you want to delete this role?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRole.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteRole.isPending}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteRole();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRole.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
