import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Payment } from '../../payments/entities/payment.entity';
import { Installment } from './installment.entity';

@Entity('payment_allocations')
@Index(['payment_id'])
@Index(['installment_id'])
@Index(['reference'])
export class PaymentAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  payment_id: string;

  @Column({ type: 'varchar', length: 36 })
  installment_id: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  allocated_amount: number;

  @Column({ type: 'int' })
  allocation_order: number;

  @Column({ type: 'date' })
  allocation_date: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  // Relations
  @ManyToOne(() => Payment, (payment) => payment.allocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;

  @ManyToOne(() => Installment, (inst) => inst.allocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'installment_id' })
  installment: Installment;
}
