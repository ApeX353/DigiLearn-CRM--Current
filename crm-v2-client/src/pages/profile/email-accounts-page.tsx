import { useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  Mail,
  Plus,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import {
  useCreateSmtpAccount,
  useDeleteUserEmailAccount,
  useTestSendEmailAccount,
  useUpdateUserEmailAccount,
  useUserEmailAccounts,
  useVerifyEmailAccount,
  type UserEmailAccount,
} from "~/api/user-email";
import { handleApiError } from "~/api/axios";

interface SmtpForm {
  email_address: string;
  display_name: string;
  host: string;
  port: string; // kept as string so the input doesn't fight the user
  secure: boolean;
  username: string;
  password: string;
  make_default: boolean;
}

const EMPTY_FORM: SmtpForm = {
  email_address: "",
  display_name: "",
  host: "",
  port: "587",
  secure: false,
  username: "",
  password: "",
  make_default: false,
};

const CLEARHUE_WEBMAIL_PRESET = {
  host: "premium164.web-hosting.com",
  port: "465",
  secure: true,
};

export default function EmailAccountsPage() {
  const { data: accounts, isLoading } = useUserEmailAccounts();
  const createMutation = useCreateSmtpAccount();
  const updateMutation = useUpdateUserEmailAccount();
  const deleteMutation = useDeleteUserEmailAccount();
  const verifyMutation = useVerifyEmailAccount();
  const testSendMutation = useTestSendEmailAccount();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<SmtpForm>(EMPTY_FORM);
  const [activeVerifyId, setActiveVerifyId] = useState<string | null>(null);
  const [activeTestId, setActiveTestId] = useState<string | null>(null);

  const reset = () => setForm(EMPTY_FORM);

  const applyClearhueWebmailPreset = () => {
    setForm((current) => ({
      ...current,
      host: CLEARHUE_WEBMAIL_PRESET.host,
      port: CLEARHUE_WEBMAIL_PRESET.port,
      secure: CLEARHUE_WEBMAIL_PRESET.secure,
      username: current.username || current.email_address,
    }));
  };

  const handleSubmit = async () => {
    const port = Number(form.port);
    if (!form.email_address || !form.host || !form.username || !form.password) {
      toast.error("Fill in email, host, username, and password");
      return;
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      toast.error("Port must be between 1 and 65535");
      return;
    }
    try {
      await createMutation.mutateAsync({
        email_address: form.email_address.trim(),
        display_name: form.display_name.trim() || undefined,
        host: form.host.trim(),
        port,
        secure: form.secure,
        username: form.username.trim(),
        password: form.password,
        make_default: form.make_default,
      });
      toast.success("SMTP account connected");
      setDialogOpen(false);
      reset();
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  const handleVerify = async (acct: UserEmailAccount) => {
    setActiveVerifyId(acct.id);
    try {
      const res = await verifyMutation.mutateAsync(acct.id);
      if (res.ok) {
        toast.success(`Verified — ${acct.email_address} looks good`);
      } else {
        toast.error(res.error ?? "SMTP verification failed");
      }
    } catch (err) {
      toast.error(handleApiError(err));
    } finally {
      setActiveVerifyId(null);
    }
  };

  const handleTestSend = async (acct: UserEmailAccount) => {
    setActiveTestId(acct.id);
    try {
      await testSendMutation.mutateAsync({ id: acct.id });
      toast.success(`Test email queued to ${acct.email_address}`);
    } catch (err) {
      toast.error(handleApiError(err));
    } finally {
      setActiveTestId(null);
    }
  };

  const handleSetDefault = async (acct: UserEmailAccount) => {
    if (acct.is_default) return;
    try {
      await updateMutation.mutateAsync({
        id: acct.id,
        data: { is_default: true },
      });
      toast.success(`${acct.email_address} is now your default sender`);
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  const handleToggleActive = async (acct: UserEmailAccount) => {
    try {
      await updateMutation.mutateAsync({
        id: acct.id,
        data: { is_active: !acct.is_active },
      });
      toast.success(acct.is_active ? "Account disabled" : "Account enabled");
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  const handleDelete = async (acct: UserEmailAccount) => {
    if (
      !window.confirm(
        `Disconnect ${acct.email_address}? You can reconnect any time.`,
      )
    ) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(acct.id);
      toast.success("Account disconnected");
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  return (
    <Container>
      <PageHeader
        title="Email Accounts"
        subtitle="Send CRM emails from your own hosted mailbox and keep replies in that inbox."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Connect SMTP
          </Button>
        }
      />

      <section className="p-4 space-y-4">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (accounts ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No sending accounts yet. Connect an SMTP account to start
              sending emails from your hosted mailbox.
            </CardContent>
          </Card>
        ) : (
          (accounts ?? []).map((acct) => (
            <Card key={acct.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    {acct.email_address}
                    {acct.is_default && (
                      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-200">
                        <Star className="h-3 w-3 mr-1" /> Default
                      </Badge>
                    )}
                    {!acct.is_active && (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                    <Badge variant="outline" className="uppercase text-[10px]">
                      {acct.provider}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {acct.display_name ? (
                      <>
                        <span className="font-medium">
                          {acct.display_name}
                        </span>{" "}
                        •{" "}
                      </>
                    ) : null}
                    {acct.last_verified_at ? (
                      <>
                        <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-500 mr-1" />
                        Verified{" "}
                        {format(new Date(acct.last_verified_at), "MMM d, yyyy")}
                      </>
                    ) : (
                      <>
                        <CircleAlert className="inline h-3.5 w-3.5 text-amber-500 mr-1" />
                        Not yet verified
                      </>
                    )}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleVerify(acct)}
                  disabled={activeVerifyId === acct.id}
                >
                  {activeVerifyId === acct.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                  )}
                  Verify
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestSend(acct)}
                  disabled={activeTestId === acct.id}
                >
                  {activeTestId === acct.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  ) : (
                    <Send className="h-3.5 w-3.5 mr-2" />
                  )}
                  Send test
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSetDefault(acct)}
                  disabled={acct.is_default}
                >
                  <Star className="h-3.5 w-3.5 mr-2" />
                  {acct.is_default ? "Default" : "Make default"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleActive(acct)}
                >
                  {acct.is_active ? "Disable" : "Enable"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(acct)}
                  className="text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Remove
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect an SMTP account</DialogTitle>
            <DialogDescription>
              Use the same mailbox you open through webmail. For Clearhue
              webmail, apply the preset below, then enter the full email
              address and mailbox password.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-dashed p-3 text-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Clearhue webmail settings</p>
                <p className="text-muted-foreground">
                  Host {CLEARHUE_WEBMAIL_PRESET.host}, port{" "}
                  {CLEARHUE_WEBMAIL_PRESET.port}, SSL on.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyClearhueWebmailPreset}
              >
                Use preset
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="acc-email">From address</Label>
              <Input
                id="acc-email"
                type="email"
                value={form.email_address}
                onChange={(e) => {
                  const email = e.target.value;
                  setForm((current) => ({
                    ...current,
                    email_address: email,
                    username:
                      !current.username || current.username === current.email_address
                        ? email
                        : current.username,
                  }));
                }}
                placeholder="rep@acme.com"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="acc-display">Display name (optional)</Label>
              <Input
                id="acc-display"
                value={form.display_name}
                onChange={(e) =>
                  setForm({ ...form, display_name: e.target.value })
                }
                placeholder="Jane Rep (Acme Sales)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-host">SMTP host</Label>
              <Input
                id="acc-host"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="premium164.web-hosting.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-port">Port</Label>
              <Input
                id="acc-port"
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-user">Username</Label>
              <Input
                id="acc-user"
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value })
                }
                placeholder="rep@acme.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-pass">Password</Label>
              <Input
                id="acc-pass"
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-center gap-2 md:col-span-2 pt-2">
              <Switch
                id="acc-secure"
                checked={form.secure}
                onCheckedChange={(v) => setForm({ ...form, secure: v })}
              />
              <Label htmlFor="acc-secure" className="cursor-pointer">
                Implicit TLS (port 465). Leave off for STARTTLS on 587.
              </Label>
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <Switch
                id="acc-default"
                checked={form.make_default}
                onCheckedChange={(v) =>
                  setForm({ ...form, make_default: v })
                }
              />
              <Label htmlFor="acc-default" className="cursor-pointer">
                Make this my default sender
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDialogOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Connect account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
