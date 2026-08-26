import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { Deal } from './deal.entity';
import { User } from '../../users/entities/user.entity';

@Entity('deal_health_history')
@Index(['dealId'])
export class DealHealthHistory {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'deal_id', type: 'uuid' })
  dealId: string;

  @ManyToOne(() => Deal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deal_id' })
  deal: Deal;

  @Column({ name: 'overall_score', type: 'int' })
  overallScore: number;

  @Column({ name: 'stakeholder_engagement', type: 'int' })
  stakeholderEngagement: number;

  @Column({ name: 'timing', type: 'int' })
  timing: number;

  @Column({ name: 'competition', type: 'int' })
  competition: number;

  @Column({ name: 'budget', type: 'int' })
  budget: number;

  @Column({ name: 'calculated_by', type: 'uuid', nullable: true })
  calculatedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'calculated_by' })
  calculated_by_user: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
