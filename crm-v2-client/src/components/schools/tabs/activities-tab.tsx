/**
 * School detail → Activities tab.
 *
 * Schools don't own activities directly — Activities live on leads
 * (and the deals/contacts that hang off them). The shared
 * EngagementWorkspace passes the school id through to the API which
 * joins on `lead.school_id`, so the user sees every activity tied to
 * any of the school's leads in a single Planned + Done view.
 *
 * Inactive schools are treated as read-only so the workspace hides
 * its scheduling buttons.
 */
import type { School } from "~/api/schools";
import { EngagementWorkspace } from "~/components/activities/engagement-workspace";
import type { FeedFilter } from "~/components/activities/activity-kit";

interface ActivitiesTabProps {
  school: School;
  /** Pre-filter the Done feed — used by Notes/Emails/Calls sibling tabs. */
  initialFilter?: FeedFilter;
  /** Hide the filter bar when the tab itself is the filter. */
  hideFilterBar?: boolean;
}

export function ActivitiesTab({
  school,
  initialFilter,
  hideFilterBar,
}: ActivitiesTabProps) {
  return (
    <EngagementWorkspace
      schoolId={school.id}
      scope="school"
      isReadonly={!school.is_active}
      initialFilter={initialFilter}
      hideFilterBar={hideFilterBar}
    />
  );
}
