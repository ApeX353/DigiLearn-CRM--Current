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

@Entity('lead_sla_history')
@Index(['lead_id'])
@Index(['status'])
@Index(['escalated'])
export class LeadSLAHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ name: 'lead_id', type: 'varchar', length: 36 })
  lead_id: string;

  @Column({
    type: 'enum',
    enum: LEAD_STATUSES,
  })
  status: LeadStatus;

  @Column({ type: 'datetime', comment: 'When the lead entered this status' })
  entered_status_at: Date;

  @Column({
    type: 'datetime',
    nullable: true,
    comment: 'When the lead exited this status',
  })
  exited_status_at: Date | null;

  @Column({ type: 'datetime', comment: 'SLA due date for this status' })
  sla_due_date: Date;

  @Column({ type: 'int', comment: 'SLA hours for this status' })
  sla_hours: number;

  @Column({
    default: false,
    comment: 'Whether SLA was met (completed within time)',
  })
  sla_met: boolean;

  @Column({
    default: false,
    comment: 'Whether SLA was breached',
  })
  sla_breached: boolean;

  @Column({
    type: 'datetime',
    nullable: true,
    comment: 'When SLA breach occurred',
  })
  breached_at: Date | null;

  @Column({
    default: false,
    comment: 'Whether this record was escalated',
  })
  escalated: boolean;

  @Column({
    type: 'datetime',
    nullable: true,
    comment: 'When escalation occurred',
  })
  escalated_at: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'escalated_to' })
  escalated_to_user: User | null;

  @Column({
    name: 'escalated_to',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  escalated_to: string | null;

  @Column({
    default: false,
    comment: 'Whether idle alert was sent',
  })
  idle_alert_sent: boolean;

  @Column({
    type: 'datetime',
    nullable: true,
    comment: 'When idle alert was sent',
  })
  idle_alert_sent_at: Date | null;

  @Column({
    type: 'datetime',
    nullable: true,
    comment: 'Last action taken on the lead',
  })
  last_action_at: Date | null;

  @Column({ type: 'text', nullable: true, comment: 'Additional notes' })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
