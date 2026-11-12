import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentTerm } from './entities/payment-term.entity';
import type { InterestCalculationMethod } from './constants';

export interface CalculatedInstallment {
  installment_number: number;
  amount: number;
  due_date: Date;
  grace_due_date: Date;
}

export interface InstallmentCalculationResult {
  payment_term: PaymentTerm;
  start_date: Date;
  number_of_terms: number;
  interest_rate: number;
  interest_amount: number;
  total_amount: number;
  installment_amount: number;
  installments: CalculatedInstallment[];
  final_due_date: Date | null;
  final_grace_due_date: Date | null;
}

export interface InstallmentCalculationInput {
  payment_term_id: string;
  document_total: number;
  interest?: number;
  start_date?: Date | string;
}

@Injectable()
export class InstallmentCalculationService {
  constructor(
    @InjectRepository(PaymentTerm)
    private readonly paymentTermRepository: Repository<PaymentTerm>,
  ) {}

  async calculate(
    input: InstallmentCalculationInput,
  ): Promise<InstallmentCalculationResult> {
    const paymentTerm = await this.paymentTermRepository.findOne({
      where: { id: input.payment_term_id },
      relations: ['periods'],
      order: { periods: { period_number: 'ASC' } },
    });

    if (!paymentTerm) {
      throw new NotFoundException(
        `Payment term ${input.payment_term_id} not found`,
      );
    }

    return this.calculateWithPaymentTerm(paymentTerm, input);
  }

  calculateWithPaymentTerm(
    paymentTerm: PaymentTerm,
    input: Omit<InstallmentCalculationInput, 'payment_term_id'>,
  ): InstallmentCalculationResult {
    const startDate = input.start_date ? new Date(input.start_date) : new Date();
    const numberOfTerms = Math.max(1, paymentTerm.number_of_terms ?? 1);
    const interestRate = Number(
      input.interest ?? paymentTerm.interest_rate ?? 0,
    );

    const interestAmount = this.roundCurrency(
      this.calculateInterestAmount(
        input.document_total,
        interestRate,
        paymentTerm.interest_calculation_method,
        numberOfTerms,
      ),
    );

    const totalAmount = this.roundCurrency(input.document_total + interestAmount);
    const dueDates = this.calculateInstallmentDueDates(
      startDate,
      paymentTerm,
      numberOfTerms,
    );

    if (dueDates.length !== numberOfTerms) {
      throw new BadRequestException(
        `Payment term ${paymentTerm.id} cannot produce ${numberOfTerms} due dates`,
      );
    }

    const graceDays = Math.max(0, Number(paymentTerm.grace_period_days || 0));
    const installmentAmounts = this.distributeInstallmentAmounts(
      totalAmount,
      numberOfTerms,
    );

    const installments: CalculatedInstallment[] = dueDates.map(
      (dueDate, index) => ({
        installment_number: index + 1,
        amount: installmentAmounts[index],
        due_date: dueDate,
        grace_due_date: this.addDays(dueDate, graceDays),
      }),
    );

    const finalInstallment = installments[installments.length - 1];

    return {
      payment_term: paymentTerm,
      start_date: startDate,
      number_of_terms: numberOfTerms,
      interest_rate: interestRate,
      interest_amount: interestAmount,
      total_amount: totalAmount,
      installment_amount: installmentAmounts[0] ?? totalAmount,
      installments,
      final_due_date: finalInstallment?.due_date ?? null,
      final_grace_due_date: finalInstallment?.grace_due_date ?? null,
    };
  }

  private calculateInterestAmount(
    principal: number,
    interestRate: number,
    method: InterestCalculationMethod,
    numberOfTerms: number,
  ): number {
    const rate = interestRate / 100;

    switch (method) {
      case 'flat':
        return principal * rate;
      case 'simple': {
        const years = numberOfTerms / 12;
        return principal * rate * years;
      }
      case 'compound':
        return principal * (Math.pow(1 + rate / numberOfTerms, numberOfTerms) - 1);
      case 'none':
      default:
        return 0;
    }
  }

  private calculateInstallmentDueDates(
    startDate: Date,
    paymentTerm: Pick<
      PaymentTerm,
      'periods' | 'term_length_days' | 'days_until_due'
    >,
    numberOfTerms: number,
  ): Date[] {
    const dueDates: Date[] = [];

    if (paymentTerm.periods && paymentTerm.periods.length > 0) {
      let currentDate = new Date(startDate);
      let installmentCount = 0;

      for (const period of paymentTerm.periods) {
        currentDate = this.addDays(currentDate, period.duration_days);

        if (
          period.period_type === 'active' &&
          installmentCount < numberOfTerms
        ) {
          dueDates.push(this.addDays(currentDate, period.due_date_offset_days));
          installmentCount++;
        }

        if (installmentCount >= numberOfTerms) {
          break;
        }
      }
    } else if (paymentTerm.term_length_days) {
      for (let i = 0; i < numberOfTerms; i++) {
        dueDates.push(this.addDays(startDate, (i + 1) * paymentTerm.term_length_days));
      }
    } else if (paymentTerm.days_until_due) {
      dueDates.push(this.addDays(startDate, paymentTerm.days_until_due));
    } else {
      for (let i = 0; i < numberOfTerms; i++) {
        dueDates.push(this.addMonths(startDate, i + 1));
      }
    }

    return dueDates;
  }

  private distributeInstallmentAmounts(
    totalAmount: number,
    numberOfTerms: number,
  ): number[] {
    if (numberOfTerms <= 1) {
      return [this.roundCurrency(totalAmount)];
    }

    const roundedTotal = this.roundCurrency(totalAmount);
    const baseAmount = this.roundCurrency(roundedTotal / numberOfTerms);
    const amounts: number[] = Array.from(
      { length: numberOfTerms - 1 },
      () => baseAmount,
    );

    const allocated = amounts.reduce((sum, value) => sum + value, 0);
    const finalAmount = this.roundCurrency(roundedTotal - allocated);
    amounts.push(finalAmount);

    return amounts;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
