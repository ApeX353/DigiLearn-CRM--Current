import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Lead } from '../../leads/entities/lead.entity';
import { School } from '../../schools/entities/schools.entity';
import { DealStageHistory } from './deal-stage-history.entity';
import { DealRollbackRequest } from './deal-rollback-request.entity';
import { Stage } from '../../pipelines/entities/stage.entity';
import { Pipeline } from '../../pipelines/entities/pipeline.entity';
import { Activity } from '../../activities/entities/activity.entity';
import { DealCompetitor } from './deal-competitor.entity';
import { Quote } from '../../quotes/entities/quote.entity';
import { Invoice } from '../../invoices/entities/invoice.entity';

export enum DealCloseStatus {
  ONGOING = 'ongoing',
  WON = 'won',
  LOST = 'lost',
}

@Entity('deals')
@Index(['lead_id'])
@Index(['current_stage_id'])
@Index(['assigned_to'])
export class Deal {
  @PrimaryColumn('varchar', { length: 36 })
  id: string;

  /* ========================
     RELATIONS
  ======================== */

  @Column({ name: 'lead_id', type: 'varchar', length: 36 })
  lead_id: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ name: 'school_id', type: 'varchar', length: 36 })
  school_id: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ name: 'current_stage_id', type: 'varchar', length: 36 })
  current_stage_id: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'current_stage_id' })
  current_stage: Stage;
  
  @Column({ name: 'pipeline_id', type: 'varchar', length: 36 })
  pipeline_id: string;

  @ManyToOne(() => Pipeline, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pipeline_id' })
  pipeline: Pipeline;

  @Column({ name: 'assigned_to', type: 'varchar', length: 36, nullable: true })
  assigned_to: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to' })
  assigned_user: User | null;

  /* ========================
     CORE FIELDS
  ======================== */

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  value: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'current_status', type: 'varchar', length: 255 })
  currentStatus: string;

  @Column({
    name: 'current_stage_since',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  currentStageSince: Date;

  @Column({ type: 'int', default: 0 })
  probability: number;

  @Column({ type: 'int', default: 1000 })
  position: number;

  @Column({ name: 'rollback_count', type: 'int', default: 0 })
  rollback_count: number;

  @Column({ name: 'expected_close_date', type: 'timestamp', nullable: true })
  expectedCloseDate?: Date;

  @Column({ name: 'actual_close_date', type: 'timestamp', nullable: true })
  actualCloseDate?: Date;

  @Column({ name: 'lost_reason', type: 'text', nullable: true })
  lostReason?: string;

  /* ========================
     HEALTH / RISK SCORING
  ======================== */

  @Column({ name: 'health_score', type: 'int', default: 0 })
  healthScore: number;

  @Column({ name: 'health_score_stakeholder_engagement', type: 'int', default: 0 })
  stakeholderEngagementScore: number;

  @Column({ name: 'health_score_timing', type: 'int', default: 0 })
  timingScore: number;

  @Column({ name: 'health_score_competition', type: 'int', default: 0 })
  competitionScore: number;

  @Column({ name: 'health_score_budget', type: 'int', default: 0 })
  budgetScore: number;

  @Column({
    name: 'health_score_last_calculated',
    type: 'timestamp',
    nullable: true,
  })
  healthScoreLastCalculated?: Date;

  /* ========================
     CLOSURE
  ======================== */

  @Column({
    name: 'close_status',
    type: 'enum',
    enum: DealCloseStatus,
    default: DealCloseStatus.ONGOING,
  })
  closeStatus: DealCloseStatus;

  /* ========================
     TIMESTAMPS
  ======================== */

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  /* ========================
     HISTORY
  ======================== */

  @OneToMany(() => DealStageHistory, history => history.deal)
  stageHistory: DealStageHistory[];

  @OneToMany(() => DealRollbackRequest, request => request.deal)
  rollbackRequests: DealRollbackRequest[];

  @OneToMany(() => Activity, (activity) => activity.deal)
  activities: Activity[];

  @OneToMany(() => DealCompetitor, (competitor) => competitor.deal)
  competitors: DealCompetitor[];

  @OneToMany(() => Quote, (quote) => quote.deal)
  quotes: Quote[];

  @OneToMany(() => Invoice, (invoice) => invoice.deal)
  invoices: Invoice[];
}

