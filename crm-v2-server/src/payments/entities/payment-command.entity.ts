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
import { Payment } from './payment.entity';

/**
 * One row per "record a payment" command the API has accepted (FIN-04,
 * 19 Oct 2026). The command's identity is either the client's
 * x-idempotency-key (scoped to the user) or, when none is sent, the natural
 * identity of the money itself: invoice + bank reference. The row is written
 * in the same transaction as the receipt, so a repeat of the same command —
 * a double click, a timeout that already committed, an integration retry —
 * finds it and is answered with the original payment or refused, never
 * stored twice. The two-minute "retry brake" that this replaces only
 * caught sequential repeats and forgot after 120 seconds.
 *
 * payment_id is cleared when the payment is deleted (ON DELETE SET NULL),
 * so a payment entered by mistake, deleted and re-entered with the same
 * reference is allowed; the row is then reused for the new payment.
 */
@Entity('payment_commands')
export class PaymentCommand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200 })
  command_key: string;

  /** sha256 of the canonical payload: invoice, amount, reference, date, method. */
  @Column({ type: 'char', length: 64 })
  payload_hash: string;

  @Column({ type: 'uuid', nullable: true })
  payment_id: string | null;

  @ManyToOne(() => Payment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment | null;

  /** What the caller was answered with, so a replay can be answered the same. */
  @Column({ type: 'jsonb', nullable: true })
  response: Record<string, unknown> | null;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
