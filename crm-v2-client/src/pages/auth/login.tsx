import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { useLogin } from "~/api/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import AuthLayout from "./layout";
import { useSettingsContext } from "~/providers/settings-provider";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  two_factor_code: z.string().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const settings = useSettingsContext();

  const companyName = (settings.getSetting("company_name") ||
    "Digilearn") as string;
  const [show2FA, setShow2FA] = useState(false);
  const loginMutation = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      two_factor_code: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      await loginMutation.mutateAsync({
        email: data.email,
        password: data.password,
        two_factor_code: data.two_factor_code,
      });
      toast.success("Login successful!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Login failed";

      // Check if 2FA is required
      if (errorMessage.includes("2FA") || errorMessage.includes("two-factor")) {
        setShow2FA(true);
        toast.error("Please enter your 2FA code");
      } else {
        toast.error(errorMessage);
      }
    }
  };
  return (
    <AuthLayout>
      <div className="md:grid grid-cols-2 rounded-xl overflow-hidden shadow-xl md:max-w-4xl w-full">
        <div className="bg-primary">
          <div className="flex flex-col gap-4 p-6 h-full">
            <img src="./images/digilearn-logo.png" className="w-[320px]" />
            <div className="mt-auto">
              <h1 className="text-xl md:text-2xl text-background font-semibold leading-tight">
                Smart Teaching,&nbsp;
                <span className="text-yellow-300">Simple Learning</span>
              </h1>
              <p className="mt-6 text-white/90 max-w-md">
                Embark on the journey to transform your classrooms and empower
                your learners today!
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-6 w-full max-w-md bg-card">
          <div className="text-center flex flex-col items-center space-y-2">
            <h3 className="text-lg font-semibold">{companyName} CRM</h3>
            <p className="text-muted-foreground tet-sm">
              Welcome back, Please login to continue
            </p>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="john.doe@example.com"
                        autoComplete="email"
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
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link
                        to="/forgot-password"
                        className="text-sm text-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {show2FA && (
                <FormField
                  control={form.control}
                  name="two_factor_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Two-Factor Code</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="Enter 6-digit code"
                          maxLength={8}
                          autoComplete="one-time-code"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Sign In
              </Button>
              <div className="text-center mt-8">
                <p className="text-sm text-muted-foreground">
                  Powered By Digilearn Software
                </p>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </AuthLayout>
  );
}
