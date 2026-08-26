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
  OneToMany,
} from 'typeorm';
import { Activity } from './activity.entity';

@Entity('activity_comments')
@Index('idx_activity_comments_activity', ['activity_id'])
@Index('idx_activity_comments_commented_by', ['commented_by_id'])
@Index('idx_activity_comments_parent', ['parent_comment_id'])
export class ActivityComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  activity_id: string;

  @Column({ type: 'text' })
  comment: string;

  @Column({ type: 'uuid' })
  commented_by_id: string;

  // For threaded comments
  @Column({ type: 'uuid', nullable: true })
  parent_comment_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  deleted_at: Date;
  // Relations
  @ManyToOne(() => Activity, (activity) => activity.comments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'activity_id' })
  activity: Activity;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'commented_by_id' })
  commented_by: User;

  @ManyToOne(() => ActivityComment, (comment) => comment.replies, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parent_comment_id' })
  parent_comment: ActivityComment;

  @OneToMany(() => ActivityComment, (comment) => comment.parent_comment)
  replies: ActivityComment[];
}
