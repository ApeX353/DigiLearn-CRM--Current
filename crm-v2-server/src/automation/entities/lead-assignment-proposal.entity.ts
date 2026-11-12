import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';
import { User } from '../../users/entities/user.entity';

export enum AssignmentProposalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  /** The lead was assigned by hand (or deleted) before a decision. */
  SUPERSEDED = 'superseded',
}

/**
 * AUTO1: the auto-assign engine PROPOSES, a manager decides. One row per
 * proposed assignment; nothing touches lead.assigned_to until a manager
 * approves. The reason field says, in plain words, why this rep was
 * picked (territory match, current load) so the approval screen is an
 * informed decision rather than a rubber stamp.
 */
@Entity('lead_assignment_proposals')
@Index(['status'])
@Index(['lead_id', 'status'])
export class LeadAssignmentProposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  lead_id: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ type: 'uuid' })
  proposed_rep_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proposed_rep_id' })
  proposed_rep: User;

  /** Plain-language routing rationale shown to the approving manager. */
  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: AssignmentProposalStatus,
    default: AssignmentProposalStatus.PENDING,
  })
  status: AssignmentProposalStatus;

  @Column({ type: 'uuid', nullable: true })
  decided_by_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'decided_by_id' })
  decided_by: User | null;

  @Column({ type: 'timestamp', nullable: true })
  decided_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
