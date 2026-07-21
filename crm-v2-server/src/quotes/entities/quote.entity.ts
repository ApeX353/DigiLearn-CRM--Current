import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { School } from '../../schools/entities/schools.entity';
import { Deal } from '../../deals/entities/deal.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import { PaymentTerm } from '../../payment-terms/entities/payment-term.entity';
import { QUOTE_STATUSES } from '../constants';
import type { QuoteStatus } from '../constants';

@Entity('quotes')
@Index(['quote_number'], { unique: true })
@Index(['school_id'])
@Index(['owner_id'])
@Index(['status'])
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  quote_number: string;

  // ========================
  // RELATIONS
  // ========================

  @Column({ name: 'person_id', type: 'varchar', length: 36, nullable: true })
  person_id: string | null;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'person_id' })
  person: Contact | null;

  @Column({ name: 'deal_id', type: 'varchar', length: 36, nullable: true })
  deal_id: string | null;

  @ManyToOne(() => Deal, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deal_id' })
  deal: Deal | null;

  @Column({ name: 'owner_id', type: 'varchar', length: 36 })
  owner_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'school_id', type: 'varchar', length: 36 })
  school_id: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  // ========================
  // CLIENT INFO (SNAPSHOT)
  // ========================

  @Column({ type: 'varchar', length: 255 })
  client_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  client_email: string | null;

  @Column({ type: 'text', nullable: true })
  client_address: string | null;

  // ========================
  // STATUS & AMOUNTS
  // ========================

  @Column({
    type: 'enum',
    enum: QUOTE_STATUSES,
    default: 'Draft',
  })
  status: QuoteStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  tax: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'timestamp', nullable: true })
  valid_until: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ default: false })
  po_received: boolean;

  @Column({ name: 'payment_term_id', type: 'varchar', length: 36, nullable: true })
  payment_term_id: string | null;

  @ManyToOne(() => PaymentTerm, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payment_term_id' })
  payment_term: PaymentTerm | null;

  // ========================
  // TIMESTAMPS
  // ========================

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
