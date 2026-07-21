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
import { User } from '../../users/entities/user.entity';

/**
 * Duplicate-suspicion queue (Phase 8 of the management-control pass).
 *
 * One row is created every time a rep saves a NEW lead, school or
 * contact whose identifying signals (phone / email / name / district)
 * match an existing record above a configurable threshold. Managers
 * review the queue and decide:
 *
 *   merged           — the new row is the dup; it should be merged
 *                      into the existing record (server TBD).
 *   kept_separate    — both are legitimate; remember the decision so
 *                      future saves don't re-raise the same pair.
 *   false_positive   — heuristic was wrong, nothing to do.
 *
 * Signals are stored as JSON so the UI can render a human-readable
 * reason list ("phone exact", "name fuzzy 92%", "same district") and
 * the heuristic can evolve without a migration.
 */

export const DUPLICATE_RECORD_TYPES = ['lead', 'school', 'contact'] as const;
export type DuplicateRecordType = (typeof DUPLICATE_RECORD_TYPES)[number];

export const DUPLICATE_SUSPICION_STATUSES = [
  'pending',
  'merged',
  'kept_separate',
  'false_positive',
] as const;
export type DuplicateSuspicionStatus =
  (typeof DUPLICATE_SUSPICION_STATUSES)[number];

export interface DuplicateSignal {
  kind: string; // e.g. 'phone_exact', 'email_exact', 'name_fuzzy'
  weight: number; // contribution to the overall score
  detail?: string | null; // e.g. similarity %, the matched token
}

@Entity('duplicate_suspicions')
@Index(['record_type', 'status'])
@Index(['new_record_id'])
@Index(['existing_record_id'])
export class DuplicateSuspicion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: DUPLICATE_RECORD_TYPES })
  record_type: DuplicateRecordType;

  @Column({ type: 'uuid' })
  new_record_id: string;

  @Column({ type: 'uuid' })
  existing_record_id: string;

  /** 0–100 aggregate confidence. */
  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'jsonb' })
  signals: DuplicateSignal[];

  @Column({
    type: 'enum',
    enum: DUPLICATE_SUSPICION_STATUSES,
    default: 'pending',
  })
  status: DuplicateSuspicionStatus;

  @Column({ type: 'uuid', nullable: true })
  raised_by_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'raised_by_id' })
  raised_by: User | null;

  @Column({ type: 'uuid', nullable: true })
  reviewed_by_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewed_by: User | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  review_note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at: Date;
}
