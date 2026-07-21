import { User } from '../../users/entities/user.entity';
import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Task } from './tasks.entity';

@Entity('task_comments')
@Index('idx_task_comments_task', ['task_id'])
@Index('idx_task_comments_commented_by', ['commented_by_id'])
export class TaskComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  task_id: string;

  @Column({ type: 'text' })
  comment: string;

  @Column({ type: 'uuid' })
  commented_by_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @ManyToOne(() => Task, (task) => task.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'commented_by_id' })
  commented_by: User;
}
