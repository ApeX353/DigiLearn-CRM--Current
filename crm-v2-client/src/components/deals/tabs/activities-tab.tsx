/**
 * Deal detail → Activities tab.
 *
 * Replaces the previous Card+Search+Pagination layout with the shared
 * EngagementWorkspace so deal pages get the same Planned / Done /
 * filterable-feed structure as leads. The deal's own onLogActivity
 * trigger is preserved by simply hiding the workspace's Schedule
 * button when the parent provides its own — but in practice the
 * workspace's "Schedule next" + chip-launch actions cover the same
 * surface, so the deal page no longer needs the legacy props beyond
 * the readonly flag.
 */
import { EngagementWorkspace } from "~/components/activities/engagement-workspace";
import type { ComposerType } from "~/components/activities/activity-composer";
import type { FeedFilter } from "~/components/activities/activity-kit";

interface DealActivitiesTabProps {
  dealId: string;
  /** Optional: when the activity is also tied to the originating lead. */
  leadId?: string;
  /** Kept for API compatibility with existing callers; no-op now. */
  onLogActivity?: () => void;
  isReadonly?: boolean;
  /** Pre-filter the Done feed (used by Notes/Emails/Calls sibling tabs). */
  initialFilter?: FeedFilter;
  /** Hide the in-pane filter bar when the tab IS the filter. */
  hideFilterBar?: boolean;
  /** Open the inline composer on this type (Note / Call / Email tabs). */
  composeType?: ComposerType | null;
}

export function DealActivitiesTab({
  dealId,
  leadId,
  isReadonly,
  initialFilter,
  hideFilterBar,
  composeType = null,
}: DealActivitiesTabProps) {
  // Prefer dealId scope on the workspace so the API filter narrows on
  // deal_id; we still pass leadId so the planned/done feed surfaces
  // any lead-scoped activity that's relevant to this deal's parent
  // record.
  return (
    <EngagementWorkspace
      dealId={dealId}
      leadId={leadId}
      scope="deal"
      isReadonly={isReadonly}
      initialFilter={initialFilter}
      hideFilterBar={hideFilterBar}
      composeType={composeType}
    />
  );
}
