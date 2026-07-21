import { MessageSquare, ExternalLink } from "lucide-react";
import { Link } from "react-router";
import type { Activity } from "~/api/activities";
import { cn } from "~/lib/utils";
import { Card, CardContent } from "./ui/card";
import { TYPE_CONFIG } from "~/data";
import { formatDateTime } from "~/lib/date-helpers";
import { Badge } from "./ui/badge";
import { useCallback, useMemo } from "react";

interface ActivityItemProps {
  activity: Activity;
  dealId?: string;
  onClick?: (activity: Activity) => void;
}

const ActivityItem: React.FC<ActivityItemProps> = ({
  activity,
  dealId,
  onClick,
}) => {
  const resolveOrigin = useCallback(
    (activity: Activity) => {
      if (activity.deal_id && activity.deal_id === dealId) return "Deal";
      if (activity.lead_id) return "Lead";
      return "Other";
    },
    [activity],
  );

  const config = TYPE_CONFIG[activity.type];
  const Icon = config?.icon || MessageSquare;
  const origin = resolveOrigin(activity);
  const linkUrl = useMemo(() => {
    if (origin === "Lead") return `/leads/${activity.lead_id}`;
    if (origin === "Deal") return `/deals/${activity.deal_id}`;
    return "#";
  }, [activity, origin]);

  const linkText = activity.lead?.school
    ? activity.lead?.school.name
    : "View Details";

  return (
    <div key={activity.id} className="relative pl-10">
      <div
        className={cn(
          "absolute left-1.5 top-1 flex h-6 w-6 items-center justify-center rounded-full",
          config?.className || "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <Card
        className={cn(
          "p-0 gap-y-2",
          onClick && "cursor-pointer transition-colors hover:bg-muted/30",
        )}
        onClick={() => onClick?.(activity)}
      >
        <CardContent className="p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{activity.subject}</p>
            <Badge variant="outline" className="text-xs">
              {config?.label || activity.type}
            </Badge>
            {origin !== "Deal" && (
              <Badge variant="secondary" className="text-xs">
                {origin}
              </Badge>
            )}
          </div>
          {activity.description && (
            <p className="text-sm text-muted-foreground">
              {activity.description}
            </p>
          )}
          {activity.note?.content && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {activity.note.content}
            </p>
          )}
          <div className="flex items-center gap-x-2">
            <p className="text-xs text-muted-foreground">
              {formatDateTime(activity.created_at)}
            </p>
            <Link
              to={linkUrl}
              className="text-xs flex items-center text-blue-500 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {linkText} <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
            <p className="text-muted-foreground text-xs">
              By&nbsp;{activity.created_by?.first_name}&nbsp;
              {activity.created_by?.last_name}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ActivityItem;
