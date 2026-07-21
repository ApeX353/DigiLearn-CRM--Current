import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PaymentTermPeriod } from './payment-term-period.entity';
import { AppliedPaymentTerm } from './applied-payment-term.entity';
import {
  PAYMENT_TERM_TYPES,
  INTEREST_CALCULATION_METHODS,
  INVOICE_STRATEGIES,
} from '../constants';
import type {
  PaymentTermType,
  InterestCalculationMethod,
  InvoiceStrategy,
} from '../constants';

@Entity('payment_terms')
export class PaymentTerm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @Column({ type: 'enum', enum: PAYMENT_TERM_TYPES })
  type: PaymentTermType;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  interest_rate: number;

  @Column({
    type: 'enum',
    enum: INTEREST_CALCULATION_METHODS,
    default: 'simple',
  })
  interest_calculation_method: InterestCalculationMethod;

  @Column({
    type: 'enum',
    enum: INVOICE_STRATEGIES,
    default: 'single_with_installments',
  })
  invoice_strategy: InvoiceStrategy;

  @Column({ type: 'int', nullable: true })
  number_of_terms: number | null;

  @Column({ type: 'int', nullable: true })
  term_length_days: number | null;

  @Column({ type: 'int', nullable: true })
  days_until_due: number | null;

  @Column({ type: 'int', default: 0 })
  grace_period_days: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  late_fee_percentage: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  late_fee_amount: number;

  @Column({ type: 'text', nullable: true })
  terms_and_conditions: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_default: boolean;

  @Column({ type: 'int', default: 0 })
  display_order: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  // Relations
  @OneToMany(() => PaymentTermPeriod, (period) => period.payment_term, {
    cascade: true,
  })
  periods: PaymentTermPeriod[];

  @OneToMany(() => AppliedPaymentTerm, (applied) => applied.payment_term)
  applied_terms: AppliedPaymentTerm[];
}
