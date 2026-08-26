import { Book } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useSearchParams } from "react-router";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { useResetPassword } from "~/api/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import AuthLayout from "./layout";
import { BackToLogin } from "./components/back-to-login";
import { ErrorMessage } from "~/components/ui/error-message";

const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "token is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z
      .string()
      .min(8, "Confirm Password must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const resetPasswordMutation = useResetPassword();
  const [searchParams] = useSearchParams();

  const token = searchParams.get("token") as string;

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token,
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: ResetPasswordFormValues) => {
    try {
      await resetPasswordMutation.mutateAsync({
        token: data.token,
        new_password: data.password,
      });
      toast.success("Password reset successful!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Reset Password failed";

      toast.error(errorMessage);
    }
  };

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AuthLayout>
      <div className="p-6 space-y-6 w-full max-w-md bg-card rounded-xl border border-border">
        <div className="text-center flex flex-col items-center space-y-2">
          <Book className="text-primary size-8" />
          <h3 className="text-2xl font-semibold">DigiLearn</h3>
          <p className="text-muted-foreground">Teacher Productivity Suite</p>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ErrorMessage error={resetPasswordMutation.error} />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="********" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Re-enter password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reset Password
            </Button>
            <BackToLogin />
            <div className="text-center mt-8">
              <p className="text-sm text-muted-foreground">
                Powered By DigiLearn Software
              </p>
            </div>
          </form>
        </Form>
      </div>
    </AuthLayout>
  );
}
