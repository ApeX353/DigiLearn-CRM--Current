jest.mock('../invoices/invoices.service', () => ({
  InvoicesService: class InvoicesService {},
}));

jest.mock('../payment-terms/payment-terms.service', () => ({
  PaymentTermsService: class PaymentTermsService {},
}));

jest.mock('../activity-logs/activity-logs.service', () => ({
  ActivityLogsService: class ActivityLogsService {},
}));

jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));

import { PaymentsService } from './payments.service';

type QueryBuilderMock = {
  select: jest.Mock;
  addSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  getRawOne: jest.Mock;
};

function createQueryBuilderMock(
  rawOne: Record<string, unknown> = {},
): QueryBuilderMock {
  return {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(rawOne),
  };
}

describe('PaymentsService', () => {
  let service: PaymentsService;

  const paymentRepository = {
    createQueryBuilder: jest.fn(),
  };
  const settingsService = {
    getSetting: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 2, 9, 10, 0, 0));

    paymentRepository.createQueryBuilder.mockReset();
    settingsService.getSetting.mockReset();

    service = new PaymentsService(
      paymentRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      settingsService as any,
      {} as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('uses the configured default fiscal year and returns flat totals', async () => {
    settingsService.getSetting.mockResolvedValueOnce({
      value: { default_fiscal_year: '2024' },
    });
    const qb = createQueryBuilderMock({
      total_payments: '3',
      total_amount: '1500.5',
      total_allocated: '1000.25',
      total_unallocated: '500.25',
    });
    paymentRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getPaymentStatistics();

    const startDate = qb.where.mock.calls[0][1].startDate as Date;
    const endDate = qb.andWhere.mock.calls[0][1].endDate as Date;

    expect(settingsService.getSetting).toHaveBeenCalledTimes(1);
    expect(settingsService.getSetting).toHaveBeenCalledWith('defaults');
    expect(startDate).toEqual(new Date(2024, 0, 1));
    expect(endDate).toEqual(new Date(2026, 2, 9, 10, 0, 0));
    expect(result).toEqual({
      total_payments: 3,
      total_amount: 1500.5,
      total_allocated: 1000.25,
      total_unallocated: 500.25,
    });
  });

  it('falls back to the start of the current year when no fiscal year setting exists', async () => {
    settingsService.getSetting
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const qb = createQueryBuilderMock({
      total_payments: '0',
      total_amount: '0',
      total_allocated: '0',
      total_unallocated: '0',
    });
    paymentRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getPaymentStatistics();

    const startDate = qb.where.mock.calls[0][1].startDate as Date;

    expect(settingsService.getSetting).toHaveBeenNthCalledWith(1, 'defaults');
    expect(settingsService.getSetting).toHaveBeenNthCalledWith(
      2,
      'defaults.default_fiscal_year',
    );
    expect(settingsService.getSetting).toHaveBeenNthCalledWith(
      3,
      'default_fiscal_year',
    );
    expect(startDate).toEqual(new Date(2026, 0, 1));
  });

  it('uses an explicit date range without consulting settings', async () => {
    const qb = createQueryBuilderMock({
      total_payments: '2',
      total_amount: '800',
      total_allocated: '800',
      total_unallocated: '0',
    });
    paymentRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getPaymentStatistics({
      start_date: '2026-02-01',
      end_date: '2026-02-28',
    });

    const startDate = qb.where.mock.calls[0][1].startDate as Date;
    const endDate = qb.andWhere.mock.calls[0][1].endDate as Date;

    expect(settingsService.getSetting).not.toHaveBeenCalled();
    expect(startDate).toEqual(new Date(2026, 1, 1));
    expect(endDate).toEqual(new Date(2026, 1, 28, 23, 59, 59, 999));
  });

  it('routes sales-rep payment entries to approval instead of posting cash', async () => {
    const request = { id: 'request-1', status: 'pending' };
    jest
      .spyOn(service as any, 'createPaymentEntryRequest')
      .mockResolvedValue(request);
    const create = jest.spyOn(service, 'create');

    await expect(
      service.submit(
        {
          invoice_id: 'b4c1f461-108d-4460-b59b-711ed7c8ec4b',
          amount: 100,
          payment_date: '2026-03-09T00:00:00.000Z',
        },
        'rep-1',
        'sales_rep',
      ),
    ).resolves.toEqual({ kind: 'approval_request', request });
    expect(create).not.toHaveBeenCalled();
  });

  it('posts admin and sales-manager payments directly with the actor', async () => {
    const payment = { id: 'payment-1' };
    const create = jest.spyOn(service, 'create').mockResolvedValue(payment as any);
    const dto = {
      invoice_id: 'b4c1f461-108d-4460-b59b-711ed7c8ec4b',
      amount: 100,
      payment_date: '2026-03-09T00:00:00.000Z',
    };

    await expect(service.submit(dto, 'manager-1', 'sales_manager')).resolves.toEqual({
      kind: 'payment',
      payment,
    });
    expect(create).toHaveBeenCalledWith(dto, 'manager-1');
  });
});
