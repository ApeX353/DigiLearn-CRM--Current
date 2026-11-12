import type { Activity } from "~/api/activities";
import { ActivityDocumentModal } from "~/components/activities/activity-document-modal";

interface ActivityInspectorSheetProps {
  activity: Activity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isReadonly?: boolean;
  /** Optional stepping through the surrounding list. */
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

/**
 * Opening an activity used to fan out to one of three right-hand drawers
 * (task / meeting / everything-else), each with its own layout and its own
 * idea of how editing works — the task one autosaved per field, the
 * meeting one had a Save button, the third was read-only.
 *
 * They are now a single document-style page: one centred column, every
 * field click-to-edit, saved as you go. Keeping this component as the
 * entry point means the ~dozen call sites don't have to change.
 */
export function ActivityInspectorSheet({
  activity,
  open,
  onOpenChange,
  isReadonly = false,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: ActivityInspectorSheetProps) {
  return (
    <ActivityDocumentModal
      activityId={activity?.id ?? null}
      open={open}
      onOpenChange={onOpenChange}
      isReadonly={isReadonly}
      onPrev={onPrev}
      onNext={onNext}
      hasPrev={hasPrev}
      hasNext={hasNext}
    />
  );
}
