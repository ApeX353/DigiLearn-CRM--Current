import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
  OneToMany,
} from 'typeorm';
import { LEAD_SOURCES, LEAD_STATUSES } from '../constants';
import type { LeadSource, LeadStatus } from '../constants';
import { User } from '../../users/entities/user.entity';
import { School } from '../../schools/entities/schools.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import { Stage } from '../../pipelines/entities/stage.entity';
import { LeadStakeholder } from './lead-stakeholders.entity';
import { Deal } from '../../deals/entities/deal.entity';
import { Activity } from '../../activities/entities/activity.entity';

@Entity('leads')
@Index(['lead_name'])
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  lead_name: string;

  @Column({
    type: 'enum',
    enum: LEAD_STATUSES,
    default: 'New',
  })
  status: LeadStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({
    type: 'enum',
    enum: LEAD_SOURCES,
    default: 'Other',
  })
  source: LeadSource;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  estimated_value: number | null;

  @ManyToOne(() => School, (school) => school.leads, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'school_id' })
  school: School | null;

  @Column({ name: 'school_id', type: 'varchar', length: 36, nullable: true })
  school_id: string | null;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primary_contact_id' })
  primary_contact: Contact | null;

  @Column({
    name: 'primary_contact_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  primary_contact_id: string | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'assigned_to' })
  assignee: User | null;

  @Column({ name: 'assigned_to', type: 'varchar', length: 36, nullable: true })
  assigned_to: string | null;

  @ManyToOne(() => Stage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'stage_id' })
  stage: Stage | null;

  @Column({ name: 'stage_id', type: 'varchar', length: 36, nullable: true })
  stage_id: string | null;

  @OneToMany(() => LeadStakeholder, (stakeholder) => stakeholder.lead)
  stakeholders: LeadStakeholder[];

  @OneToMany(() => Deal, (deal) => deal.lead)
  deals: Deal[];

  @OneToMany(() => Activity, (activity) => activity.lead)
  activities: Activity[];

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'datetime', nullable: true })
  last_contacted_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  converted_at: Date | null;

  // ===== SLA TRACKING FIELDS =====
  @Column({
    type: 'datetime',
    nullable: true,
    comment: 'Current SLA due date based on status',
  })
  current_sla_due_date: Date | null;

  @Column({
    default: false,
    comment: 'Whether current SLA is breached',
  })
  sla_breached: boolean;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Count of SLA breaches for this lead',
  })
  sla_breach_count: number;

  @Column({
    type: 'datetime',
    nullable: true,
    comment: 'Last action taken on this lead',
  })
  last_action_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at: Date | null;
}
