import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CanAccessLeadGuard } from './can-access-lead.guard';

/**
 * RISK-005 / RISK-009 regression cover. The guard read only `:leadId`, so
 * on the main lead routes (declared `:id`) it was a no-op, and any lookup
 * error other than a refusal granted access. Both fixed 11 Sep 2026.
 */
describe('CanAccessLeadGuard', () => {
  const leadsService = { findOne: jest.fn() };
  let guard: CanAccessLeadGuard;

  const ctx = (user: any, params: Record<string, string> = {}, body: any = {}) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user, params, body }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new CanAccessLeadGuard(leadsService as any);
  });

  it('refuses when there is no user', async () => {
    await expect(guard.canActivate(ctx(undefined, { id: 'l1' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('reads the lead id from :id as well as :leadId', async () => {
    leadsService.findOne.mockResolvedValue({ id: 'l1', assigned_to: 'u1' });
    await guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { id: 'l1' }));
    await guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { leadId: 'l1' }));
    await guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, {}, { lead_id: 'l1' }));
    expect(leadsService.findOne).toHaveBeenCalledTimes(3);
  });

  it('lets managers and admins through without a lookup', async () => {
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_manager' }, { id: 'l1' })),
    ).resolves.toBe(true);
    expect(leadsService.findOne).not.toHaveBeenCalled();
  });

  it('refuses a rep the lead is not assigned to', async () => {
    leadsService.findOne.mockResolvedValueOnce({ id: 'l1', assigned_to: 'someone-else' });
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { id: 'l1' })),
    ).rejects.toThrow('You do not have permission to access this lead');
  });

  it('surfaces a missing lead as 404, not as access', async () => {
    leadsService.findOne.mockRejectedValueOnce(new NotFoundException('gone'));
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { id: 'l1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('surfaces a lookup failure instead of granting access', async () => {
    leadsService.findOne.mockRejectedValueOnce(new Error('connection reset'));
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { id: 'l1' })),
    ).rejects.toThrow('connection reset');
  });
});
