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
import { Payment } from '../../payments/entities/payment.entity';
import { User } from '../../users/entities/user.entity';
import { School } from '../../schools/entities/schools.entity';
import { Deal } from '../../deals/entities/deal.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import { Quote } from '../../quotes/entities/quote.entity';
import { PaymentTerm } from '../../payment-terms/entities/payment-term.entity';
import { INVOICE_STATUSES, PAYMENT_STATUSES } from '../constants';
import type { InvoiceStatus, PaymentStatus } from '../constants';

@Entity('invoices')
@Index(['invoice_number'], { unique: true })
@Index(['school_id'])
@Index(['owner_id'])
@Index(['status'])
@Index(['payment_status'])
@Index(['parent_invoice_id'])
@Index(['is_summary_invoice'])
@Index(['grace_due_date'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  invoice_number: string;

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

  @Column({ name: 'quote_id', type: 'varchar', length: 36, nullable: true })
  quote_id: string | null;

  @ManyToOne(() => Quote, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'quote_id' })
  quote: Quote | null;

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
    enum: INVOICE_STATUSES,
    default: 'Draft',
  })
  status: InvoiceStatus;

  @Column({
    type: 'enum',
    enum: PAYMENT_STATUSES,
    default: 'Unpaid',
  })
  payment_status: PaymentStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  tax: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount_paid: number;

  @Column({ type: 'timestamp', nullable: true })
  due_date: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  grace_due_date: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  paid_date: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'payment_term_id', type: 'varchar', length: 36, nullable: true })
  payment_term_id: string | null;

  @ManyToOne(() => PaymentTerm, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payment_term_id' })
  payment_term: PaymentTerm | null;

  @Column({
    name: 'parent_invoice_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  parent_invoice_id: string | null;

  @ManyToOne(() => Invoice, (invoice) => invoice.child_invoices, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_invoice_id' })
  parent_invoice: Invoice | null;

  @OneToMany(() => Invoice, (invoice) => invoice.parent_invoice)
  child_invoices: Invoice[];

  @Column({ type: 'boolean', default: false })
  is_summary_invoice: boolean;

  // ========================
  // PAYMENTS RELATION
  // ========================

  @OneToMany(() => Payment, (payment) => payment.invoice)
  payments: Payment[];

  // ========================
  // TIMESTAMPS
  // ========================

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
