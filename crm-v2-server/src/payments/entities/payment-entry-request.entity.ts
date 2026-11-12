import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Invoice } from '../../invoices/entities/invoice.entity';
import { User } from '../../users/entities/user.entity';
import { Payment } from './payment.entity';

export const PAYMENT_ENTRY_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;

export type PaymentEntryRequestStatus =
  (typeof PAYMENT_ENTRY_REQUEST_STATUSES)[number];

@Entity('payment_entry_requests')
@Index(['status', 'requested_at'])
@Index(['invoice_id', 'status'])
@Index(['requested_by_id'])
export class PaymentEntryRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  invoice_id: string;

  @ManyToOne(() => Invoice, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'timestamp' })
  payment_date: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  method: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  invoice_total_snapshot: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  outstanding_snapshot: number;

  @Column({ type: 'uuid' })
  invoice_owner_id_snapshot: string;

  @Column({
    type: 'enum',
    enum: PAYMENT_ENTRY_REQUEST_STATUSES,
    default: 'pending',
  })
  status: PaymentEntryRequestStatus;

  @Column({ type: 'uuid' })
  requested_by_id: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by_id' })
  requested_by: User;

  @CreateDateColumn({ name: 'requested_at', type: 'timestamp' })
  requested_at: Date;

  @Column({ type: 'uuid', nullable: true })
  reviewed_by_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewed_by: User | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  review_note: string | null;

  @Column({ type: 'uuid', nullable: true, unique: true })
  resulting_payment_id: string | null;

  @ManyToOne(() => Payment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resulting_payment_id' })
  resulting_payment: Payment | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at: Date;
}
