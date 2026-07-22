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

export enum BugSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum BugStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

/**
 * An in-house bug/issue ticket raised by any CRM user. Reports are
 * triaged by admins/admin_support (the owner, prince), who can assign a
 * ticket to a specific person and move it through its lifecycle. The
 * assignment and status changes fan out as in-app notifications.
 */
@Entity('bug_reports')
@Index(['status'])
@Index(['reported_by_id'])
@Index(['assigned_to_id'])
export class BugReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: BugSeverity, default: BugSeverity.MEDIUM })
  severity: BugSeverity;

  @Column({ type: 'enum', enum: BugStatus, default: BugStatus.OPEN })
  status: BugStatus;

  /** Where the reporter hit the bug (route/URL), free text, optional. */
  @Column({ name: 'page_url', type: 'varchar', length: 500, nullable: true })
  page_url: string | null;

  @Column({ name: 'reported_by_id', type: 'uuid' })
  reported_by_id: string;

  // No onDelete: a report always keeps its reporter for accountability.
  @ManyToOne(() => User)
  @JoinColumn({ name: 'reported_by_id' })
  reported_by: User;

  @Column({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assigned_to_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to_id' })
  assigned_to: User | null;

  /** Filled when the ticket is resolved/closed — what was done. */
  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolution_note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
