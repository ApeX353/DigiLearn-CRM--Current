import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { AppliedPaymentTerm } from './applied-payment-term.entity';
import { PaymentAllocation } from './payment-allocation.entity';
import { INSTALLMENT_STATUSES } from '../constants';
import type { InstallmentStatus } from '../constants';

@Entity('installments')
@Index(['applied_payment_term_id'])
@Index(['due_date'])
@Index(['grace_due_date'])
export class Installment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  applied_payment_term_id: string;

  @Column({ type: 'uuid', nullable: true })
  parent_invoice_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  invoice_id: string | null;

  @Column({ type: 'int' })
  installment_number: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  paid_amount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  balance: number;

  @Column({ type: 'date' })
  due_date: Date;

  @Column({ type: 'date' })
  grace_due_date: Date;

  @Column({
    type: 'enum',
    enum: INSTALLMENT_STATUSES,
    default: 'pending',
  })
  status: InstallmentStatus;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => AppliedPaymentTerm, (apt) => apt.installments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'applied_payment_term_id' })
  applied_payment_term: AppliedPaymentTerm;

  @OneToMany(() => PaymentAllocation, (alloc) => alloc.installment)
  allocations: PaymentAllocation[];
}
