import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { EmailQueue } from './email-queue.entity';

export interface EmailSequenceStep {
  delay_hours: number;
  template_name: string;
  subject: string;
}

export const TRIGGER_EVENTS = [
  'lead_status_change_to_New',
  'lead_status_change_to_Contacted',
  'lead_status_change_to_Nurture',
  'lead_status_change_to_Qualified',
  'lead_status_change_to_Disqualified',
  'lead_status_change_to_Converted',
] as const;

export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

@Entity('email_sequences')
export class EmailSequence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  trigger_event: string;

  @Column({ type: 'json' })
  steps: EmailSequenceStep[];

  @Column({ default: true })
  is_active: boolean;

  @OneToMany(() => EmailQueue, (q) => q.sequence)
  queue_items: EmailQueue[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
