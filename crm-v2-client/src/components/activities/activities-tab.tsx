/**
 * Shared Activities tab — used by the lead detail page (and historically
 * by the deal detail page, which now imports DealActivitiesTab directly).
 *
 * Renders the EngagementWorkspace at full width. The previous version
 * rendered a Manager Glance / Guardrails side rail next to the
 * workspace; that side panel was removed because it competed with the
 * activity workspace itself for attention. Lead-scoped touch metrics
 * still live on `useLeadActivityStats` and can be surfaced on the
 * Overview tab where they belong, but the Activity tab is now
 * dedicated to running the engagement workflow itself.
 *
 * Props are kept backwards-compatible with the previous shared tab so
 * the lead and deal pages don't need to change.
 */
import { EngagementWorkspace } from "~/components/activities/engagement-workspace";
import type { ComposerType } from "~/components/activities/activity-composer";
import type { FeedFilter } from "~/components/activities/activity-kit";

interface ActivitiesTabProps {
  leadId?: string;
  dealId?: string;
  /** The originating lead id when this tab is rendered on a deal page. */
  leadIdFromDeal?: string;
  isReadonly?: boolean;
  /** Pre-filter the Done feed — used by Notes / Emails / Calls sibling tabs. */
  initialFilter?: FeedFilter;
  /** Hide the filter bar when the tab itself is the filter. */
  hideFilterBar?: boolean;
  /**
   * Open the inline composer on this type. Used by the Note / Call /
   * Email / WhatsApp tabs, which compose rather than filter.
   */
  composeType?: ComposerType | null;
  /** ASGN2: the record owner — new activities default their assignee here. */
  defaultAssigneeId?: string | null;
}

export function ActivitiesTab({
  leadId,
  dealId,
  // leadIdFromDeal is no longer surfaced visually but kept on the
  // props so callers don't have to change. The workspace already
  // accepts both leadId + dealId so deal pages with an originating
  // lead can pass the lead id through.
  leadIdFromDeal: _leadIdFromDeal,
  isReadonly = false,
  initialFilter,
  hideFilterBar,
  composeType = null,
  defaultAssigneeId,
}: ActivitiesTabProps) {
  void _leadIdFromDeal;
  return (
    <EngagementWorkspace
      leadId={leadId}
      dealId={dealId}
      scope={leadId ? "lead" : "deal"}
      isReadonly={isReadonly}
      initialFilter={initialFilter}
      hideFilterBar={hideFilterBar}
      composeType={composeType}
      defaultAssigneeId={defaultAssigneeId}
    />
  );
}
