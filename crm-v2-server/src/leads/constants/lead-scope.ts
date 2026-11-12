/**
 * Maps the condition keys a CASL rule on subject `Lead` may use to the
 * column that holds the value on a lead row (or on a query alias). Shared
 * by every query that scopes leads by ability — LeadsService and the
 * side-record services (qualification) that join onto the lead — so all
 * of them read ownership the same way.
 */
export const LEAD_CONDITION_KEY_MAP: Record<string, string> = {
  id: 'id',
  ownerId: 'assigned_to',
  owner_id: 'assigned_to',
  assignedTo: 'assigned_to',
  assigned_to: 'assigned_to',
  assigneeId: 'assigned_to',
  assignee_id: 'assigned_to',
  schoolId: 'school_id',
  school_id: 'school_id',
  stageId: 'stage_id',
  stage_id: 'stage_id',
  status: 'status',
  source: 'source',
};
