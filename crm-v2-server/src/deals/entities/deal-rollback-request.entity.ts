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
import { Deal } from './deal.entity';
import { Stage } from '../../pipelines/entities/stage.entity';
import { User } from '../../users/entities/user.entity';

export const DEAL_ROLLBACK_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;

export type DealRollbackRequestStatus =
  (typeof DEAL_ROLLBACK_REQUEST_STATUSES)[number];

@Entity('deal_rollback_requests')
@Index(['deal_id', 'status'])
@Index(['requested_by_id'])
@Index(['approved_by_id'])
@Index(['rejected_by_id'])
export class DealRollbackRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  deal_id: string;

  @ManyToOne(() => Deal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deal_id' })
  deal: Deal;

  @Column({ name: 'from_stage_id', type: 'varchar', length: 36 })
  from_stage_id: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_stage_id' })
  from_stage: Stage;

  @Column({ name: 'to_stage_id', type: 'varchar', length: 36 })
  to_stage_id: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_stage_id' })
  to_stage: Stage;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: DEAL_ROLLBACK_REQUEST_STATUSES,
    default: 'pending',
  })
  status: DealRollbackRequestStatus;

  @Column({ name: 'requested_by_id', type: 'varchar', length: 36, nullable: true })
  requested_by_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'requested_by_id' })
  requested_by: User | null;

  @Column({ name: 'approved_by_id', type: 'varchar', length: 36, nullable: true })
  approved_by_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'approved_by_id' })
  approved_by: User | null;

  @Column({ name: 'rejected_by_id', type: 'varchar', length: 36, nullable: true })
  rejected_by_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'rejected_by_id' })
  rejected_by: User | null;

  @CreateDateColumn({ name: 'requested_at', type: 'timestamp' })
  requested_at: Date;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ name: 'rejected_at', type: 'timestamp', nullable: true })
  rejected_at: Date | null;

  @Column({ type: 'text', nullable: true })
  review_note: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at: Date;
}
