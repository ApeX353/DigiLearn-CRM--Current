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

  @Column({ name: 'school_id', type: 'uuid', nullable: true })
  school_id: string | null;

  /** Campaign/event this lead originated from (e.g. NASH congress).
   *  Copied to the deal on conversion so campaign ROI can follow the
   *  full lifecycle. String-ref relation avoids an import cycle. */
  @Column({ name: 'source_campaign_id', type: 'uuid', nullable: true })
  source_campaign_id: string | null;

  @ManyToOne('Campaign', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_campaign_id' })
  source_campaign: any;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primary_contact_id' })
  primary_contact: Contact | null;

  @Column({
    name: 'primary_contact_id',
    type: 'uuid',
    nullable: true,
  })
  primary_contact_id: string | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'assigned_to' })
  assignee: User | null;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assigned_to: string | null;

  @ManyToOne(() => Stage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'stage_id' })
  stage: Stage | null;

  @Column({ name: 'stage_id', type: 'uuid', nullable: true })
  stage_id: string | null;

  @OneToMany(() => LeadStakeholder, (stakeholder) => stakeholder.lead)
  stakeholders: LeadStakeholder[];

  @OneToMany(() => Deal, (deal) => deal.lead)
  deals: Deal[];

  @OneToMany(() => Activity, (activity) => activity.lead)
  activities: Activity[];

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  last_contacted_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  converted_at: Date | null;

  // ===== SLA TRACKING FIELDS =====
  @Column({
    type: 'timestamp',
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
    type: 'timestamp',
    nullable: true,
    comment: 'Last action taken on this lead',
  })
  last_action_at: Date | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Last time an escalation email was sent for this lead',
  })
  last_escalated_at: Date | null;

  // Phase D — pre-breach nudge dedupe. The cron flips this when it
  // sends the rep a heads-up that a breach is N hours away. We DON'T
  // also use sla_breached for this because pre-breach is by
  // definition before the breach itself.
  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Last time a pre-breach SLA nudge was sent for this lead',
  })
  last_prebreach_nudge_at: Date | null;

  // ===== DEMO + COMMERCIAL INTENT =====
  // The Demo + Commercial-Intent feature added these. They're all
  // nullable / default false so existing rows remain valid after
  // synchronize. Together they answer two manager-grade questions:
  //   1. "What's the demo state of this lead?" → demo_status
  //   2. "Is this lead actually ready to become a deal?" →
  //      commercial_intent (flipped automatically when the rep
  //      records one of the documented signals on a demo or follow-up
  //      activity; never set manually).
  @Column({
    type: 'enum',
    enum: ['demo_scheduled', 'demo_completed'],
    nullable: true,
    comment: 'Demo lifecycle stage independent of the lead status enum',
  })
  demo_status: 'demo_scheduled' | 'demo_completed' | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When demo_status last changed',
  })
  demo_status_changed_at: Date | null;

  @Column({
    type: 'boolean',
    default: false,
    comment:
      'True once a clear commercial signal has been captured on a demo or follow-up activity. Gates the Create-Deal action.',
  })
  commercial_intent: boolean;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When commercial_intent flipped to true',
  })
  commercial_intent_at: Date | null;

  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
    comment: 'Which signal triggered commercial_intent (audit-friendly)',
  })
  commercial_intent_reason: string | null;

  /**
   * Set true by the Demo Follow-up SLA cron when a DEMO_DELIVERY
   * with outcome ∈ {COMPLETED, STRONG_INTEREST, FOLLOW_UP_NEEDED,
   * QUOTE_REQUESTED} has no follow-up activity within 48h. Cleared
   * automatically when the follow-up lands.
   */
  @Column({
    type: 'boolean',
    default: false,
    comment: 'Demo Follow-up SLA breached (no follow-up within 48h of delivery)',
  })
  demo_followup_sla_breached: boolean;

  // ===== TEMPERATURE SCORING =====
  @Column({
    type: 'enum',
    enum: ['hot', 'warm', 'cold'],
    nullable: true,
    comment: 'Lead temperature classification',
  })
  temperature: 'hot' | 'warm' | 'cold' | null;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    comment: 'Temperature score 0-100',
  })
  temperature_score: number | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When temperature was last calculated',
  })
  temperature_last_calculated: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at: Date | null;
}
