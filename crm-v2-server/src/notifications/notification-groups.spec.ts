import { notificationGroupFor } from './notification-groups';

describe('notificationGroupFor', () => {
  const groupFor = (overrides: Record<string, string | null> = {}) =>
    notificationGroupFor({
      event_type: null,
      entity: null,
      title: 'Update',
      message: 'A new notification',
      ...overrides,
    });

  it.each([
    [{ event_type: 'task.assigned' }, 'tasks'],
    [{ title: 'Follow-up due soon' }, 'reminders'],
    [{ event_type: 'lead.sla_breached' }, 'sla'],
    [{ entity: 'BugReport' }, 'bugs'],
    [{ event_type: 'lead.reversal_requested' }, 'approvals'],
    [{}, 'other'],
  ])('classifies %o as %s', (notification, expected) => {
    expect(groupFor(notification)).toBe(expected);
  });
});
