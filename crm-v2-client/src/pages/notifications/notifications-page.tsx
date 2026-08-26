import { useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import Container from "~/components/container";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import { useAuthStore } from "~/stores/use-auth-store";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "~/api/notifications/use-notifications";
import type {
  Notification,
  NotificationSeverity,
} from "~/api/notifications/types";

/**
 * The notification inbox.
 *
 * The bell only ever showed a short unread peek, so an alert that scrolled
 * past was gone. This is the full record, and it answers the three questions
 * the product owner asked of every notification: who it is for, when it was
 * triggered, and which record it is about.
 *
 * "Who it is for" is always the signed-in user - the endpoint behind this is
 * my-notifications, which is scoped server-side - but it is stated rather
 * than implied, because the complaint that started this work was people
 * receiving alerts meant for someone else.
 */

const PAGE_SIZE = 25;

const SEVERITY_META: Record<
  NotificationSeverity,
  { icon: typeof Info; label: string; className: string }
> = {
  info: {
    icon: Info,
    label: "Info",
    className: "text-sky-600 bg-sky-50 border-sky-200",
  },
  success: {
    icon: CheckCheck,
    label: "Done",
    className: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  warning: {
    icon: AlertTriangle,
    label: "Needs attention",
    className: "text-amber-600 bg-amber-50 border-amber-200",
  },
  error: {
    icon: XCircle,
    label: "Critical",
    className: "text-red-600 bg-red-50 border-red-200",
  },
};

/** Entity label as a person would say it, not as the column stores it. */
const ENTITY_LABEL: Record<string, string> = {
  Lead: "Lead",
  Deal: "Deal",
  School: "School",
  Activity: "Activity",
  Invoice: "Invoice",
  BugReport: "Bug report",
  Product: "Product",
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<"all" | "unread">("all");
  const [severity, setSeverity] = useState<string>("all");
  const [entity, setEntity] = useState<string>("all");
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(tab === "unread" ? { unreadOnly: true } : {}),
      ...(severity !== "all"
        ? { severity: severity as NotificationSeverity }
        : {}),
      ...(entity !== "all" ? { entity } : {}),
    }),
    [page, tab, severity, entity],
  );

  const { data, isLoading, isFetching } = useNotifications(params);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items: Notification[] = data?.data ?? [];
  const pageMeta = data?.meta;
  const totalPages = pageMeta?.totalPages ?? 1;
  const totalItems = pageMeta?.totalItems ?? items.length;

  const recipient =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
    user?.email ||
    "you";

  /** Reset to the first page whenever the filters change under us. */
  const changeFilter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const open = (n: Notification) => {
    if (n.isRead === false) markRead.mutate(n.id);
    if (n.action_url) navigate(n.action_url);
  };

  return (
    <Container>
      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Notifications
            </h1>
            <p className="text-sm text-muted-foreground">
              Everything addressed to {recipient}
              {typeof totalItems === "number"
                ? " - " + totalItems + " in total"
                : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={severity}
              onValueChange={(v) => changeFilter(() => setSeverity(v))}
            >
              <SelectTrigger className="w-[168px]">
                <SelectValue placeholder="Any severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any severity</SelectItem>
                <SelectItem value="error">Critical</SelectItem>
                <SelectItem value="warning">Needs attention</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="success">Done</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={entity}
              onValueChange={(v) => changeFilter(() => setEntity(v))}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Anything" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anything</SelectItem>
                <SelectItem value="Lead">Leads</SelectItem>
                <SelectItem value="Deal">Deals</SelectItem>
                <SelectItem value="Activity">Activities</SelectItem>
                <SelectItem value="School">Schools</SelectItem>
                <SelectItem value="BugReport">Bug reports</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              disabled={markAllRead.isPending || !items.length}
              onClick={() =>
                markAllRead.mutate(undefined, {
                  onSuccess: () =>
                    toast.success("All notifications marked read"),
                  onError: () => toast.error("Could not mark them read"),
                })
              }
            >
              {markAllRead.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-2 h-4 w-4" />
              )}
              Mark all read
            </Button>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) =>
            changeFilter(() => setTab(v as "all" | "unread"))
          }
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading notifications
          </div>
        ) : !items.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <BellOff className="h-8 w-8" />
            <p className="font-medium">
              {tab === "unread" ? "Nothing unread" : "No notifications"}
            </p>
            <p className="text-sm">
              {tab === "unread"
                ? "You are all caught up."
                : "Alerts about your leads and deals will appear here."}
            </p>
          </div>
        ) : (
          <ul
            className={cn(
              "divide-y rounded-md border",
              isFetching && "opacity-60",
            )}
            data-testid="notifications-list"
          >
            {items.map((n) => {
              const sev = SEVERITY_META[n.severity ?? "info"] ?? SEVERITY_META.info;
              const Icon = sev.icon;
              const unread = n.isRead === false;
              const when = n.createdAt ? new Date(n.createdAt) : null;

              return (
                <li
                  key={n.id}
                  onClick={() => open(n)}
                  className={cn(
                    "flex cursor-pointer gap-3 p-4 transition-colors hover:bg-muted/50",
                    unread && "bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                      sev.className,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "truncate",
                          unread ? "font-semibold" : "font-medium",
                        )}
                      >
                        {n.title}
                      </span>
                      {unread && (
                        <Badge
                          variant="default"
                          className="h-5 px-1.5 text-[10px]"
                        >
                          New
                        </Badge>
                      )}
                      {n.entity && (
                        <Badge
                          variant="outline"
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {ENTITY_LABEL[n.entity] ?? n.entity}
                        </Badge>
                      )}
                    </div>

                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {n.message}
                    </p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Bell className="h-3 w-3" />
                        For {recipient}
                      </span>
                      {when && (
                        <span title={format(when, "PPpp")}>
                          Triggered{" "}
                          {formatDistanceToNow(when, { addSuffix: true })}
                        </span>
                      )}
                      {n.action_url && (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <CircleAlert className="h-3 w-3" />
                          Open the record
                        </span>
                      )}
                    </div>
                  </div>

                  {unread && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 self-start"
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead.mutate(n.id);
                      }}
                    >
                      Mark read
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {pageMeta?.currentPage ?? page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
