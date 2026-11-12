import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CanAccessQuoteGuard } from './can-access-quote.guard';

/**
 * RISK-009 regression cover: the ownership guard must fail closed. Before
 * 11 Sep 2026 any error other than a ForbiddenException was swallowed and
 * the request let through.
 */
describe('CanAccessQuoteGuard', () => {
  const quotesService = { findOne: jest.fn() };
  let guard: CanAccessQuoteGuard;

  const ctx = (user: any, params: Record<string, string> = {}) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new CanAccessQuoteGuard(quotesService as any);
  });

  it('refuses when there is no user', async () => {
    await expect(guard.canActivate(ctx(undefined, { id: 'q1' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('passes when the route carries no quote id', async () => {
    await expect(guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }))).resolves.toBe(true);
    expect(quotesService.findOne).not.toHaveBeenCalled();
  });

  it('lets managers and admins through without a lookup', async () => {
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_manager' }, { id: 'q1' })),
    ).resolves.toBe(true);
    expect(quotesService.findOne).not.toHaveBeenCalled();
  });

  it('passes the owner', async () => {
    quotesService.findOne.mockResolvedValueOnce({ id: 'q1', owner_id: 'u1' });
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { id: 'q1' })),
    ).resolves.toBe(true);
  });

  it('refuses a rep who does not own the quote', async () => {
    quotesService.findOne.mockResolvedValueOnce({ id: 'q1', owner_id: 'someone-else' });
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { id: 'q1' })),
    ).rejects.toThrow('You do not have permission to access this quote');
  });

  it('surfaces a missing quote as 404, not as access', async () => {
    quotesService.findOne.mockRejectedValueOnce(new NotFoundException('gone'));
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { id: 'q1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('surfaces a lookup failure instead of granting access', async () => {
    quotesService.findOne.mockRejectedValueOnce(new Error('connection reset'));
    await expect(
      guard.canActivate(ctx({ id: 'u1', role: 'sales_rep' }, { id: 'q1' })),
    ).rejects.toThrow('connection reset');
  });
});
