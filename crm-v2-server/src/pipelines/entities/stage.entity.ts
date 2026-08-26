import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
  OneToMany,
} from 'typeorm';
import { Pipeline } from './pipeline.entity';
import { Deal } from '../../deals/entities/deal.entity';

@Entity('stages')
@Unique(['pipeline_id', 'name'])
@Unique(['pipeline_id', 'order'])
@Index(['pipeline_id'])
export class Stage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Pipeline, (pipeline) => pipeline.stages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'pipeline_id' })
  pipeline: Pipeline;

  @Column({ name: 'pipeline_id', type: 'uuid' })
  pipeline_id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'int' })
  order: number;

  @Column({ name: 'sla_days', type: 'int', default: 0 })
  sla_days: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  probability: number;

  @Column({ type: 'varchar', length: 7, default: '#6366f1' })
  color: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToMany(() => Deal, (deal) => deal.current_stage)
  deals: Deal[];
}
