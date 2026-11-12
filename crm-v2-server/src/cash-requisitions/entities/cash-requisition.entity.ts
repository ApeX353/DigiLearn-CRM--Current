import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Deal } from '../../deals/entities/deal.entity';
import { Lead } from '../../leads/entities/lead.entity';
import { Campaign } from '../../campaigns/entities/campaign.entity';
import { RequisitionLineItem } from './requisition-line-item.entity';

export enum RequisitionType {
  PRE_APPROVAL = 'PRE_APPROVAL',
  REIMBURSEMENT = 'REIMBURSEMENT',
}

export enum RequisitionStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  MANAGER_APPROVED = 'MANAGER_APPROVED',
  FINANCE_APPROVED = 'FINANCE_APPROVED',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
}

export enum RequisitionCurrency {
  USD = 'USD',
  ZWG = 'ZWG',
}

/**
 * A cash requisition raised by a rep against a deal (or a pre-deal
 * lead): either PRE_APPROVAL (asking for money before spending) or
 * REIMBURSEMENT (claiming back money already spent).
 *
 * Durability rule: cost records must outlive the commercial object
 * they were raised against — winning/losing a deal only flips
 * deal.closeStatus (no row is deleted), and if a deal/lead row IS
 * hard-deleted the FK is ON DELETE SET NULL, never CASCADE, so the
 * spend history survives for cost-to-close reporting.
 */
@Entity('cash_requisitions')
@Index(['deal_id'])
@Index(['lead_id'])
@Index(['campaign_id'])
@Index(['requested_by_id'])
@Index(['status'])
export class CashRequisition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: RequisitionType })
  type: RequisitionType;

  @Column({
    type: 'enum',
    enum: RequisitionStatus,
    default: RequisitionStatus.DRAFT,
  })
  status: RequisitionStatus;

  @Column({ name: 'requested_by_id', type: 'uuid' })
  requested_by_id: string;

  // No onDelete: users with financial history must not be deletable
  // out from under their requisitions (DB default NO ACTION blocks it).
  @ManyToOne(() => User)
  @JoinColumn({ name: 'requested_by_id' })
  requested_by: User;

  @Column({ name: 'deal_id', type: 'uuid', nullable: true })
  deal_id: string | null;

  @ManyToOne(() => Deal, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deal_id' })
  deal: Deal | null;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  lead_id: string | null;

  @ManyToOne(() => Lead, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead | null;

  /** Campaign-level cost (stand fees, event travel) — linked to a
   *  campaign INSTEAD of a lead/deal. Exactly one linkage applies. */
  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaign_id: string | null;

  @ManyToOne(() => Campaign, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign | null;

  @Column({ type: 'enum', enum: RequisitionCurrency })
  currency: RequisitionCurrency;

  /**
   * Sum of line item amounts, recomputed server-side on every line
   * item write. Never trusted from the client.
   */
  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
  })
  total_amount: string;

  @Column({ type: 'text' })
  reason: string;

  /* ===== approval trail ===== */

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submitted_at: Date | null;

  @Column({ name: 'manager_actioned_by_id', type: 'uuid', nullable: true })
  manager_actioned_by_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'manager_actioned_by_id' })
  manager_actioned_by: User | null;

  @Column({ name: 'manager_actioned_at', type: 'timestamp', nullable: true })
  manager_actioned_at: Date | null;

  @Column({ name: 'finance_actioned_by_id', type: 'uuid', nullable: true })
  finance_actioned_by_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'finance_actioned_by_id' })
  finance_actioned_by: User | null;

  @Column({ name: 'finance_actioned_at', type: 'timestamp', nullable: true })
  finance_actioned_at: Date | null;

  /** Populated on REJECTED (by whichever stage rejected). */
  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejection_reason: string | null;

  /** Which stage rejected: 'manager' | 'finance' (null unless REJECTED). */
  @Column({
    name: 'rejected_stage',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  rejected_stage: string | null;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paid_at: Date | null;

  @OneToMany(() => RequisitionLineItem, (item) => item.requisition, {
    cascade: true,
  })
  line_items: RequisitionLineItem[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
