import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Trash2,
} from "lucide-react";
import { useSearchParams } from "react-router";
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
import { Skeleton } from "~/components/ui/skeleton";
import {
  useBeginCalendarConnect,
  useCalendarConnections,
  useDisconnectCalendar,
  type CalendarProvider,
} from "~/api/calendar-sync";
import { handleApiError } from "~/api/axios";

const PROVIDERS: Array<{
  value: CalendarProvider;
  label: string;
  description: string;
}> = [
  {
    value: "google",
    label: "Google Calendar",
    description: "Sync events with your primary Google Calendar.",
  },
  {
    value: "microsoft",
    label: "Microsoft Outlook",
    description: "Sync events with your Outlook / Microsoft 365 calendar.",
  },
];

export default function CalendarConnectionsPage() {
  const { data: connections, isLoading } = useCalendarConnections();
  const beginMutation = useBeginCalendarConnect();
  const disconnectMutation = useDisconnectCalendar();
  const [activeBegin, setActiveBegin] = useState<CalendarProvider | null>(null);

  // The OAuth callback redirects back here with ?status=connected|error.
  // Show a toast so the user knows the round-trip worked.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "connected") {
      toast.success("Calendar connected");
    } else if (status === "error") {
      toast.error(searchParams.get("error") ?? "Failed to connect calendar");
    }
    if (status) {
      const next = new URLSearchParams(searchParams);
      next.delete("status");
      next.delete("error");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleBegin = async (provider: CalendarProvider) => {
    setActiveBegin(provider);
    try {
      const res = await beginMutation.mutateAsync(provider);
      // Hand off the browser to the provider's consent screen.
      window.location.href = res.url;
    } catch (err) {
      toast.error(handleApiError(err));
      setActiveBegin(null);
    }
  };

  const handleDisconnect = async (id: string, label: string) => {
    if (!window.confirm(`Disconnect ${label}? You can reconnect later.`)) return;
    try {
      await disconnectMutation.mutateAsync(id);
      toast.success("Calendar disconnected");
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  return (
    <Container>
      <PageHeader
        title="Calendar Connections"
        subtitle="Two-way sync with your Google or Microsoft calendar so meetings booked in the CRM show up in your day, and vice versa."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((p) => {
          const existing = connections?.find(
            (c) => c.provider === p.value && c.is_active,
          );
          return (
            <Card key={p.value}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{p.label}</span>
                  {existing ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>{p.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : existing ? (
                  <>
                    <div className="text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">Account:</span>{" "}
                        {existing.provider_account_id}
                      </div>
                      <div>
                        <span className="font-medium">Last sync:</span>{" "}
                        {existing.last_sync_at
                          ? format(new Date(existing.last_sync_at), "PPpp")
                          : "Pending"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleBegin(p.value)}
                        disabled={beginMutation.isPending}
                      >
                        Re-authorise
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDisconnect(existing.id, p.label)}
                        disabled={disconnectMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Disconnect
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    onClick={() => handleBegin(p.value)}
                    disabled={beginMutation.isPending}
                  >
                    {beginMutation.isPending && activeBegin === p.value ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    Connect {p.label}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </Container>
  );
}
