import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Deal } from './deal.entity';
import { User } from '../../users/entities/user.entity';

@Entity('deal_stage_history')
@Index(['dealId'])
@Index(['movedBy'])
export class DealStageHistory {
  @PrimaryColumn('varchar', { length: 36 })
  id: string;

  /* ========================
     RELATIONS
  ======================== */

  @Column({ name: 'deal_id', type: 'varchar', length: 36 })
  dealId: string;

  @ManyToOne(() => Deal, deal => deal.stageHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deal_id' })
  deal: Deal;

  @Column({ name: 'moved_by', type: 'varchar', length: 36, nullable: true })
  movedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'moved_by' })
  moved_by: User | null;

  /* ========================
     STAGE TRANSITION
  ======================== */

  @Column({ name: 'from_status', type: 'varchar', length: 255, nullable: true })
  fromStatus?: string;

  @Column({ name: 'to_status', type: 'varchar', length: 255 })
  toStatus: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({
    name: 'moved_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  movedAt: Date;

  /* ========================
     SLA / METRICS
  ======================== */

  @Column({ name: 'sla_compliant', type: 'boolean', default: true })
  slaCompliant: boolean;

  @Column({ name: 'time_in_stage', type: 'int', nullable: true })
  timeInStage?: number;

  @Column({ name: 'sla_deadline_was', type: 'timestamp', nullable: true })
  slaDeadlineWas?: Date;
}
