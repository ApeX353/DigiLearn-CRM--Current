import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LEAD_STATUSES } from '../constants';
import type { LeadStatus } from '../constants';

@Entity('lead_sla_config')
@Index(['status'], { unique: true })
export class LeadSLA {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: LEAD_STATUSES,
  })
  status: LeadStatus;

  @Column({ type: 'int', comment: 'SLA time limit in hours' })
  sla_hours: number;

  @Column({
    type: 'int',
    comment: 'Hours after which to escalate if no action',
  })
  escalation_after_hours: number;

  @Column({
    type: 'int',
    comment: 'Hours of inactivity before sending alert',
  })
  idle_alert_hours: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Message template for escalation notifications',
  })
  message: string | null;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
