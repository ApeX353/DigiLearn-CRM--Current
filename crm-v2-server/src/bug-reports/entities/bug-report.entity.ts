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
  /**
   * Above critical: drop everything. Added 2026-07-28 for the findings of
   * the codebase audit — faults an ordinary user can exploit today to
   * reach or change other people's records, and credential handling that
   * can silently fall back to a guessable key.
   */
  VERY_CRITICAL = 'very_critical',
}

/**
 * Lifecycle states. The original four (open/in_progress/resolved/closed)
 * are kept so no historical row is invalidated; the Work-Tracker redesign
 * (2026-08-02, BUG-TRACKER-CLASSIFICATION-REDESIGN.md) adds the honest
 * set below.
 *
 *   new(=open) -> triaged -> ready -> in_progress -> verification -> done
 *                                \-> backlog
 *   terminal: duplicate | cancelled | wont_do (+ legacy resolved/closed)
 *
 * `backlog` is where requested-but-not-yet-scheduled work lives (features
 * especially), so `closed` stops doubling as a feature backlog.
 */
export enum BugStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  BACKLOG = 'backlog',
  VERIFICATION = 'verification',
  DONE = 'done',
  DUPLICATE = 'duplicate',
  CANCELLED = 'cancelled',
  WONT_DO = 'wont_do',
}

/**
 * What kind of work a ticket really is. Severity/priority describe impact
 * and scheduling; this describes the nature of the work, so a feature
 * request stops being filed (and "fixed") as a bug.
 */
export enum WorkType {
  BUG = 'bug',
  FEATURE = 'feature',
  DATA_TASK = 'data_task',
  INVESTIGATION = 'investigation',
  TASK = 'task',
}

/**
 * Delivery decision for ANY work item — deliberately separate from
 * severity, which stays a bug-impact measure only. Nullable: an untriaged
 * item carries no priority yet.
 */
export enum WorkPriority {
  P0 = 'p0',
  P1 = 'p1',
  P2 = 'p2',
  P3 = 'p3',
  BACKLOG = 'backlog',
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
@Index(['work_type'])
@Index(['priority'])
export class BugReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  /**
   * What kind of work this ticket is. Defaults to `bug` so the historical
   * meaning of the tracker is preserved until a triager reclassifies.
   */
  @Column({
    name: 'work_type',
    type: 'enum',
    enum: WorkType,
    default: WorkType.BUG,
  })
  work_type: WorkType;

  @Column({ type: 'enum', enum: BugSeverity, default: BugSeverity.MEDIUM })
  severity: BugSeverity;

  /** Delivery priority — separate from severity; null until triaged. */
  @Column({ type: 'enum', enum: WorkPriority, nullable: true })
  priority: WorkPriority | null;

  @Column({ type: 'enum', enum: BugStatus, default: BugStatus.OPEN })
  status: BugStatus;

  /** Free-text area of the product, e.g. leads / payments / imports. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  component: string | null;

  /**
   * Cross-cutting tags (security, payments, leads, imports, production…).
   * jsonb array, mirroring lead_import_batches.rows — a security concern is
   * a label on a bug, never a work type of its own.
   */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  labels: string[];

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

  /**
   * When the ticket entered resolved/closed; cleared if it is reopened.
   * Deliberately the ONLY per-ticket date beyond created_at: open tickets
   * carry no aging signal, a solved ticket shows when it was solved
   * (owner decision 2026-07-26).
   */
  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolved_at: Date | null;

  /**
   * Lifecycle stamps added by the Work-Tracker redesign. Each is set when
   * the ticket first enters the matching phase; all nullable so an
   * untouched ticket carries no aging signal it hasn't earned.
   */
  @Column({ name: 'triaged_at', type: 'timestamp', nullable: true })
  triaged_at: Date | null;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  started_at: Date | null;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verified_at: Date | null;

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closed_at: Date | null;

  /** When set, this ticket is a duplicate of the referenced one. */
  @Column({ name: 'duplicate_of_id', type: 'uuid', nullable: true })
  duplicate_of_id: string | null;

  @ManyToOne(() => BugReport, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'duplicate_of_id' })
  duplicate_of: BugReport | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
