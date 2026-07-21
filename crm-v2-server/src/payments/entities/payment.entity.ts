import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Invoice } from '../../invoices/entities/invoice.entity';
import { PaymentAllocation } from '../../payment-terms/entities/payment-allocation.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  invoice_id: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'timestamp' })
  payment_date: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  method: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  allocated_amount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  unallocated_amount: number;

  // Relations
  @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @OneToMany(() => PaymentAllocation, (alloc) => alloc.payment)
  allocations: PaymentAllocation[];
}
