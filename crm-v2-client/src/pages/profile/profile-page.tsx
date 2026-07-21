import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Activity,
  KeyRound,
  Loader2,
  Mail,
  Shield,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "~/stores/use-auth-store";
import { useChangePassword } from "~/api/auth";
import { useActivityLogs } from "~/api/activity-logs";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "react-router";

const changePasswordSchema = z
  .object({
    current_password: z.string().optional(),
    new_password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const requiresPasswordChange = useAuthStore(
    (state) => state.requiresPasswordChange,
  );
  const changePassword = useChangePassword();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (requiresPasswordChange || location.pathname === "/change-password") {
      setShowPasswordForm(true);
    }
  }, [location.pathname, requiresPasswordChange]);

  const { data: activityData, isLoading: activityLoading } = useActivityLogs({
    actioned_by: user?.id,
    page: 1,
    limit: 20,
  });

  const activityLogs = activityData?.data || [];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onChangePassword = async (values: ChangePasswordValues) => {
    try {
      await changePassword.mutateAsync({
        current_password: values.current_password || undefined,
        new_password: values.new_password,
      });
      toast.success("Password changed successfully");
      reset();
      setShowPasswordForm(false);
    } catch {
      toast.error("Failed to change password");
    }
  };

  if (!user) return null;

  return (
    <div>
      <PageHeader title="My Profile" subtitle="View your account details and activity" />

      <Container className="p-4 space-y-6">
        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <UserIcon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Full Name</p>
                  <p className="text-lg font-semibold">
                    {user.first_name} {user.last_name}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-lg font-semibold">{user.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Roles</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {user.roles.length > 0 ? (
                      user.roles.map((role) => (
                        <Badge key={role} variant="outline">
                          {role}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No Role</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity Logs Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : activityLogs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">
                        {log.entity}
                        {log.entity_id ? ` #${log.entity_id.slice(0, 8)}` : ""}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), {
                          addSuffix: true,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No recent activity
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Security Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Account Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Email */}
            <div className="space-y-2">
              <Label>Email Address</Label>
              <div className="flex items-center gap-3">
                <Input value={user.email} disabled className="max-w-md" />
              </div>
              <p className="text-sm text-muted-foreground">
                Contact your administrator to change your email address.
              </p>
            </div>

            {/* Change Password */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Password</Label>
                  <p className="text-sm text-muted-foreground">
                    Change your account password
                  </p>
                </div>
                {!showPasswordForm && (
                  <Button
                    variant="outline"
                    onClick={() => setShowPasswordForm(true)}
                  >
                    Change Password
                  </Button>
                )}
              </div>

              {showPasswordForm && (
                <form
                  onSubmit={handleSubmit(onChangePassword)}
                  className="space-y-4 max-w-md"
                >
                  <div className="space-y-2">
                    <Label htmlFor="current_password">Current Password</Label>
                    <Input
                      id="current_password"
                      type="password"
                      {...register("current_password")}
                    />
                    {errors.current_password && (
                      <p className="text-sm text-destructive">
                        {errors.current_password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_password">New Password</Label>
                    <Input
                      id="new_password"
                      type="password"
                      {...register("new_password")}
                    />
                    {errors.new_password && (
                      <p className="text-sm text-destructive">
                        {errors.new_password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm_password">Confirm Password</Label>
                    <Input
                      id="confirm_password"
                      type="password"
                      {...register("confirm_password")}
                    />
                    {errors.confirm_password && (
                      <p className="text-sm text-destructive">
                        {errors.confirm_password.message}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Update Password
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowPasswordForm(false);
                        reset();
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      </Container>
    </div>
  );
}
