import { BadRequestException } from '@nestjs/common';
import { InstallmentCalculationService } from './installment-calculation.service';
import { PaymentTerm } from './entities/payment-term.entity';

describe('InstallmentCalculationService', () => {
  const service = new InstallmentCalculationService({} as any);

  const buildTerm = (
    overrides: Partial<PaymentTerm> = {},
  ): PaymentTerm =>
    ({
      id: 'term-1',
      name: 'Test Term',
      type: 'custom',
      interest_rate: 12,
      interest_calculation_method: 'simple',
      invoice_strategy: 'single_with_installments',
      number_of_terms: 3,
      term_length_days: 30,
      days_until_due: null,
      grace_period_days: 5,
      periods: [],
      ...overrides,
    }) as PaymentTerm;

  it('calculates simple interest using term rate', () => {
    const term = buildTerm({
      interest_calculation_method: 'simple',
      interest_rate: 12,
      number_of_terms: 12,
    });
    const result = service.calculateWithPaymentTerm(term, {
      document_total: 1000,
      start_date: '2026-01-01T00:00:00.000Z',
    });

    expect(result.interest_rate).toBe(12);
    expect(result.interest_amount).toBe(120);
    expect(result.total_amount).toBe(1120);
  });

  it('uses posted interest override when provided', () => {
    const term = buildTerm({
      interest_calculation_method: 'flat',
      interest_rate: 2.5,
    });
    const result = service.calculateWithPaymentTerm(term, {
      document_total: 1000,
      interest: 10,
      start_date: '2026-01-01T00:00:00.000Z',
    });

    expect(result.interest_rate).toBe(10);
    expect(result.interest_amount).toBe(100);
    expect(result.total_amount).toBe(1100);
  });

  it('calculates compound and none methods', () => {
    const compoundTerm = buildTerm({
      interest_calculation_method: 'compound',
      interest_rate: 12,
      number_of_terms: 12,
    });
    const compound = service.calculateWithPaymentTerm(compoundTerm, {
      document_total: 1000,
      start_date: '2026-01-01T00:00:00.000Z',
    });
    expect(compound.interest_amount).toBeGreaterThan(126);
    expect(compound.interest_amount).toBeLessThan(127);

    const noneTerm = buildTerm({
      interest_calculation_method: 'none',
      interest_rate: 12,
    });
    const none = service.calculateWithPaymentTerm(noneTerm, {
      document_total: 1000,
      start_date: '2026-01-01T00:00:00.000Z',
    });
    expect(none.interest_amount).toBe(0);
    expect(none.total_amount).toBe(1000);
  });

  it('builds grace due dates from contractual due dates', () => {
    const term = buildTerm({
      number_of_terms: 2,
      term_length_days: 10,
      grace_period_days: 3,
    });
    const result = service.calculateWithPaymentTerm(term, {
      document_total: 200,
      start_date: '2026-01-01T00:00:00.000Z',
    });

    expect(result.installments).toHaveLength(2);
    expect(result.installments[0].due_date.toISOString().slice(0, 10)).toBe(
      '2026-01-11',
    );
    expect(
      result.installments[0].grace_due_date.toISOString().slice(0, 10),
    ).toBe('2026-01-14');
  });

  it('applies rounding remainder on last installment and keeps exact sum', () => {
    const term = buildTerm({
      interest_calculation_method: 'none',
      number_of_terms: 3,
      term_length_days: 30,
    });
    const result = service.calculateWithPaymentTerm(term, {
      document_total: 100,
      start_date: '2026-01-01T00:00:00.000Z',
    });

    const amounts = result.installments.map((item) => item.amount);
    const sum = amounts.reduce((acc, value) => acc + value, 0);

    expect(amounts[0]).toBe(33.33);
    expect(amounts[1]).toBe(33.33);
    expect(amounts[2]).toBe(33.34);
    expect(sum).toBe(100);
  });

  it('throws when configured periods cannot generate all due dates', () => {
    const term = buildTerm({
      number_of_terms: 2,
      periods: [
        {
          id: 'p1',
          payment_term_id: 'term-1',
          period_number: 1,
          period_type: 'active',
          duration_days: 30,
          due_date_offset_days: 0,
          created_at: new Date(),
          payment_term: {} as PaymentTerm,
        },
      ],
      term_length_days: null,
      days_until_due: null,
    });

    expect(() =>
      service.calculateWithPaymentTerm(term, {
        document_total: 1000,
        start_date: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });
});
