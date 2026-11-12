import type { Notification } from './entities';

export const NOTIFICATION_GROUPS = [
  'tasks',
  'reminders',
  'sla',
  'bugs',
  'approvals',
  'system',
  'other',
] as const;

export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export const notificationGroupFor = (
  notification: Pick<
    Notification,
    'event_type' | 'entity' | 'title' | 'message'
  >,
): NotificationGroup => {
  const text = [
    notification.event_type,
    notification.entity,
    notification.title,
    notification.message,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // The system raising its hand (job failures, provider outages, error
  // bursts, a user in trouble): diagnostics AlertsService sends these.
  if (
    notification.event_type === 'system.alert' ||
    notification.entity === 'SystemEvent' ||
    notification.entity === 'JobRun' ||
    notification.entity === 'DeliveryAttempt'
  ) {
    return 'system';
  }
  if (notification.entity === 'BugReport' || /\bbug\b/.test(text)) {
    return 'bugs';
  }
  if (/\bsla\b|sla[_\.]/.test(text)) return 'sla';
  if (/\btask\b|task[_\.]/.test(text)) return 'tasks';
  if (/follow[ -]?up|reminder|\bidle\b/.test(text)) return 'reminders';
  if (/approval|approve|reversal|assignment[s ]+waiting/.test(text)) {
    return 'approvals';
  }
  return 'other';
};

/**
 * This mirrors notificationGroupFor in SQL so group detail requests paginate
 * in the database instead of fetching a user's whole notification history.
 */
export const notificationGroupSql = (alias = 'notification'): string => {
  const text = `LOWER(CONCAT_WS(' ', COALESCE(${alias}.event_type, ''), COALESCE(${alias}.entity, ''), COALESCE(${alias}.title, ''), COALESCE(${alias}.message, '')))`;
  return `CASE
    WHEN ${alias}.event_type = 'system.alert' OR ${alias}.entity IN ('SystemEvent','JobRun','DeliveryAttempt') THEN 'system'
    WHEN ${alias}.entity = 'BugReport' OR ${text} ~ '\\mbug\\M' THEN 'bugs'
    WHEN ${text} ~ '\\msla\\M' OR ${text} LIKE '%sla\\_%' ESCAPE '\\' OR ${text} LIKE '%.sla\\_%' ESCAPE '\\' THEN 'sla'
    WHEN ${text} ~ '\\mtask\\M' OR ${text} LIKE '%task\\_%' ESCAPE '\\' OR ${text} LIKE '%.task\\_%' ESCAPE '\\' THEN 'tasks'
    WHEN ${text} ~ 'follow[ -]?up|reminder|\\midle\\M' THEN 'reminders'
    WHEN ${text} ~ 'approval|approve|reversal|assignment[s ]+waiting' THEN 'approvals'
    ELSE 'other'
  END`;
};
