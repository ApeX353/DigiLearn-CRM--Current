jest.mock('../activity-logs/activity-logs.service', () => ({
  ActivityLogsService: class ActivityLogsService {},
}));

import { BadRequestException } from '@nestjs/common';
import { PaymentTermsService } from './payment-terms.service';
import { AppliedPaymentTerm } from './entities/applied-payment-term.entity';
import { PaymentTerm } from './entities/payment-term.entity';

/**
 * BUG-028 / BUG-050: applying a payment term is serialised per document
 * with an advisory transaction lock, and the unique index is honoured as
 * the last line of defence.
 */
describe('PaymentTermsService.applyPaymentTermToDocument concurrency', () => {
  const calculation = {
    interest_rate: 0,
    interest_amount: 0,
    total_amount: 1000,
    number_of_terms: 2,
    installment_amount: 500,
    start_date: '2026-09-11',
    final_due_date: '2026-11-11',
    final_grace_due_date: '2026-11-18',
    installments: [],
  };
  const paymentTerm = {
    id: 'term-1',
    name: 'Two instalments',
    type: 'installment',
    interest_calculation_method: 'simple',
    invoice_strategy: 'single_invoice',
    term_length_days: 30,
    days_until_due: 30,
    grace_period_days: 7,
    terms_and_conditions: null,
    periods: [],
  };

  const activityLogs = { logCreate: jest.fn() };
  const calc = {
    calculateWithPaymentTerm: jest.fn().mockReturnValue(calculation),
  };
  let calls: string[];
  let manager: any;
  let existingApplied: any;
  let saveError: any;

  const service = () =>
    new PaymentTermsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { transaction: (cb: any) => cb(manager) } as any,
      activityLogs as any,
      calc as any,
    );

  const params = {
    document_id: 'quote-1',
    document_type: 'quote' as const,
    payment_term_id: 'term-1',
    document_total: 1000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    calls = [];
    existingApplied = null;
    saveError = null;
    manager = {
      query: jest.fn(async (sql: string) => {
        calls.push('lock:' + sql);
      }),
      findOne: jest.fn(async (entity: any) => {
        calls.push('findOne:' + entity.name);
        if (entity === AppliedPaymentTerm) return existingApplied;
        if (entity === PaymentTerm) return paymentTerm;
        return null;
      }),
      create: jest.fn((_entity: any, data: any) => data),
      save: jest.fn(async (_entity: any, data: any) => {
        calls.push('save');
        if (saveError) throw saveError;
        return { id: 'applied-1', ...data };
      }),
      update: jest.fn(),
    };
  });

  it('takes the per-document lock before checking for an existing term', async () => {
    const result = await service().applyPaymentTermToDocument(params, 'u1');

    expect(result.applied_term_id).toBe('applied-1');
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['applied_term:quote:quote-1'],
    );
    expect(calls[0]).toMatch(/^lock:/);
    expect(calls[1]).toBe('findOne:AppliedPaymentTerm');
  });

  it('refuses a second apply once the first has committed', async () => {
    existingApplied = { id: 'applied-0' };
    await expect(service().applyPaymentTermToDocument(params, 'u1')).rejects.toThrow(
      'quote quote-1 already has an applied payment term',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('maps a unique-index violation on insert to the same 400', async () => {
    saveError = Object.assign(new Error('duplicate key'), { code: '23505' });
    await expect(service().applyPaymentTermToDocument(params, 'u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(activityLogs.logCreate).not.toHaveBeenCalled();
  });

  it('lets any other insert failure surface as itself', async () => {
    saveError = new Error('connection reset');
    await expect(service().applyPaymentTermToDocument(params, 'u1')).rejects.toThrow(
      'connection reset',
    );
  });
});
