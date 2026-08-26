import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { PaymentTerm } from './payment-term.entity';
import { PERIOD_TYPES } from '../constants';
import type { PeriodType } from '../constants';

@Entity('payment_term_periods')
@Index(['payment_term_id', 'period_number'], { unique: true })
export class PaymentTermPeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  payment_term_id: string;

  @Column({ type: 'int' })
  period_number: number;

  @Column({ type: 'enum', enum: PERIOD_TYPES })
  period_type: PeriodType;

  @Column({ type: 'int' })
  duration_days: number;

  @Column({ type: 'int', default: 0 })
  due_date_offset_days: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  // Relations
  @ManyToOne(() => PaymentTerm, (term) => term.periods, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'payment_term_id' })
  payment_term: PaymentTerm;
}
