import { ConflictException } from '@nestjs/common';
import { QuotesService } from './quotes.service';

describe('QuotesService ticket invariants', () => {
  let service: QuotesService;

  beforeEach(() => {
    service = Object.create(QuotesService.prototype) as QuotesService;
  });

  it('QUOTE1 refuses a second Accepted quote on the same deal', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(1),
    };

    await expect(
      (service as any).assertAcceptedQuoteIsUnique(
        manager,
        'quote-2',
        'deal-1',
        'Accepted',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['deal-1'],
    );
  });

  it('QUOTE1 does not lock or count for a non-Accepted quote', async () => {
    const manager = { query: jest.fn(), count: jest.fn() };

    await (service as any).assertAcceptedQuoteIsUnique(
      manager,
      'quote-2',
      'deal-1',
      'Draft',
    );

    expect(manager.query).not.toHaveBeenCalled();
    expect(manager.count).not.toHaveBeenCalled();
  });

  it('QUOTE4 inherits the linked deal currency before the global default', async () => {
    (service as any).appSettingsService = {
      getSetting: jest.fn().mockResolvedValue({ value: 'USD' }),
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue({ currency: 'ZAR' }),
    };

    await expect(
      (service as any).resolveCurrency(manager, undefined, 'deal-1'),
    ).resolves.toBe('ZAR');
  });
});
