import { Book, MailCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { useRequestPasswordReset } from "~/api/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import AuthLayout from "./layout";
import { useState } from "react";
import { BackToLogin } from "./components/back-to-login";
import { useSettingsContext } from "~/providers/settings-provider";

const forgotPasswordSchema = z.object({
  email: z.email("Invalid email address"),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isSuccess, setShowSuccess] = useState(false);
  const forgotPasswordMutation = useRequestPasswordReset();
  const settings = useSettingsContext();

  const companyName = (settings.getSetting("company_name") ||
    "Digilearn") as string;

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    try {
      await forgotPasswordMutation.mutateAsync(
        {
          email: data.email,
        },
        {
          onSuccess: () => {
            setShowSuccess(true);
            toast.success("ForgotPassword successful!");
          },
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "ForgotPassword failed";

      toast.error(errorMessage);
    }
  };

  return (
    <AuthLayout>
      <div className="p-6 space-y-6 w-full max-w-md bg-card rounded-xl border border-border">
        <div className="text-center flex flex-col items-center space-y-2">
          <Book className="text-primary size-8" />
          <h3 className="text-2xl font-semibold">{companyName}</h3>
          {!isSuccess && (
            <p className="text-muted-foreground">
              Enter your email to reset your password.
            </p>
          )}
        </div>
        {isSuccess ? (
          <div className="text-center space-y-12">
            <div className="space-y-2">
              <MailCheck className="h-6 w-6 mx-auto" />
              <p className="text-xl">Check your email</p>
              <p className="text-muted-foreground">
                We've sent a password rest link to your email,{" "}
                {form.watch("email")}
              </p>
              <p className="text-muted-foreground">
                If you did not receive the email, check your spam folder.
              </p>
            </div>
            <div>
              <div className="flex gap-x-2 items-center">
                <p>Wrong Email Address?. </p>
                <Button
                  variant="link"
                  onClick={() => {
                    form.reset();
                    setShowSuccess(false);
                  }}
                >
                  Change Email Address
                </Button>
              </div>
              <BackToLogin showExtraText />
            </div>
          </div>
        ) : (
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
              <Button
                type="submit"
                className="w-full"
                disabled={forgotPasswordMutation.isPending}
              >
                {forgotPasswordMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Request Reset Password
              </Button>
              <BackToLogin showExtraText />
              <div className="text-center mt-8">
                <p className="text-sm text-muted-foreground">
                  Powered By Digilearn Software
                </p>
              </div>
            </form>
          </Form>
        )}
      </div>
    </AuthLayout>
  );
}
