import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Lead } from './lead.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Rep-triggered escalation on a stuck lead. The rep records the
 * reason + blockers; a manager later logs a resolution. Both
 * transitions are audited via timestamps + actor ids so compliance
 * dashboards (Phase 10) can report who escalated what, when, and
 * how it resolved.
 *
 * This is the LEAD-scoped entity. Deals get a parallel
 * DealEscalation when the feature lands there; keeping them as two
 * tables (rather than a polymorphic `escalations`) mirrors the
 * existing pattern of `LeadReversalRequest` + `DealRollbackRequest`
 * and keeps foreign keys strict.
 */

export enum EscalationReason {
  NO_RESPONSE = 'no_response',
  NO_DECISION_MAKER_ACCESS = 'no_decision_maker_access',
  BUDGET_RESISTANCE = 'budget_resistance',
  PROCUREMENT_BLOCK = 'procurement_block',
  POLITICAL_SENSITIVITY = 'political_sensitivity',
  COMPETITOR_ISSUE = 'competitor_issue',
  RELATIONSHIP_MISMATCH = 'relationship_mismatch',
  TECHNICAL_OBJECTION = 'technical_objection',
  INTERNAL_SCHOOL_DYNAMICS = 'internal_school_dynamics',
  GOVERNMENT_STAKEHOLDER_SENSITIVITY = 'government_stakeholder_sensitivity',
  OTHER = 'other',
}

export enum EscalationResolution {
  COACH = 'coach',
  JOIN_MEETING = 'join_meeting',
  REASSIGN = 'reassign',
  SENIOR_SUPPORT = 'senior_support',
  CHANGE_TACTIC = 'change_tactic',
  PAUSE = 'pause',
  APPROVED_DISQUALIFICATION = 'approved_disqualification',
}

@Entity('lead_escalations')
@Index('idx_lead_escalation_lead', ['lead_id'])
@Index('idx_lead_escalation_open', ['resolved_at'])
export class LeadEscalation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  lead_id: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ type: 'enum', enum: EscalationReason })
  reason: EscalationReason;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  blockers: string | null;

  @Column({ type: 'uuid' })
  escalated_by_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'escalated_by_id' })
  escalated_by: User;

  @Column({ type: 'timestamp', nullable: true })
  resolved_at: Date | null;

  @Column({ type: 'enum', enum: EscalationResolution, nullable: true })
  resolution: EscalationResolution | null;

  @Column({ type: 'text', nullable: true })
  resolution_notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  resolved_by_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by_id' })
  resolved_by: User | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
