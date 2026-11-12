import { useState } from "react";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Users as UsersIcon,
  MoreHorizontal,
  Shield,
  UserX,
  UserCheck,
  Loader2,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { useStaff, useToggleUserActive, type StaffUser } from "~/api/users";
import { ChangeRoleDialog } from "~/components/admin/change-role-dialog";
import { AddStaffDialog } from "~/components/admin/add-staff-dialog";
import {
  TerritoryDialog,
  parseTerritories,
} from "~/components/admin/territory-dialog";
import { usePermission } from "~/hooks/use-permission";

export default function StaffPage() {
  // The page itself only needs read:User — sales_manager is seeded with
  // it and the server allows them on GET /users, so they get a read-only
  // roster. Mutating controls stay behind manage:User below.
  const canManageUsers = usePermission("User", "manage");
  const canReadUsers = usePermission("User", "read");

  if (!canManageUsers && !canReadUsers) {
    return (
      <div>
        <PageHeader title="Staff" subtitle="Manage user accounts and roles" />
        <Container className="p-4">
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to manage users. Contact your
              administrator to request access.
            </AlertDescription>
          </Alert>
        </Container>
      </div>
    );
  }

  return <StaffManagement canManage={canManageUsers} />;
}

const StaffManagement = ({ canManage }: { canManage: boolean }) => {
  const { data, isLoading } = useStaff({
    page: 1,
    limit: 100,
    status: "all",
  });
  const toggleActive = useToggleUserActive();
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [territoryDialogOpen, setTerritoryDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null);

  const users = data?.data || [];

  const handleToggleActive = async (user: StaffUser) => {
    try {
      await toggleActive.mutateAsync({
        id: user.id,
        activate: !user.is_active,
      });
      toast.success(user.is_active ? "User deactivated" : "User activated");
    } catch {
      toast.error("Failed to update user status");
    }
  };

  const handleChangeRole = (user: StaffUser) => {
    setSelectedUser(user);
    setRoleDialogOpen(true);
  };

  const handleSetTerritories = (user: StaffUser) => {
    setSelectedUser(user);
    setTerritoryDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Staff" subtitle="Manage user accounts and roles" />
        <Container className="p-4">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle={
          canManage
            ? "Manage user accounts and roles"
            : "Team roster (read-only)"
        }
        actions={canManage ? <AddStaffDialog /> : undefined}
      />

      <Container className="p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5" />
              Team Members ({users.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {users.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Territories</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12.5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow
                      key={user.id}
                      className={!user.is_active ? "opacity-60" : ""}
                    >
                      <TableCell className="font-medium">
                        {user.first_name} {user.last_name}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.roles.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map((role) => (
                              <Badge key={role.id} variant="outline">
                                {role.name}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            No Role
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {parseTerritories(user.territory_provinces).length >
                        0 ? (
                          <div className="flex flex-wrap gap-1">
                            {parseTerritories(user.territory_provinces).map(
                              (p) => (
                                <Badge key={p} variant="secondary">
                                  {p}
                                </Badge>
                              ),
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.is_active ? "default" : "secondary"}
                        >
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleChangeRole(user)}
                            >
                              <Shield className="mr-2 h-4 w-4" />
                              Change Role
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleSetTerritories(user)}
                            >
                              <MapPin className="mr-2 h-4 w-4" />
                              Set Territories
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleToggleActive(user)}
                            >
                              {user.is_active ? (
                                <>
                                  <UserX className="mr-2 h-4 w-4" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No users found
              </div>
            )}
          </CardContent>
        </Card>
      </Container>

      <ChangeRoleDialog
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
        user={selectedUser}
      />
      <TerritoryDialog
        open={territoryDialogOpen}
        onOpenChange={setTerritoryDialogOpen}
        user={selectedUser}
      />
    </div>
  );
};
