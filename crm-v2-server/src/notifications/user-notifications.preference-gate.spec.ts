import { UserNotificationsService } from './user-notifications.service';

/**
 * The Settings-page toggles gate real alerts: a recipient who turned an
 * event off, or set a minimum severity above the alert's, is dropped before
 * fan-out. No row means on. Alerts sent without an eventType are untouched.
 */
describe('UserNotificationsService preference gate', () => {
  const notificationRepository = {
    findOne: jest.fn(),
    create: jest.fn((d: any) => d),
    save: jest.fn(async (d: any) => ({ id: 'n1', ...d })),
  };
  const userNotificationRepository = {
    create: jest.fn((d: any) => d),
    save: jest.fn(async (d: any) => d),
    find: jest.fn().mockResolvedValue([]),
  };
  const preferenceRepository = { find: jest.fn() };
  let service: UserNotificationsService;

  const send = (userIds: string[], eventType?: string, severity = 'warning') =>
    service.sendToUsers({
      title: 't',
      message: 'm',
      severity,
      userIds,
      ...(eventType ? { eventType } : {}),
    } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    notificationRepository.findOne.mockResolvedValue(null);
    service = new UserNotificationsService(
      notificationRepository as any,
      userNotificationRepository as any,
      undefined,
      preferenceRepository as any,
    );
  });

  it('delivers to everyone when no preference rows exist', async () => {
    preferenceRepository.find.mockResolvedValueOnce([]);
    await send(['a', 'b'], 'lead.idle_alert');
    const rows = userNotificationRepository.save.mock.calls[0][0];
    expect(rows.map((r: any) => r.userId)).toEqual(['a', 'b']);
  });

  it('drops a recipient who turned the event off', async () => {
    preferenceRepository.find.mockResolvedValueOnce([
      { user_id: 'a', event_type: 'lead.idle_alert', channel: 'in_app', is_enabled: false, severity_min: null },
    ]);
    await send(['a', 'b'], 'lead.idle_alert');
    const rows = userNotificationRepository.save.mock.calls[0][0];
    expect(rows.map((r: any) => r.userId)).toEqual(['b']);
  });

  it('drops a recipient whose minimum severity is above the alert', async () => {
    preferenceRepository.find.mockResolvedValueOnce([
      { user_id: 'a', event_type: 'lead.sla_breached', channel: 'in_app', is_enabled: true, severity_min: 'critical' },
    ]);
    await send(['a', 'b'], 'lead.sla_breached', 'warning');
    const rows = userNotificationRepository.save.mock.calls[0][0];
    expect(rows.map((r: any) => r.userId)).toEqual(['b']);
  });

  it('keeps a recipient whose minimum severity the alert meets', async () => {
    preferenceRepository.find.mockResolvedValueOnce([
      { user_id: 'a', event_type: 'lead.sla_breached', channel: 'in_app', is_enabled: true, severity_min: 'warning' },
    ]);
    await send(['a'], 'lead.sla_breached', 'error');
    expect(userNotificationRepository.save).toHaveBeenCalled();
  });

  it('writes nothing when everyone opted out', async () => {
    preferenceRepository.find.mockResolvedValueOnce([
      { user_id: 'a', event_type: 'lead.idle_alert', channel: 'in_app', is_enabled: false, severity_min: null },
    ]);
    const result = await send(['a'], 'lead.idle_alert');
    expect(result).toBeNull();
    expect(notificationRepository.save).not.toHaveBeenCalled();
  });

  it('ignores preferences for alerts sent without an event type', async () => {
    await send(['a', 'b']);
    expect(preferenceRepository.find).not.toHaveBeenCalled();
    expect(userNotificationRepository.save).toHaveBeenCalled();
  });

  it('stores the event type on the notification row', async () => {
    preferenceRepository.find.mockResolvedValueOnce([]);
    await send(['a'], 'lead.idle_alert');
    expect(notificationRepository.create.mock.calls[0][0]).toMatchObject({
      event_type: 'lead.idle_alert',
    });
  });
});
