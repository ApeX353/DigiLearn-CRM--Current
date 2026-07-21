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

  @Column({ type: 'varchar', length: 36 })
  lead_id: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ type: 'enum', enum: LEAD_STATUSES })
  requested_status: LeadStatus;

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

  @Column({ type: 'varchar', length: 36, nullable: true })
  requested_by_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'requested_by_id' })
  requested_by: User | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewed_by_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewed_by: User | null;

  @Column({ type: 'datetime', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  review_note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updated_at: Date;
}
