import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Deal } from './deal.entity';

@Entity('deal_competitors')
@Index(['deal_id'])
export class DealCompetitor {
  @PrimaryColumn('varchar', { length: 36 })
  id: string;

  @Column({ name: 'deal_id', type: 'varchar', length: 36 })
  deal_id: string;

  @ManyToOne(() => Deal, (deal) => deal.competitors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deal_id' })
  deal: Deal;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  strengths: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  weaknesses: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  price: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  threat_level: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
