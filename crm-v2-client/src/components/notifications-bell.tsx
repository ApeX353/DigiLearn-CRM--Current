import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Bell,
  CheckCheck,
  Archive,
  AlertTriangle,
  AlertCircle,
  Info,
  Check,
  ArrowLeft,
  Bug,
  ClipboardCheck,
  Clock3,
  ListTodo,
  ShieldAlert,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Badge } from "~/components/ui/badge";
import { ScrollArea } from "~/components/ui/scroll-area";
import { format } from "date-fns";
import {
  useNotifications,
  useNotificationGroups,
  useUnreadNotificationsCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useArchiveNotification,
  type Notification,
  type NotificationSeverity,
  type NotificationGroup,
} from "~/api/notifications";
import { NOTIFICATION_GROUP_LABELS } from "~/lib/notification-groups";
import { cn } from "~/lib/utils";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<NotificationGroup | null>(null);
  const { data: groups = [], isLoading: groupsLoading } = useNotificationGroups();
  const { data: notificationsData, isLoading } = useNotifications(
    selectedGroup
      ? {
          page: 1,
          limit: 20,
          channel: "in-app",
          unreadOnly: true,
          group: selectedGroup,
        }
      : undefined,
    { enabled: Boolean(selectedGroup) },
  );
  const notifications = notificationsData?.data || [];
  const { data: unreadCount = 0 } = useUnreadNotificationsCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const archiveNotification = useArchiveNotification();
  const navigate = useNavigate();

  const isUnread = (notification: Notification) =>
    notification.isRead === false || notification.status === "unread";

  const handleNotificationClick = async (notification: Notification) => {
    if (isUnread(notification)) {
      await markRead.mutateAsync(notification.id);
    }

    if (notification.action_url) {
      navigate(notification.action_url);
      setOpen(false);
      return;
    }

    if (notification.entity && notification.entity_id) {
      const entityType = notification.entity.toLowerCase();
      const routes: Record<string, string> = {
        lead: `/leads/${notification.entity_id}`,
        deal: `/deals/${notification.entity_id}`,
        task: `/tasks`,
      };
      const route = routes[entityType];
      if (route) {
        navigate(route);
        setOpen(false);
      }
    }
  };

  /** Clear one notification without opening it or leaving the page. */
  const handleMarkRead = async (
    event: React.MouseEvent,
    notificationId: string,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    await markRead.mutateAsync(notificationId);
  };

  const handleArchive = async (
    event: React.MouseEvent,
    notificationId: string,
  ) => {
    event.stopPropagation();
    await archiveNotification.mutateAsync(notificationId);
  };

  const handleMarkAllRead = async () => {
    await markAllRead.mutateAsync();
  };

  const getSeverityIcon = (severity?: NotificationSeverity) => {
    switch (severity) {
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "success":
        return <Check className="h-4 w-4 text-green-600" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityStyles = (
    severity: NotificationSeverity | undefined,
    unread: boolean,
  ) => {
    const base = unread ? "bg-muted/50" : "";
    switch (severity) {
      case "error":
        return cn(base, unread && "border-l-2 border-l-destructive");
      case "warning":
        return cn(base, unread && "border-l-2 border-l-amber-500");
      case "success":
        return cn(base, unread && "border-l-2 border-l-green-500");
      default:
        return cn(base, unread && "border-l-2 border-l-blue-500");
    }
  };

  const getEventTypeLabel = (eventType: string): string => {
    if (!eventType) {
      return "Notification";
    }

    const labels: Record<string, string> = {
      "lead.sla_at_risk": "SLA Warning",
      "lead.sla_breached": "SLA Breach",
      "lead.followup_due": "Follow-up Due",
      "lead.followup_missed": "Missed Follow-up",
      "lead.converted_to_deal": "Conversion",
      "lead.reversal_requested": "Reversal Requested",
      "lead.reversal_approved": "Reversal Approved",
      "lead.reversal_rejected": "Reversal Rejected",
      "deal.sla_at_risk": "SLA Warning",
      "deal.sla_breached": "SLA Breach",
      "deal.followup_due": "Follow-up Due",
      "deal.followup_missed": "Missed Follow-up",
      "task.assigned": "Task Assigned",
      "task.overdue": "Task Overdue",
      "sla_breach": "SLA Breach",
      "idle_lead": "Idle Lead",
      "sla_at_risk": "SLA Warning",
      "follow_up_due": "Follow-up Due",
      "task_assigned": "Task Assigned",
    };
    return (
      labels[eventType] ||
      eventType.replace(/[._]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
    );
  };

  const getGroupIcon = (group: NotificationGroup) => {
    const className = "h-4 w-4 text-muted-foreground";
    switch (group) {
      case "tasks":
        return <ListTodo className={className} />;
      case "reminders":
        return <Clock3 className={className} />;
      case "sla":
        return <ShieldAlert className={className} />;
      case "bugs":
        return <Bug className={className} />;
      case "approvals":
        return <ClipboardCheck className={className} />;
      default:
        return <Bell className={className} />;
    }
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSelectedGroup(null);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="notification-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              // Width grows with the number — the badge used to be a fixed
              // 20px circle showing "9+", which told you nothing once you
              // had more than nine waiting.
              className="absolute -top-1 -right-1 h-5 min-w-5 w-auto px-1 flex items-center justify-center text-xs tabular-nums"
              data-testid="notification-unread-badge"
              title={`${unreadCount} unread`}
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-96"
        data-testid="notification-dropdown"
      >
        <DropdownMenuLabel className="flex items-center justify-between">
          {selectedGroup ? (
            <span className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="All notification groups"
                aria-label="All notification groups"
                onClick={() => setSelectedGroup(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {NOTIFICATION_GROUP_LABELS[selectedGroup]}
            </span>
          ) : (
            <span>Notifications</span>
          )}
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs"
              onClick={handleMarkAllRead}
              data-testid="notification-mark-all-read"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {!selectedGroup ? (
          groupsLoading ? (
            <div
              className="p-4 text-center text-sm text-muted-foreground"
              data-testid="notification-loading"
            >
              Loading...
            </div>
          ) : groups.length === 0 ? (
            <div
              className="p-4 text-center text-sm text-muted-foreground"
              data-testid="notification-empty"
            >
              No unread notifications
            </div>
          ) : (
            <div className="py-1" data-testid="notification-groups">
              {groups.map((summary) => (
                <button
                  key={summary.group}
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => setSelectedGroup(summary.group)}
                  data-testid="notification-group"
                  data-notification-group={summary.group}
                >
                  {getGroupIcon(summary.group)}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {NOTIFICATION_GROUP_LABELS[summary.group]}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {summary.latestTitle}
                    </span>
                  </span>
                  <Badge variant="secondary" className="tabular-nums">
                    {summary.unreadCount}
                  </Badge>
                </button>
              ))}
            </div>
          )
        ) : isLoading ? (
          <div
            className="p-4 text-center text-sm text-muted-foreground"
            data-testid="notification-loading"
          >
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div
            className="p-4 text-center text-sm text-muted-foreground"
            data-testid="notification-empty"
          >
            No notifications
          </div>
        ) : (
          <ScrollArea className="h-[400px]" data-testid="notification-list">
            {notifications.map((notification) => {
              const unread = isUnread(notification);
              const severity = notification.severity;
              const eventType = notification.event_type || notification.entity || "";
              const createdAt = notification.createdAt
                ? new Date(notification.createdAt)
                : null;

              return (
                <DropdownMenuItem
                  key={notification.id}
                  className={cn(
                    "flex flex-col items-start gap-1 p-3 cursor-pointer",
                    getSeverityStyles(severity, unread),
                  )}
                  onClick={() => handleNotificationClick(notification)}
                  data-testid="notification-item"
                  data-notification-id={notification.id}
                  data-notification-type={eventType}
                >
                  <div className="flex items-start gap-2 w-full">
                    <div className="mt-0.5">{getSeverityIcon(severity)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0",
                            severity === "error" &&
                              "border-destructive text-destructive",
                            severity === "warning" &&
                              "border-amber-500 text-amber-600",
                            severity === "success" &&
                              "border-green-500 text-green-600",
                          )}
                          data-testid="notification-type-badge"
                        >
                          {getEventTypeLabel(eventType)}
                        </Badge>
                      </div>
                      <p
                        className={cn("text-sm", unread && "font-medium")}
                        data-testid="notification-title"
                      >
                        {notification.title || "Notification"}
                      </p>
                      <p
                        className="text-xs text-muted-foreground line-clamp-2 mt-0.5"
                        data-testid="notification-message"
                      >
                        {notification.message || ""}
                      </p>
                      {createdAt && (
                        <p
                          className="text-[10px] text-muted-foreground mt-1"
                          data-testid="notification-time"
                        >
                          {format(createdAt, "MMM d, h:mm a")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      {unread && (
                        <div
                          className="w-2 h-2 rounded-full bg-primary flex-shrink-0"
                          data-testid="notification-unread-dot"
                        />
                      )}
                      {/* Reading used to be possible only by clicking the
                          row, which also navigates away — so there was no
                          way to clear one without opening it. */}
                      {unread && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Mark as read"
                          aria-label="Mark as read"
                          onClick={(event) =>
                            handleMarkRead(event, notification.id)
                          }
                          data-testid="notification-mark-read"
                        >
                          <Check className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Archive"
                        aria-label="Archive"
                        onClick={(event) =>
                          handleArchive(event, notification.id)
                        }
                        data-testid="notification-archive"
                      >
                        <Archive className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </ScrollArea>
        )}

        {/* The bell is a peek, not the record. Everything lives on the page. */}
        <DropdownMenuSeparator />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-xs"
          onClick={() => {
            navigate(
              selectedGroup
                ? `/notifications?group=${selectedGroup}`
                : "/notifications",
            );
            setOpen(false);
          }}
          data-testid="notification-view-all"
        >
          View all notifications
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
