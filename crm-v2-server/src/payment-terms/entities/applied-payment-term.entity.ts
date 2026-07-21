import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { PaymentTerm } from './payment-term.entity';
import { Installment } from './installment.entity';
import {
  APPLIED_DOCUMENT_TYPES,
  PAYMENT_TERM_TYPES,
  INTEREST_CALCULATION_METHODS,
  INVOICE_STRATEGIES,
} from '../constants';
import type {
  AppliedDocumentType,
  PaymentTermType,
  InterestCalculationMethod,
  InvoiceStrategy,
} from '../constants';

@Entity('applied_payment_terms')
@Index(['document_id', 'document_type'])
export class AppliedPaymentTerm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  document_id: string;

  @Column({ type: 'enum', enum: APPLIED_DOCUMENT_TYPES })
  document_type: AppliedDocumentType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  payment_term_id: string | null;

  // Snapshot fields
  @Column({ type: 'varchar', length: 100 })
  term_name: string;

  @Column({ type: 'enum', enum: PAYMENT_TERM_TYPES })
  term_type: PaymentTermType;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  interest_rate: number;

  @Column({ type: 'enum', enum: INTEREST_CALCULATION_METHODS })
  interest_calculation_method: InterestCalculationMethod;

  @Column({ type: 'enum', enum: INVOICE_STRATEGIES })
  invoice_strategy: InvoiceStrategy;

  // Financial
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  interest_amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  total_amount: number;

  @Column({ type: 'int' })
  number_of_installments: number;

  @Column({ type: 'int', nullable: true })
  term_length_days: number | null;

  @Column({ type: 'int', nullable: true })
  days_until_due: number | null;

  @Column({ type: 'int', default: 0 })
  grace_period_days: number;

  @Column({ type: 'date' })
  start_date: Date;

  @Column({ type: 'date', nullable: true })
  final_due_date: Date | null;

  @Column({ type: 'text', nullable: true })
  terms_and_conditions: string | null;

  @Column({ type: 'text', nullable: true })
  calculation_breakdown: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => PaymentTerm, (term) => term.applied_terms, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'payment_term_id' })
  payment_term: PaymentTerm | null;

  @OneToMany(() => Installment, (inst) => inst.applied_payment_term, {
    cascade: true,
  })
  installments: Installment[];
}
