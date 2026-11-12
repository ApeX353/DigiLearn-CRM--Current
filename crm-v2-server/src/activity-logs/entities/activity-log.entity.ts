import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('activity_logs')
@Index(['entity', 'entity_id'])
@Index(['actioned_by'])
@Index(['created_at'])
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  entity: string;

  @Column({ type: 'uuid' })
  entity_id: string;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'text' })
  summary: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actioned_by' })
  user: User;

  @Column({ name: 'actioned_by', type: 'uuid', nullable: true })
  actioned_by: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  old_values: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  new_values: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
