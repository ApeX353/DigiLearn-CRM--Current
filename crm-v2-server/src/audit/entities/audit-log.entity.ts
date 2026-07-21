import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('audit_logs')
@Index(['entity_type', 'entity_id'])
@Index(['user_id'])
@Index(['created_at'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  entity_type: string;

  @Column({ type: 'varchar', length: 50 })
  entity_id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  user_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 20 })
  action: 'create' | 'update' | 'delete';

  @Column({ type: 'json', nullable: true })
  changes: Array<{ field: string; old_value: any; new_value: any }> | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
