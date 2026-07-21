import type { Activity } from "~/api/activities";
import { ActivityDetailsSheet } from "~/components/activities/activity-details-sheet";
import { ActivityMeetingSheet } from "~/components/activities/activity-meeting-sheet";
import { ActivityTaskSheet } from "~/components/activities/activity-task-sheet";

interface ActivityInspectorSheetProps {
  activity: Activity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isReadonly?: boolean;
}

export function ActivityInspectorSheet({
  activity,
  open,
  onOpenChange,
  isReadonly = false,
}: ActivityInspectorSheetProps) {
  if (activity?.type === "task") {
    return (
      <ActivityTaskSheet
        activityId={activity.id}
        initialActivity={activity}
        open={open}
        isReadonly={isReadonly}
        onOpenChange={onOpenChange}
      />
    );
  }

  if (activity?.type === "meeting") {
    return (
      <ActivityMeetingSheet
        activityId={activity.id}
        open={open}
        isReadonly={isReadonly}
        onOpenChange={onOpenChange}
      />
    );
  }

  return (
    <ActivityDetailsSheet
      activityId={activity?.id ?? null}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
