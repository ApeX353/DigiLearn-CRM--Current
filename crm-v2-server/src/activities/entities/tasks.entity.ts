import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, OneToMany } from "typeorm";
import { Activity } from "./activity.entity";
import { TaskComment } from "./task-comments.entity";

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  BACKLOG = 'backlog',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Entity('tasks')
@Index('idx_activity', ['activity_id'])
@Index('idx_status', ['status'])
@Index('idx_priority', ['priority'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  activity_id: string;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.TODO,
  })
  status: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  priority: TaskPriority;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ type: 'int', nullable: true })
  estimated_hours: number;

  @Column({ type: 'int', nullable: true })
  actual_hours: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  tags: string; // JSON array

  @Column({ type: 'text', nullable: true })
  checklist_items: string; // JSON array: [{id, text, completed}]

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @OneToOne(() => Activity, (activity) => activity.task, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'activity_id' })
  activity: Activity;

  @OneToMany(() => TaskComment, (comment) => comment.task)
  comments: TaskComment[];
}