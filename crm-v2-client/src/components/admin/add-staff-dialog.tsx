import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import Modal from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { useCreateUser } from "~/api/users";
import { useRoles } from "~/api/rbac";

const formSchema = z.object({
  email: z.email("Invalid email address"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  role_ids: z.array(z.string()),
});

type FormValues = z.infer<typeof formSchema>;

export function AddStaffDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const createUser = useCreateUser();
  const { data: rolesData, isLoading: rolesLoading } = useRoles();

  const roles = rolesData?.data || [];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      first_name: "",
      last_name: "",
      password: "",
      role_ids: [],
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await createUser.mutateAsync({
        ...values,
        password: values.password || undefined,
      });
      toast.success("Staff member created successfully");
      setIsOpen(false);
      form.reset();
    } catch {
      toast.error("Failed to create staff member");
    }
  };

  const toggleRole = (roleId: string) => {
    const current = form.getValues("role_ids");
    if (current.includes(roleId)) {
      form.setValue(
        "role_ids",
        current.filter((id) => id !== roleId),
      );
    } else {
      form.setValue("role_ids", [...current, roleId]);
    }
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Add Staff
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Add Staff Member"
        description="Create a new user account"
        size="sm"
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john.doe@company.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Min 8 characters"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <Label>Roles</Label>
              {rolesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {roles.map((role) => (
                    <div key={role.id} className="flex items-center space-x-3">
                      <Checkbox
                        id={`new-role-${role.id}`}
                        checked={form.watch("role_ids").includes(role.id)}
                        onCheckedChange={() => toggleRole(role.id)}
                      />
                      <Label
                        htmlFor={`new-role-${role.id}`}
                        className="cursor-pointer"
                      >
                        {role.name}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsOpen(false);
                  form.reset();
                }}
                disabled={createUser.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </Form>
      </Modal>
    </>
  );
}
