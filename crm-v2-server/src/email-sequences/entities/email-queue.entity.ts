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
import { EmailSequence } from './email-sequence.entity';
import { Lead } from '../../leads/entities/lead.entity';

export const EMAIL_QUEUE_STATUSES = [
  'pending',
  'sent',
  'failed',
  'cancelled',
] as const;

export type EmailQueueStatus = (typeof EMAIL_QUEUE_STATUSES)[number];

@Entity('email_queue')
@Index(['status', 'scheduled_at'])
@Index(['lead_id'])
@Index(['sequence_id'])
export class EmailQueue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  lead_id: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ name: 'sequence_id', type: 'uuid' })
  sequence_id: string;

  @ManyToOne(() => EmailSequence, (s) => s.queue_items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sequence_id' })
  sequence: EmailSequence;

  @Column({ type: 'int' })
  step_index: number;

  @Column({ type: 'timestamp' })
  scheduled_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  sent_at: Date | null;

  @Column({
    type: 'enum',
    enum: EMAIL_QUEUE_STATUSES,
    default: 'pending',
  })
  status: EmailQueueStatus;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
