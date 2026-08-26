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
import { Lead } from './lead.entity';
import { User } from '../../users/entities/user.entity';
import { LEAD_STATUSES } from '../constants';
import type { LeadStatus } from '../constants';

export const LEAD_REVERSAL_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;

export type LeadReversalRequestStatus =
  (typeof LEAD_REVERSAL_REQUEST_STATUSES)[number];

@Entity('lead_reversal_requests')
@Index(['lead_id', 'status'])
@Index(['requested_by_id'])
export class LeadReversalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  lead_id: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ type: 'enum', enum: LEAD_STATUSES })
  requested_status: LeadStatus;

  /**
   * Kind of request — historically this entity only represented
   * status reversals (e.g. "restore from Disqualified back to
   * Contacted"), but Phase 7 of the management-control pass folded
   * reassignment approval into the same queue so managers have a
   * single place to handle rep-initiated changes. Phase A.1 of the
   * compliance hardening plan added a third kind for tactical
   * disqualifications.
   *
   *   status_reversal     — legacy rows; requests a lead status rollback.
   *   reassignment        — rep wants the lead moved to a different owner.
   *   tactical_disqualify — rep wants to disqualify a lead with a
   *                         soft/judgement reason (no budget, not
   *                         interested, etc.). Manager approval is
   *                         required before the disqualify is applied,
   *                         unless the compliance switch is off or the
   *                         caller is admin/sales_manager.
   *
   * Default is `status_reversal` so existing rows keep their original
   * meaning. New rows set this explicitly.
   */
  @Column({
    type: 'varchar',
    length: 32,
    default: 'status_reversal',
  })
  kind: 'status_reversal' | 'reassignment' | 'tactical_disqualify';

  /**
   * Target user for `reassignment` kind — the rep the requester wants
   * the lead moved to. NULL for status-reversal requests.
   */
  @Column({ type: 'uuid', nullable: true })
  proposed_assignee_id: string | null;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: LEAD_REVERSAL_REQUEST_STATUSES,
    default: 'pending',
  })
  status: LeadReversalRequestStatus;

  @Column({ type: 'uuid', nullable: true })
  requested_by_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'requested_by_id' })
  requested_by: User | null;

  @Column({ type: 'uuid', nullable: true })
  reviewed_by_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewed_by: User | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  review_note: string | null;

  /**
   * Enquiry thread (TEST-BACKLOG #12). A manager can ask the rep for more
   * information before deciding; the rep answers; the manager may ask again.
   * Each turn is appended here. The request stays `pending` throughout —
   * `awaiting_rep_response` says whose court the ball is in.
   */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  enquiry_thread: Array<{
    by: 'manager' | 'rep';
    by_id: string | null;
    message: string;
    at: string;
  }>;

  /** True when a manager has asked and is waiting on the rep to answer. */
  @Column({ type: 'boolean', default: false })
  awaiting_rep_response: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at: Date;
}
