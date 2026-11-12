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
  useBeginVideoConnect,
  useDisconnectVideo,
  useVideoConnections,
  type VideoProvider,
} from "~/api/video-integrations";
import { handleApiError } from "~/api/axios";

const PROVIDERS: Array<{
  value: VideoProvider;
  label: string;
  description: string;
  /** Whether the backend has a working adapter today. */
  available: boolean;
}> = [
  {
    value: "zoom",
    label: "Zoom",
    description:
      "Auto-create Zoom meetings for confirmed bookings on Zoom-typed scheduling links.",
    available: true,
  },
  {
    value: "google_meet",
    label: "Google Meet",
    description: "Adapter under construction — connect Google Calendar instead for now.",
    available: false,
  },
  {
    value: "teams",
    label: "Microsoft Teams",
    description: "Adapter under construction — manual link entry still works.",
    available: false,
  },
];

export default function VideoConnectionsPage() {
  const { data: connections, isLoading } = useVideoConnections();
  const beginMutation = useBeginVideoConnect();
  const disconnectMutation = useDisconnectVideo();
  const [activeBegin, setActiveBegin] = useState<VideoProvider | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "connected") toast.success("Video provider connected");
    else if (status === "error")
      toast.error(searchParams.get("error") ?? "Failed to connect provider");
    if (status) {
      const next = new URLSearchParams(searchParams);
      next.delete("status");
      next.delete("error");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleBegin = async (provider: VideoProvider) => {
    setActiveBegin(provider);
    try {
      const res = await beginMutation.mutateAsync(provider);
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
      toast.success("Provider disconnected");
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  return (
    <Container>
      <PageHeader
        title="Video Conferencing"
        subtitle="Auto-generate Zoom / Meet / Teams links for meetings booked through your scheduling pages."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((p) => {
          const existing = connections?.find(
            (c) => c.provider === p.value && c.is_active,
          );
          return (
            <Card key={p.value} className={p.available ? "" : "opacity-70"}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{p.label}</span>
                  {existing ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                    </Badge>
                  ) : !p.available ? (
                    <Badge variant="outline">Coming soon</Badge>
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
                        <span className="font-medium">Connected:</span>{" "}
                        {format(new Date(existing.created_at), "PP")}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDisconnect(existing.id, p.label)}
                      disabled={disconnectMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => handleBegin(p.value)}
                    disabled={!p.available || beginMutation.isPending}
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
