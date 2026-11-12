jest.mock('../activity-logs/activity-logs.service', () => ({
  ActivityLogsService: class ActivityLogsService {},
}));

import { BadRequestException } from '@nestjs/common';
import { InstallmentCalculationService } from './installment-calculation.service';
import {
  PaymentTermsService,
  agreedDueDatesFromApplied,
} from './payment-terms.service';
import { PaymentTerm } from './entities/payment-term.entity';

/**
 * Urgent billing repair (28 Oct 2026): a multi-instalment term can carry the
 * due dates agreed with the customer instead of the term's own spacing. The
 * amounts, the count and every validation stay with the term; only the dates
 * are supplied, and nothing is invented when they are absent.
 */
describe('agreed instalment due dates', () => {
  const calc = new InstallmentCalculationService({} as any);

  // The production Buy4Pay2 definition (configuration row, 4 Sep dump):
  // custom, no interest, two instalments, 30-day spacing, one invoice per
  // instalment.
  const buy4pay2 = {
    id: 'term-b4p2',
    name: 'Buy4Pay2',
    type: 'custom',
    interest_rate: 0,
    interest_calculation_method: 'none',
    invoice_strategy: 'multiple_invoices',
    number_of_terms: 2,
    term_length_days: 30,
    days_until_due: 30,
    grace_period_days: 0,
    periods: [],
  } as unknown as PaymentTerm;

  it('without agreed dates the term spaces the instalments 30 days apart (unchanged behaviour)', () => {
    const r = calc.calculateWithPaymentTerm(buy4pay2, {
      document_total: 7800,
      start_date: '2026-10-06T00:00:00.000Z',
    });
    expect(r.due_dates_source).toBe('term');
    expect(r.installments.map((i) => i.due_date.toISOString().slice(0, 10))).toEqual([
      '2026-11-05',
      '2026-12-05',
    ]);
    expect(r.installments.map((i) => i.amount)).toEqual([3900, 3900]);
  });

  it('with agreed dates the schedule carries them verbatim and the amounts still come from the term', () => {
    const r = calc.calculateWithPaymentTerm(buy4pay2, {
      document_total: 7800,
      start_date: '2026-10-06T00:00:00.000Z',
      due_dates: ['2026-10-06', '2027-01-12'],
    });
    expect(r.due_dates_source).toBe('agreed');
    expect(r.installments.map((i) => i.due_date.toISOString().slice(0, 10))).toEqual([
      '2026-10-06',
      '2027-01-12',
    ]);
    expect(r.installments.map((i) => i.amount)).toEqual([3900, 3900]);
    expect(r.total_amount).toBe(7800);
    expect(r.final_due_date?.toISOString().slice(0, 10)).toBe('2027-01-12');
  });

  it('a deposit due on the start day is allowed (calendar-day comparison)', () => {
    const r = calc.calculateWithPaymentTerm(buy4pay2, {
      document_total: 100,
      start_date: '2026-10-06T14:30:00.000Z',
      due_dates: ['2026-10-06', '2026-10-07'],
    });
    expect(r.installments[0].due_date.toISOString().slice(0, 10)).toBe('2026-10-06');
  });

  it('refuses the wrong number of dates, out-of-order dates, dates before the start, and junk', () => {
    const base = { document_total: 7800, start_date: '2026-10-06T00:00:00.000Z' };
    expect(() =>
      calc.calculateWithPaymentTerm(buy4pay2, { ...base, due_dates: ['2026-11-05'] }),
    ).toThrow(BadRequestException);
    expect(() =>
      calc.calculateWithPaymentTerm(buy4pay2, { ...base, due_dates: ['2026-11-05', '2026-11-06', '2026-11-07'] }),
    ).toThrow(/2 instalment/);
    expect(() =>
      calc.calculateWithPaymentTerm(buy4pay2, { ...base, due_dates: ['2027-01-12', '2026-11-05'] }),
    ).toThrow(/in order/);
    expect(() =>
      calc.calculateWithPaymentTerm(buy4pay2, { ...base, due_dates: ['2026-11-05', '2026-11-05'] }),
    ).toThrow(/in order/);
    expect(() =>
      calc.calculateWithPaymentTerm(buy4pay2, { ...base, due_dates: ['2026-10-01', '2026-11-05'] }),
    ).toThrow(/before the start date/);
    expect(() =>
      calc.calculateWithPaymentTerm(buy4pay2, { ...base, due_dates: ['not a date', '2026-11-05'] }),
    ).toThrow(/not a valid date/);
  });

  it('an empty list means "no agreed dates", not "zero instalments"', () => {
    const r = calc.calculateWithPaymentTerm(buy4pay2, {
      document_total: 7800,
      start_date: '2026-10-06T00:00:00.000Z',
      due_dates: [],
    });
    expect(r.due_dates_source).toBe('term');
    expect(r.installments).toHaveLength(2);
  });

  it('interest and rounding are untouched by agreed dates (three instalments, 1000.00 at 12 % simple)', () => {
    const term = {
      ...buy4pay2,
      id: 'term-3',
      number_of_terms: 3,
      interest_rate: 12,
      interest_calculation_method: 'simple',
    } as unknown as PaymentTerm;
    const withDates = calc.calculateWithPaymentTerm(term, {
      document_total: 1000,
      start_date: '2026-01-01T00:00:00.000Z',
      due_dates: ['2026-01-15', '2026-05-12', '2026-09-08'],
    });
    const without = calc.calculateWithPaymentTerm(term, {
      document_total: 1000,
      start_date: '2026-01-01T00:00:00.000Z',
    });
    expect(withDates.total_amount).toBe(without.total_amount);
    expect(withDates.installments.map((i) => i.amount)).toEqual(without.installments.map((i) => i.amount));
    expect(withDates.installments.reduce((s, i) => s + i.amount, 0)).toBeCloseTo(withDates.total_amount, 2);
  });

  describe('PaymentTermsService.applyPaymentTermToDocument', () => {
    const activityLogs = { logCreate: jest.fn() };
    const calcSpy = {
      calculateWithPaymentTerm: jest.fn().mockImplementation((term: PaymentTerm, input: any) =>
        calc.calculateWithPaymentTerm(term, input),
      ),
    };
    let saved: any[];
    const manager: any = {
      query: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockImplementation(async (entity: any) => {
        if (entity?.name === 'AppliedPaymentTerm') return null;
        if (entity?.name === 'PaymentTerm') return buy4pay2;
        return null;
      }),
      create: jest.fn((_entity: any, v: any) => v),
      save: jest.fn(async (_entity: any, v: any) => {
        saved.push(v);
        return { ...v, id: 'applied-1' };
      }),
    };
    const service = () =>
      new PaymentTermsService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { transaction: (cb: any) => cb(manager) } as any,
        activityLogs as any,
        calcSpy as any,
      );

    beforeEach(() => {
      saved = [];
      calcSpy.calculateWithPaymentTerm.mockClear();
    });

    it('passes the agreed dates to the engine and records them on the applied term for conversion', async () => {
      const result = await service().applyPaymentTermToDocument(
        {
          document_id: 'quote-1',
          document_type: 'quote',
          payment_term_id: buy4pay2.id,
          document_total: 7800,
          start_date: '2026-10-06T00:00:00.000Z',
          due_dates: ['2026-10-06', '2027-01-12'],
        },
        'user-1',
      );
      expect(calcSpy.calculateWithPaymentTerm).toHaveBeenCalledWith(
        buy4pay2,
        expect.objectContaining({ due_dates: ['2026-10-06', '2027-01-12'] }),
      );
      expect(result.due_dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-06', '2027-01-12']);
      const applied = saved[0];
      const breakdown = JSON.parse(applied.calculation_breakdown);
      expect(breakdown.dueDatesSource).toBe('agreed');
      expect(breakdown.agreedDueDates).toEqual(['2026-10-06', '2027-01-12']);
      expect(agreedDueDatesFromApplied(applied)).toEqual(['2026-10-06', '2027-01-12']);
    });

    it('a plan across terms is refused without agreed dates; nothing is spaced by days', async () => {
      await expect(
        service().applyPaymentTermToDocument(
          {
            document_id: 'quote-2',
            document_type: 'quote',
            payment_term_id: buy4pay2.id,
            document_total: 7800,
            start_date: '2026-10-06T00:00:00.000Z',
          },
          'user-1',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PAYMENT_PLAN_DATES_REQUIRED' }),
      });
      expect(saved).toHaveLength(0);
    });

    it('agreedDueDatesFromApplied tolerates legacy rows (no breakdown, junk breakdown)', () => {
      expect(agreedDueDatesFromApplied(null)).toBeUndefined();
      expect(agreedDueDatesFromApplied({ calculation_breakdown: null } as any)).toBeUndefined();
      expect(agreedDueDatesFromApplied({ calculation_breakdown: '{not json' } as any)).toBeUndefined();
      expect(agreedDueDatesFromApplied({ calculation_breakdown: '{"agreedDueDates":[1,2]}' } as any)).toBeUndefined();
    });
  });
});
