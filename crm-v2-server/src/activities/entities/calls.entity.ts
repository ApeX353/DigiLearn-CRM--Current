import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { Activity } from './activity.entity';
import { CallOutcomeTag } from './call-outcome-tags.entity';

export enum CallOutcome {
  ANSWERED = 'answered',
  NO_ANSWER = 'no_answer',
  VOICEMAIL = 'voicemail',
  BUSY = 'busy',
  WRONG_NUMBER = 'wrong_number',
}

@Entity('calls')
@Index('idx_activity', ['activity_id'], { unique: true})
@Index('idx_outcome', ['outcome'])
@Index('idx_outcome_tag', ['outcome_id'])
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  activity_id: string;

  @Column({ type: 'varchar', length: 50 })
  phone_number: string;

  @Column({
    type: 'enum',
    enum: CallOutcome,
  })
  outcome: CallOutcome;

  @Column({ type: 'uuid', nullable: true })
  outcome_id: string; // Reference to CallOutcome table

  @Column({ type: 'int', nullable: true, comment: 'Duration in seconds' })
  duration: number;

  // Call details
  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  recording_url: string;

  @Column({ type: 'text', nullable: true })
  transcription: string;

  // Next steps
  @Column({ type: 'boolean', default: false })
  follow_up_required: boolean;

  @Column({ type: 'timestamp', nullable: true })
  follow_up_date: Date;

  // Legacy fields from your current schema
  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'text', nullable: true })
  next_steps: string;

  @Column({ type: 'timestamp', nullable: true })
  due_date_time: Date;

  @Column({ type: 'boolean', default: false })
  is_draft: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
  // Relations
  @OneToOne(() => Activity, (activity) => activity.call, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'activity_id' })
  activity: Activity;

  @ManyToOne(() => CallOutcomeTag, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'outcome_id' })
  outcome_tag: CallOutcomeTag;
}
