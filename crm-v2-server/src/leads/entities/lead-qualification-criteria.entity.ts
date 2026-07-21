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
import { Lead } from './lead.entity';
import {
  TIMELINE_TYPES,
  BUDGET_INDICATORS,
  type TimelineType,
  type BudgetIndicator,
} from '../constants';

export interface QualificationChecklist {
  phone_verified: boolean;
  email_verified: boolean;
  province_verified: boolean;
}

export interface QualificationNeeds {
  id: string;
  name: string;
  price: number;
  tax: number;
  discount: number;
}

@Entity('lead_qualification_criteria')
@Index(['lead_id'])
export class LeadQualificationCriteria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id', type: 'varchar', length: 36 })
  lead_id: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  // ===== NEED ASSESSMENT =====

  @Column({ type: 'text', nullable: true })
  needs: string | null;

  @Column({ type: 'json', nullable: true })
  qualification_needs: QualificationNeeds[] | null

  @Column({ default: false })
  has_needs: boolean;

  // ===== PLAN TYPE =====

  @Column({ type: 'varchar', nullable: true })
  plan_type: string | null;

  @Column({ default: false })
  has_plan_type: boolean;

  // ===== TIMELINE =====

  @Column({ type: 'enum', enum: TIMELINE_TYPES, nullable: true })
  timeline_type: TimelineType | null;

  @Column({ type: 'date', nullable: true })
  specific_date: Date | null;

  @Column({ default: false })
  has_timeline: boolean;

  // ===== BUDGET =====

  @Column({ type: 'enum', enum: BUDGET_INDICATORS, nullable: true })
  budget_indicator: BudgetIndicator | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  budget_amount: number | null;

  @Column({ default: false })
  has_budget: boolean;

  // ===== AUTHORITY / DECISION MAKER =====

  @Column({ default: false })
  has_verified_contact: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  decision_maker_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  decision_maker_title: string | null;

  @Column({ default: false })
  has_influential_contact: boolean;

  // ===== CHECKLIST (static JSON object) =====

  @Column({
    type: 'json',
  })
  checklist: QualificationChecklist;

  // ===== QUALIFICATION STATUS =====

  @Column({ type: 'int', default: 0 })
  qualification_score: number;

  @Column({ default: false })
  is_qualified: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
