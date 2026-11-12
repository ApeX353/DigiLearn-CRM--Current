import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CanAccessInvoiceGuard } from './can-access-invoice.guard';

/**
 * RISK-009 regression cover: the ownership guard must fail closed. Before
 * 11 Sep 2026 any error other than a ForbiddenException was swallowed and
 * the request let through.
 */
describe('CanAccessInvoiceGuard', () => {
  const invoicesService = { findOne: jest.fn() };
  let guard: CanAccessInvoiceGuard;

  const ctx = (user: any, params: Record<string, string> = {}) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new CanAccessInvoiceGuard(invoicesService as any);
  });

  it('refuses when there is no user', async () => {
    await expect(guard.canActivate(ctx(undefined, { id: 'i1' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('passes when the route carries no invoice id', async () => {
    await expect(guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }))).resolves.toBe(true);
    expect(invoicesService.findOne).not.toHaveBeenCalled();
  });

  it('lets managers and admins through without a lookup', async () => {
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'admin' }, { id: 'i1' })),
    ).resolves.toBe(true);
    expect(invoicesService.findOne).not.toHaveBeenCalled();
  });

  it('passes the owner', async () => {
    invoicesService.findOne.mockResolvedValueOnce({ id: 'i1', owner_id: 'u1' });
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { id: 'i1' })),
    ).resolves.toBe(true);
  });

  it('refuses a rep who does not own the invoice', async () => {
    invoicesService.findOne.mockResolvedValueOnce({ id: 'i1', owner_id: 'someone-else' });
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { id: 'i1' })),
    ).rejects.toThrow('You do not have permission to access this invoice');
  });

  it('surfaces a missing invoice as 404, not as access', async () => {
    invoicesService.findOne.mockRejectedValueOnce(new NotFoundException('gone'));
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { id: 'i1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('surfaces a lookup failure instead of granting access', async () => {
    invoicesService.findOne.mockRejectedValueOnce(new Error('connection reset'));
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { id: 'i1' })),
    ).rejects.toThrow('connection reset');
  });
});
