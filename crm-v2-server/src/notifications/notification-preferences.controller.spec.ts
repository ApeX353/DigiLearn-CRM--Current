import { BadRequestException } from '@nestjs/common';
import { NotificationPreferencesController } from './notification-preferences.controller';
import {
  ACCEPTED_CHANNEL_SLUGS,
  normalizeChannel,
} from './dto/notification-preference.dto';
import { OneOfPipe } from '../common/pipes/one-of.pipe';

/**
 * The Settings page spells the in-app channel `in-app`; the follow-up
 * reminder looks preferences up by `in_app`. A toggle saved under the page's
 * spelling was never read. Both spellings are accepted and the canonical one
 * is stored.
 */
describe('NotificationPreferencesController channel spelling', () => {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((row: any) => row),
    save: jest.fn(async (row: any) => ({ id: 'p1', ...row })),
  };
  const req = { user: { id: 'u1' } };
  let controller: NotificationPreferencesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new NotificationPreferencesController(repo as any);
  });

  it('normalizes the page spelling to the stored one', () => {
    expect(normalizeChannel('in-app')).toBe('in_app');
    expect(normalizeChannel('in_app')).toBe('in_app');
    expect(normalizeChannel('email')).toBe('email');
  });

  it('the route pipe accepts both spellings and refuses an unknown channel', () => {
    const pipe = new OneOfPipe(ACCEPTED_CHANNEL_SLUGS, 'channel');
    expect(pipe.transform('in-app')).toBe('in-app');
    expect(pipe.transform('in_app')).toBe('in_app');
    expect(() => pipe.transform('carrier_pigeon')).toThrow(BadRequestException);
  });

  it('PATCH …/lead.followup_due/in-app creates the row as in_app', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    const row = await controller.update(req, 'lead.followup_due', 'in-app', {
      is_enabled: false,
    });
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { user_id: 'u1', event_type: 'lead.followup_due', channel: 'in_app' },
    });
    expect(row.channel).toBe('in_app');
    expect(row.is_enabled).toBe(false);
  });

  it('PATCH with the stored spelling updates the same row', async () => {
    const existing = { id: 'p1', user_id: 'u1', event_type: 'lead.followup_due', channel: 'in_app', is_enabled: false, severity_min: null };
    repo.findOne.mockResolvedValueOnce(existing);
    const row = await controller.update(req, 'lead.followup_due', 'in_app', {
      is_enabled: true,
    });
    expect(repo.create).not.toHaveBeenCalled();
    expect(row.is_enabled).toBe(true);
  });
});
